import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { hashOwnerToken } from "./ownership-store.mjs";
import { generateOwnerToken, getOwnerTokenFromRequest, buildOwnerCookie, DEFAULT_COOKIE_NAME } from "./cookie.mjs";
import { PublicResourceGuard } from "./resource-guard.mjs";

const SESSION_ID_RE = /^snn-agent-[a-z0-9-]{8,80}$/;
const RUN_ID_RE = /^snn-run-[a-z0-9-]{8,80}$/;

const PUBLIC_SSE_EVENTS = new Set([
  "run.started", "reasoning.started", "reasoning.delta", "reasoning.completed",
  "message.started", "message.delta", "message.completed", "tool.started",
  "tool.completed", "tool.failed", "approval.required", "run.completed", "run.failed", "run.cancelled",
]);

export function createPublicAgentBff({
  config,
  publicConfig,
  controller,
  workspaceManager,
  metadataStore,
  runtimeRegistry,
  ingestionService,
  ownershipStore,
  workspaceBase,
  logger = console,
}) {
  if (!publicConfig) throw new TypeError("publicConfig is required");
  const guard = new PublicResourceGuard(publicConfig.limits);
  const cookieName = publicConfig.cookieName ?? DEFAULT_COOKIE_NAME;
  const cookieSecure = publicConfig.cookieSecure ?? false;
  const ttlMs = publicConfig.sessionTtlMs ?? 24 * 60 * 60 * 1000;

  let lastSweepMs = 0;
  const SWEEP_INTERVAL_MS = 60_000;

  async function maybeSweep() {
    const now = Date.now();
    if (now - lastSweepMs < SWEEP_INTERVAL_MS) return;
    lastSweepMs = now;
    try {
      const expired = await ownershipStore.sweepExpired(now, ttlMs);
      for (const sessionId of expired) {
        try { await cleanupSession(sessionId, { silent: true }); } catch {}
      }
    } catch {}
  }

  function isPublicAgentPath(path) {
    return path === "/api/agent/sessions" || path.startsWith("/api/agent/sessions/");
  }

  function corsHeaders(origin, allowed) {
    if (!origin || !allowed) return {};
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      vary: "Origin",
    };
  }

  function isOriginAllowed(request) {
    const origin = request.headers.origin;
    if (!origin) return { allowed: false, origin: undefined, missing: true };
    const allowed = config.allowedOrigins.includes(origin);
    return { allowed, origin, missing: false };
  }

  function sendJson(response, status, body, originInfo) {
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(originInfo ? corsHeaders(originInfo.origin, originInfo.allowed) : {}),
    };
    response.writeHead(status, headers);
    response.end(JSON.stringify(body));
  }

  function sendError(response, error, originInfo, pathForLog) {
    const status = Number.isInteger(error?.status) ? error.status : publicErrorStatus(error?.code);
    const code = typeof error?.code === "string" ? error.code : status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR";
    const message = status >= 500 ? "Agent service is unavailable" : status === 429 ? error.message : error?.message || "Request failed";
    logger.error?.(JSON.stringify({ component: "public-agent-bff", path: pathForLog, status, code }));
    if (!response.headersSent) {
      sendJson(response, status, { error: { code, message } }, originInfo);
    } else if (!response.writableEnded) {
      response.end();
    }
  }

  function publicErrorStatus(code) {
    if (["AGENT_SESSION_NOT_FOUND", "AGENT_ATTACHMENT_NOT_FOUND", "AGENT_FILE_NOT_FOUND"].includes(code)) return 404;
    if (code === "AGENT_FILE_MUTATED") return 409;
    if (["AGENT_FILE_INVALID", "AGENT_FILE_REQUIRED", "AGENT_FILE_CONFLICT", "AGENT_ATTACHMENT_UNSUPPORTED"].includes(code)) return 400;
    if (["AGENT_FILE_TOO_LARGE", "AGENT_WORKSPACE_QUOTA_EXCEEDED", "REQUEST_TOO_LARGE"].includes(code)) return 413;
    if (code === "AGENT_RUNTIME_INCOMPATIBLE") return 503;
    if (typeof code === "string" && code.startsWith("AGENT_PUBLIC_")) return 429;
    return 500;
  }

  function getOwnerToken(request) {
    return getOwnerTokenFromRequest(request, cookieName);
  }

  function publicFileForSession(sessionId, file) {
    return {
      ...file,
      downloadUrl: `/api/agent/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(file.fileId)}`,
    };
  }

  function issueOwnerToken(response) {
    const token = generateOwnerToken();
    const cookie = buildOwnerCookie(token, { cookieName, secure: cookieSecure, path: "/api/agent", maxAgeSeconds: Math.floor(ttlMs / 1000) });
    response.setHeader("set-cookie", cookie);
    return token;
  }

  async function ensureOwnerToken(request, response) {
    let token = getOwnerToken(request);
    if (!token) {
      token = issueOwnerToken(response);
      return { token, issued: true };
    }
    // refresh sliding window
    const cookie = buildOwnerCookie(token, { cookieName, secure: cookieSecure, path: "/api/agent", maxAgeSeconds: Math.floor(ttlMs / 1000) });
    const existing = response.getHeader("set-cookie");
    if (existing) {
      response.setHeader("set-cookie", Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
    } else {
      response.setHeader("set-cookie", cookie);
    }
    return { token, issued: false };
  }

  async function verifyOwnership(sessionId, token) {
    return ownershipStore.verify(sessionId, token);
  }

  async function resolveWorkspaceForSession(sessionId) {
    const binding = await metadataStore.get(sessionId);
    const workspaceId = binding.workspaceId;
    let workspace = workspaceManager.get(workspaceId);
    if (!workspace) {
      const candidateRoot = join(workspaceBase, workspaceId);
      try {
        workspace = await workspaceManager.register(candidateRoot, { id: workspaceId });
      } catch (e) {
        workspace = workspaceManager.get(workspaceId);
        if (!workspace) throw e;
      }
    }
    return { workspace, binding };
  }

  async function countGlobalActiveRuns() {
    try {
      const allIds = await ownershipStore.listAllIds();
      let count = 0;
      for (const sid of allIds) {
        if (controller.activeRunId(sid)) count += 1;
      }
      return count;
    } catch {
      return 0;
    }
  }

  async function countPerOwnerActiveRuns(ownerHash) {
    try {
      const owned = await ownershipStore.listByOwner(ownerHash);
      let count = 0;
      for (const rec of owned) {
        if (controller.activeRunId(rec.sessionId)) count += 1;
      }
      return count;
    } catch { return 0; }
  }

  async function cleanupSession(sessionId, { silent = false } = {}) {
    let binding;
    try { binding = await metadataStore.get(sessionId); } catch {}
    if (binding) {
      const workspaceId = binding.workspaceId;
      try {
        const runId = controller.activeRunId(sessionId);
        if (runId) await controller.cancel(sessionId, runId).catch(() => {});
      } catch {}
      try {
        if (runtimeRegistry) await runtimeRegistry.dispose(workspaceId).catch(() => {});
      } catch {}
      try {
        const workspace = workspaceManager.get(workspaceId);
        const root = workspace ? workspace.root : join(workspaceBase, workspaceId);
        await rm(root, { recursive: true, force: true });
        try { workspaceManager.delete(workspaceId); } catch {}
      } catch {}
      try { await metadataStore.delete(sessionId); } catch {}
    } else {
      try { await metadataStore.delete(sessionId); } catch {}
      // also try to clean workspace dir if exists
      try { await rm(join(workspaceBase, sessionId.replace("snn-agent-", "snn-workspace-")), { recursive: true, force: true }); } catch {}
    }
    try { await ownershipStore.delete(sessionId); } catch {}
    if (!silent) logger.info?.(JSON.stringify({ component: "public-agent-bff", event: "session_deleted", sessionId }));
  }

  async function handlePublicRequest(request, response) {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const path = url.pathname;
    const originInfo = isOriginAllowed(request);
    const method = request.method;

    if (!publicConfig.enabled) {
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Not found" } }, originInfo);
      return true;
    }

    if (!isPublicAgentPath(path)) return false;

    // CORS preflight
    if (method === "OPTIONS") {
      if (!originInfo.allowed) {
        sendJson(response, 403, { error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" } }, originInfo);
        return true;
      }
      response.writeHead(204, {
        "access-control-allow-origin": originInfo.origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, x-snn-file-name, x-snn-file-content-type, cookie, origin",
        vary: "Origin",
      });
      response.end();
      return true;
    }

    // POST /api/agent/sessions
    if (path === "/api/agent/sessions" && method === "POST") {
      if (!originInfo.allowed) { sendJson(response, 403, { error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" } }, originInfo); return true; }
      await maybeSweep();
      const { token } = await ensureOwnerToken(request, response);
      const ownerHash = hashOwnerToken(token);
      const globalCount = await ownershipStore.countAll();
      const perOwnerCount = await ownershipStore.countByOwner(ownerHash);
      try { await guard.checkSessionCreate({ globalCount, perOwnerCount }); } catch (e) { sendError(response, e, originInfo, path); return true; }

      let body;
      try { body = await readJsonBody(request, config.agent.maxBodyBytes); } catch (e) { sendError(response, e, originInfo, path); return true; }
      if (body !== undefined && (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0)) {
        sendError(response, Object.assign(new Error("Invalid request"), { status: 400, code: "INVALID_REQUEST" }), originInfo, path);
        return true;
      }

      let newWorkspaceId;
      let createdSessionId;
      try {
        const workspaceId = `snn-workspace-${randomUUID()}`;
        const workspaceRoot = join(workspaceBase, workspaceId);
        await mkdir(workspaceRoot, { recursive: true });
        await workspaceManager.register(workspaceRoot, { id: workspaceId });
        newWorkspaceId = workspaceId;
        const result = await controller.createSession({ workspaceId, skillId: "workspace-editor" });
        createdSessionId = result.sessionId;
        await ownershipStore.create(createdSessionId, ownerHash);
        await ownershipStore.touch(createdSessionId);
        if (!response.headersSent) {
          response.writeHead(201, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...corsHeaders(originInfo.origin, originInfo.allowed),
          });
          response.end(JSON.stringify({ sessionId: createdSessionId, status: "created" }));
        }
      } catch (error) {
        if (createdSessionId) {
          try { await cleanupSession(createdSessionId, { silent: true }); } catch {}
        } else if (newWorkspaceId) {
          try {
            const wk = workspaceManager.get(newWorkspaceId);
            const root = wk ? wk.root : join(workspaceBase, newWorkspaceId);
            await rm(root, { recursive: true, force: true });
            try { workspaceManager.delete(newWorkspaceId); } catch {}
            if (runtimeRegistry) await runtimeRegistry.dispose(newWorkspaceId).catch(() => {});
          } catch {}
        }
        sendError(response, error, originInfo, path);
      }
      return true;
    }

    // GET /api/agent/sessions (list own)
    if (path === "/api/agent/sessions" && method === "GET") {
      if (!originInfo.missing && !originInfo.allowed) { sendJson(response, 403, { error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" } }, originInfo); return true; }
      const token = getOwnerToken(request);
      if (!token) { sendJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Ownership required" } }, originInfo); return true; }
      const ownerHash = hashOwnerToken(token);
      try {
        const list = await ownershipStore.listByOwner(ownerHash);
        const safe = list.map((r) => ({ sessionId: r.sessionId, createdAt: r.createdAt, lastAccessAt: r.lastAccessAt }));
        sendJson(response, 200, { sessions: safe }, originInfo);
      } catch (e) { sendError(response, e, originInfo, path); }
      return true;
    }

    // Special handler for cancel: POST /api/agent/sessions/:sessionId/runs/:runId/cancel
    const cancelMatch = /^\/api\/agent\/sessions\/([^/]+)\/runs\/([^/]+)\/cancel$/.exec(path);
    if (cancelMatch && method === "POST") {
      const [, sessionId, runId] = cancelMatch;
      if (!SESSION_ID_RE.test(sessionId) || !RUN_ID_RE.test(runId)) {
        sendError(response, Object.assign(new Error("Invalid id"), { status: 400, code: sessionId.match(SESSION_ID_RE) ? "INVALID_RUN_ID" : "INVALID_SESSION_ID" }), originInfo, path);
        return true;
      }
      if (!originInfo.allowed) { sendJson(response, 403, { error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" } }, originInfo); return true; }
      const token = getOwnerToken(request);
      if (!token) { sendError(response, Object.assign(new Error("Agent session is not available"), { status: 404, code: "AGENT_SESSION_NOT_FOUND" }), originInfo, path); return true; }
      try { await verifyOwnership(sessionId, token); } catch (e) { sendError(response, e, originInfo, path); return true; }
      await ownershipStore.touch(sessionId).catch(() => {});
      try {
        await controller.cancel(sessionId, runId);
        sendJson(response, 202, { sessionId, runId, status: "cancellation_requested" }, originInfo);
      } catch (e) { sendError(response, e, originInfo, path); }
      return true;
    }

    // DELETE /api/agent/sessions/:sessionId
    const deleteSessionMatch = /^\/api\/agent\/sessions\/([^/]+)$/.exec(path);
    if (deleteSessionMatch && method === "DELETE") {
      const sessionId = deleteSessionMatch[1];
      if (!SESSION_ID_RE.test(sessionId)) { sendError(response, Object.assign(new Error("Invalid session"), { status: 400, code: "INVALID_SESSION_ID" }), originInfo, path); return true; }
      if (!originInfo.allowed) { sendJson(response, 403, { error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" } }, originInfo); return true; }
      const token = getOwnerToken(request);
      if (!token) { sendError(response, Object.assign(new Error("Agent session is not available"), { status: 404, code: "AGENT_SESSION_NOT_FOUND" }), originInfo, path); return true; }
      try { await verifyOwnership(sessionId, token); } catch (e) { sendError(response, e, originInfo, path); return true; }
      try {
        await cleanupSession(sessionId);
        sendJson(response, 200, { sessionId, status: "deleted" }, originInfo);
      } catch (e) { sendError(response, e, originInfo, path); }
      return true;
    }

    // All other session sub-routes need sessionId
    const sessionSubMatch = /^\/api\/agent\/sessions\/([^/]+)\/(files|runs)(?:\/([^/]+))?$/.exec(path);
    if (!sessionSubMatch) return false;
    const [, sessionId, sub, subId] = sessionSubMatch;
    if (!SESSION_ID_RE.test(sessionId)) {
      sendError(response, Object.assign(new Error("Invalid session"), { status: 400, code: "INVALID_SESSION_ID" }), originInfo, path);
      return true;
    }

    // For mutating, require origin; for GET, allow but check if present
    if (sub === "files" || sub === "runs") {
      if (method === "POST" || method === "DELETE") {
        if (!originInfo.allowed) { sendJson(response, 403, { error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" } }, originInfo); return true; }
      } else if (method === "GET") {
        if (!originInfo.missing && !originInfo.allowed) { sendJson(response, 403, { error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" } }, originInfo); return true; }
      }
      const token = getOwnerToken(request);
      if (!token) {
        sendError(response, Object.assign(new Error("Agent session is not available"), { status: 404, code: "AGENT_SESSION_NOT_FOUND" }), originInfo, path);
        return true;
      }
      try { await verifyOwnership(sessionId, token); } catch (e) { sendError(response, e, originInfo, path); return true; }
      await ownershipStore.touch(sessionId).catch(() => {});
      await maybeSweep();

      if (sub === "files") {
        if (method === "GET" && !subId) {
          try {
            const { workspace } = await resolveWorkspaceForSession(sessionId);
            const files = await ingestionService.list(workspace.id);
            sendJson(response, 200, { files: files.map((file) => publicFileForSession(sessionId, file)) }, originInfo);
          } catch (e) { sendError(response, e, originInfo, path); }
          return true;
        }
        if (method === "GET" && subId) {
          try {
            const { workspace } = await resolveWorkspaceForSession(sessionId);
            const { file, bytes } = await ingestionService.readFile({ workspaceId: workspace.id, fileId: subId });
            const fallbackName = file.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/[\\\"]+/g, "_") || "download";
            const disposition = `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`;
            response.writeHead(200, {
              "content-type": file.contentType || "application/octet-stream",
              "content-length": String(bytes.length),
              "content-disposition": disposition,
              "cache-control": "no-store",
              ...corsHeaders(originInfo.origin, originInfo.allowed),
            });
            response.end(bytes);
          } catch (e) { sendError(response, e, originInfo, path); }
          return true;
        }
        if (method === "DELETE" && subId) {
          const fileId = subId;
          try {
            const { workspace } = await resolveWorkspaceForSession(sessionId);
            await ingestionService.remove({ workspaceId: workspace.id, fileId });
            response.writeHead(204, corsHeaders(originInfo.origin, originInfo.allowed));
            response.end();
          } catch (e) { sendError(response, e, originInfo, path); }
          return true;
        }
        if (method === "POST" && !subId) {
          const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
          try {
            const { workspace } = await resolveWorkspaceForSession(sessionId);
            if (contentType === "application/octet-stream") {
              const originalName = request.headers["x-snn-file-name"];
              if (typeof originalName !== "string" || originalName.length === 0) throw Object.assign(new Error("Filename is required"), { status: 400, code: "AGENT_FILE_INVALID" });
              const result = await ingestionService.ingest({ workspaceId: workspace.id, originalName, contentType: request.headers["x-snn-file-content-type"], body: request });
              sendJson(response, 201, { file: publicFileForSession(sessionId, result) }, originInfo);
            } else if (contentType?.startsWith("multipart/form-data")) {
              const boundaryMatch = request.headers["content-type"].match(/boundary=([^;]+)/);
              if (!boundaryMatch) throw Object.assign(new Error("Invalid multipart"), { status: 400, code: "INVALID_REQUEST" });
              const boundary = boundaryMatch[1].replace(/^"|"$/g, "");
              const fileData = await parseMultipartFile(request, boundary, 10 * 1024 * 1024);
              if (!fileData) throw Object.assign(new Error("File is required"), { status: 400, code: "AGENT_FILE_REQUIRED" });
              const result = await ingestionService.ingest({ workspaceId: workspace.id, originalName: fileData.filename, contentType: fileData.contentType, body: (async function*(){ yield fileData.data; })() });
              sendJson(response, 201, { file: publicFileForSession(sessionId, result) }, originInfo);
            } else {
              throw Object.assign(new Error("Invalid content type"), { status: 400, code: "INVALID_CONTENT_TYPE" });
            }
          } catch (e) { sendError(response, e, originInfo, path); }
          return true;
        }
        sendError(response, Object.assign(new Error("Method not allowed"), { status: 405, code: "METHOD_NOT_ALLOWED" }), originInfo, path);
        return true;
      }

      if (sub === "runs") {
        if (method === "POST" && !subId) {
          let body;
          try { body = await readJsonBody(request, config.agent.maxBodyBytes); } catch (e) { sendError(response, e, originInfo, path); return true; }
          if (!body || typeof body.message !== "string") {
            sendError(response, Object.assign(new Error("Invalid request"), { status: 400, code: "INVALID_REQUEST" }), originInfo, path);
            return true;
          }
          const keys = Object.keys(body);
          if (keys.some(k => k !== "message" && k !== "attachments")) {
            sendError(response, Object.assign(new Error("Invalid request"), { status: 400, code: "INVALID_REQUEST" }), originInfo, path);
            return true;
          }
          try {
            const ownerHash = hashOwnerToken(token);
            const globalActiveRuns = await countGlobalActiveRuns();
            const perOwnerActiveRuns = await countPerOwnerActiveRuns(ownerHash);
            await guard.checkRunStart({ globalActiveRuns, perOwnerActiveRuns });
          } catch (e) { sendError(response, e, originInfo, path); return true; }

          try {
            const run = await controller.startRun(sessionId, { message: body.message, attachments: body.attachments });
            await proxySse(request, response, controller, sessionId, run, originInfo);
          } catch (e) { sendError(response, e, originInfo, path); }
          return true;
        }
        sendError(response, Object.assign(new Error("Method not allowed"), { status: 405, code: "METHOD_NOT_ALLOWED" }), originInfo, path);
        return true;
      }
    }

    return false;
  }

  async function readJsonBody(request, maxBytes) {
    if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw Object.assign(new Error("Invalid content type"), { status: 400, code: "INVALID_CONTENT_TYPE" });
    }
    const chunks = [];
    let len = 0;
    for await (const chunk of request) {
      len += chunk.length;
      if (len > maxBytes) throw Object.assign(new Error("Request too large"), { status: 413, code: "REQUEST_TOO_LARGE" });
      chunks.push(chunk);
    }
    if (len === 0) return undefined;
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw Object.assign(new Error("Invalid JSON"), { status: 400, code: "MALFORMED_JSON" }); }
  }

  async function parseMultipartFile(request, boundary, maxBytes) {
    const chunks = [];
    let len = 0;
    for await (const chunk of request) {
      len += chunk.length;
      if (len > maxBytes) throw Object.assign(new Error("Request too large"), { status: 413, code: "REQUEST_TOO_LARGE" });
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const delimiter = Buffer.from(`--${boundary}`, "ascii");
    const separator = Buffer.from("\r\n\r\n", "ascii");
    let position = 0;
    for (;;) {
      const boundaryIndex = buffer.indexOf(delimiter, position);
      if (boundaryIndex === -1) return null;
      let partStart = boundaryIndex + delimiter.length;
      if (buffer.subarray(partStart, partStart + 2).equals(Buffer.from("--", "ascii"))) return null;
      if (!buffer.subarray(partStart, partStart + 2).equals(Buffer.from("\r\n", "ascii"))) return null;
      partStart += 2;
      const nextBoundary = buffer.indexOf(delimiter, partStart);
      if (nextBoundary === -1) return null;
      let partEnd = nextBoundary;
      if (buffer.subarray(partEnd - 2, partEnd).equals(Buffer.from("\r\n", "ascii"))) partEnd -= 2;
      const part = buffer.subarray(partStart, partEnd);
      const headerEnd = part.indexOf(separator);
      if (headerEnd !== -1) {
        const headers = part.subarray(0, headerEnd).toString("utf8");
        const disposition = parseContentDisposition(headers);
        if (disposition?.name === "file" && disposition.filename) {
          const contentType = /^content-type:\s*([^\r\n]+)/im.exec(headers)?.[1].trim() ?? "application/octet-stream";
          return { filename: disposition.filename, contentType, data: part.subarray(headerEnd + separator.length) };
        }
      }
      position = nextBoundary;
    }
  }

  function parseContentDisposition(headers) {
    const value = /^content-disposition:\s*([^\r\n]+)/im.exec(headers)?.[1];
    if (!value || !/^form-data(?:;|$)/i.test(value)) return null;
    const parameters = new Map();
    for (const match of value.matchAll(/;\s*([^=;\s]+)=(?:"([^"]*)"|([^;\s]*))/g)) {
      parameters.set(match[1].toLowerCase(), match[2] ?? match[3]);
    }
    const encodedFilename = parameters.get("filename*");
    let filename = parameters.get("filename");
    if (encodedFilename?.toLowerCase().startsWith("utf-8''")) {
      try { filename = decodeURIComponent(encodedFilename.slice(7)); } catch { return null; }
    }
    return { name: parameters.get("name"), filename };
  }

  async function proxySse(request, response, controller, sessionId, run, originInfo) {
    let disconnected = false;
    let terminalSeen = false;
    const onClose = () => {
      if (!response.writableEnded) {
        disconnected = true;
        controller.cancel(sessionId, run.runId).catch(() => {});
      }
    };
    request.once("aborted", onClose);
    response.once("close", onClose);
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...corsHeaders(originInfo.origin, originInfo.allowed),
    });
    response.flushHeaders?.();
    try {
      for await (const event of run.events) {
        if (!PUBLIC_SSE_EVENTS.has(event.type)) continue;
        if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") terminalSeen = true;
        if (!disconnected && !response.writableEnded) {
          response.write(`event: ${event.type}\ndata: ${JSON.stringify(publicSseEvent(event))}\n\n`);
        }
        if (terminalSeen) break;
      }
    } catch {
      if (!terminalSeen && !disconnected && !response.writableEnded) {
        response.write(`event: run.failed\ndata: ${JSON.stringify({ type: "run.failed", runId: run.runId, sessionId, timestamp: new Date().toISOString(), error: { code: "AGENT_RUN_FAILED", message: "Agent run failed" } })}\n\n`);
      }
    } finally {
      request.removeListener("aborted", onClose);
      response.removeListener("close", onClose);
      controller.finish(sessionId, run.runId);
      if (!response.writableEnded) response.end();
    }
  }

  function publicSseEvent(event) {
    const out = {
      type: event.type,
      runId: event.runId,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      ...(typeof event.toolCallId === "string" ? { toolCallId: event.toolCallId } : {}),
    };
    if (event.type === "run.failed") return { ...out, error: { code: "AGENT_RUN_FAILED", message: "Agent run failed" } };
    if (event.type === "tool.failed") return { ...out, error: { code: "TOOL_EXECUTION_FAILED", message: "Tool execution failed" } };
    if (event.type === "message.delta" || event.type === "reasoning.delta") {
      return typeof event.payload?.text === "string" ? { ...out, payload: { text: event.payload.text } } : out;
    }
    if (event.type === "tool.started" || event.type === "tool.completed") {
      const p = event.payload;
      return p && typeof p === "object" ? { ...out, payload: { ...(typeof p.name === "string" ? { name: p.name } : {}), ...(typeof p.displayName === "string" ? { displayName: p.displayName } : {}), ...(typeof p.risk === "string" ? { risk: p.risk } : {}), ...(typeof p.policy === "string" ? { policy: p.policy } : {}) } } : out;
    }
    return out;
  }

  return { handlePublicRequest, isPublicAgentPath, maybeSweep, cleanupSession };
}
