import { createServer } from "node:http";
import { httpError } from "./session-controller.mjs";

const SSE_EVENT_TYPES = new Set([
  "run.started", "reasoning.started", "reasoning.delta", "reasoning.completed",
  "message.started", "message.delta", "message.completed", "tool.started",
  "tool.completed", "tool.failed", "approval.required", "run.completed", "run.failed", "run.cancelled",
]);

export function createAgentInternalServer({ config, controller, manager, logger = console }) {
  if (config.host !== "127.0.0.1") throw new Error("Agent Internal API must listen on 127.0.0.1 only");
  const server = createServer((request, response) => {
    void handleRequest(request, response, { config, controller, manager, logger });
  });
  return {
    listen() { return new Promise((resolve) => server.listen(config.port, config.host, resolve)); },
    async close() {
      await controller.cancelAll();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
    address() { return server.address(); },
  };
}

async function handleRequest(request, response, { config, controller, manager, logger }) {
  const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
  try {
    if (request.method === "GET" && path === "/internal/agent/status") {
      sendJson(response, 200, {
        enabled: config.enabled,
        runtimeState: manager.state,
        capabilities: { streaming: true, tools: true, toolPolicy: true, cancel: true, resume: true, persistence: true },
      });
      return;
    }
    if (request.method === "POST" && path === "/internal/agent/sessions") {
      await requireEmptyJsonBody(request, config.maxBodyBytes);
      sendJson(response, 201, await controller.createSession());
      return;
    }
    if (path === "/internal/agent/status" || path === "/internal/agent/sessions") {
      throw httpError(405, "METHOD_NOT_ALLOWED", "method is not allowed");
    }
    const match = /^\/internal\/agent\/sessions\/([^/]+)(?:\/(resume|runs)(?:\/([^/]+)\/cancel)?)?$/.exec(path);
    if (!match) throw httpError(404, "NOT_FOUND", "route was not found");
    const [, sessionId, action, runId] = match;
    if (request.method !== "POST") throw httpError(405, "METHOD_NOT_ALLOWED", "method is not allowed");
    if (action === "resume") {
      await requireEmptyJsonBody(request, config.maxBodyBytes);
      sendJson(response, 200, await controller.resumeSession(sessionId));
      return;
    }
    if (action === "runs" && runId) {
      await requireEmptyJsonBody(request, config.maxBodyBytes);
      await controller.cancel(sessionId, runId);
      sendJson(response, 202, { sessionId, runId, status: "cancellation_requested" });
      return;
    }
    if (action !== "runs" || runId) throw httpError(404, "NOT_FOUND", "route was not found");
    const body = await readJsonBody(request, config.maxBodyBytes);
    if (!isExactMessageBody(body)) throw httpError(400, "INVALID_REQUEST", "request body must contain only message");
    const run = await controller.startRun(sessionId, body.message);
    streamRun(request, response, controller, sessionId, run);
  } catch (error) {
    sendError(response, error, logger, path);
  }
}

function streamRun(request, response, controller, sessionId, run) {
  let disconnected = false;
  let terminalSeen = false;
  const cancelOnDisconnect = () => {
    if (!response.writableEnded) {
      disconnected = true;
      void controller.cancel(sessionId, run.runId).catch(() => {});
    }
  };
  request.once("aborted", cancelOnDisconnect);
  response.once("close", cancelOnDisconnect);
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.flushHeaders?.();
  void (async () => {
    try {
      for await (const event of run.events) {
        if (!SSE_EVENT_TYPES.has(event.type)) continue;
        if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") terminalSeen = true;
        if (!disconnected && !response.writableEnded) response.write(`event: ${event.type}\ndata: ${JSON.stringify(publicSseEvent(event))}\n\n`);
      }
    } catch {
      if (!terminalSeen && !disconnected && !response.writableEnded) writeSse(response, "run.failed", publicRunFailure(sessionId, run));
    } finally {
      request.removeListener("aborted", cancelOnDisconnect);
      controller.finish(sessionId, run.runId);
      if (!response.writableEnded) response.end();
    }
  })();
}

async function requireEmptyJsonBody(request, maxBodyBytes) {
  const body = await readJsonBody(request, maxBodyBytes);
  if (body === undefined) return;
  if (!isRecord(body) || Object.keys(body).length !== 0) throw httpError(400, "INVALID_REQUEST", "request body must be empty");
}

async function readJsonBody(request, maxBodyBytes) {
  if (request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw httpError(400, "INVALID_CONTENT_TYPE", "content-type must be application/json");
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBodyBytes) throw httpError(413, "REQUEST_TOO_LARGE", "request body exceeds the allowed size");
    chunks.push(chunk);
  }
  if (length === 0) return undefined;
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw httpError(400, "MALFORMED_JSON", "request body must be valid JSON"); }
}

function isExactMessageBody(body) {
  return isRecord(body) && Object.keys(body).length === 1 && typeof body.message === "string";
}

function publicRunFailure(sessionId, run) {
  return { type: "run.failed", runId: run.runId, sessionId, timestamp: new Date().toISOString(), error: { code: "AGENT_RUNTIME_UNAVAILABLE", message: "Agent runtime failed" } };
}

function publicSseEvent(event) {
  const output = {
    type: event.type,
    runId: event.runId,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    ...(typeof event.toolCallId === "string" ? { toolCallId: event.toolCallId } : {}),
  };
  if (event.type === "run.failed") return { ...output, error: { code: "AGENT_RUN_FAILED", message: "Agent run failed" } };
  if (event.type === "tool.failed") return { ...output, error: { code: "TOOL_EXECUTION_FAILED", message: "Tool execution failed" } };
  if (event.type === "message.delta" || event.type === "reasoning.delta") {
    return typeof event.payload?.text === "string" ? { ...output, payload: { text: event.payload.text } } : output;
  }
  if (event.type === "tool.started" || event.type === "tool.completed") {
    const payload = event.payload;
    return isRecord(payload) ? {
      ...output,
      payload: {
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
        ...(typeof payload.displayName === "string" ? { displayName: payload.displayName } : {}),
        ...(typeof payload.risk === "string" ? { risk: payload.risk } : {}),
        ...(typeof payload.policy === "string" ? { policy: payload.policy } : {}),
      },
    } : output;
  }
  return output;
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function writeSse(response, type, body) { response.write(`event: ${type}\ndata: ${JSON.stringify(body)}\n\n`); }

function sendError(response, error, logger, path) {
  const status = Number.isInteger(error?.status) ? error.status : error?.code === "AGENT_SESSION_NOT_FOUND" ? 404 : error?.code === "AGENT_RUNTIME_INCOMPATIBLE" ? 503 : 500;
  const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
  const message = status >= 500 ? "Agent runtime is unavailable" : error?.message || "Request failed";
  logger.error?.(JSON.stringify({ component: "agent-internal", path, status, code }));
  if (!response.headersSent) sendJson(response, status, { error: { code, message } });
  else if (!response.writableEnded) response.end();
}

function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
