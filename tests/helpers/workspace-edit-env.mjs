// Black-box E2E environment for Phase 5B7: real browser -> frontend proxy
// server (dist worker + /api forwarding) -> real AI Node public BFF -> real
// DSH runtime subprocess -> tool-fs read/edit -> manifest-managed workspace.
// Only the model provider is scripted (an OpenAI-compatible upstream), which
// mirrors the existing real-e2e harness convention.
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { existsSync } from "node:fs";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AgentRuntimeManager } from "../../ai-node/src/agent/runtime-manager.mjs";
import { AgentSessionController } from "../../ai-node/src/agent/session-controller.mjs";
import { BUILT_IN_TOOL_METADATA } from "../../ai-node/src/agent/built-in-tools.mjs";
import { createAiNodeServer } from "../../ai-node/src/server.mjs";
import { createConfiguredAgentRuntime } from "../../ai-node/src/agent/runtime-factory.mjs";
import { WorkspaceManager } from "../../ai-node/src/agent/workspace/workspace-manager.mjs";
import { createDefaultCapabilityResolver } from "../../ai-node/src/agent/capabilities/built-ins.mjs";
import { SessionMetadataStore } from "../../ai-node/src/agent/session-metadata-store.mjs";
import { FileIngestionService } from "../../ai-node/src/agent/workspace/file-ingestion-service.mjs";
import { AttachmentContextResolver } from "../../ai-node/src/agent/attachments/attachment-context-resolver.mjs";
import { WorkspaceRuntimeRegistry } from "../../ai-node/src/agent/workspace-runtime-registry.mjs";
import { PublicAgentOwnershipStore } from "../../ai-node/src/agent/public/ownership-store.mjs";
import { createPublicAgentBff } from "../../ai-node/src/agent/public/bff.mjs";

const repoRoot = process.cwd();
const dshRoot = path.resolve(repoRoot, "../deepseek-harness");
const sdkPath = path.join(dshRoot, "packages/sdk/client/lib/index.js");
const runnerPath = path.join(dshRoot, "packages/examples/jsonrpc-demo/lib/bin.js");
const toolHostPath = path.join(dshRoot, "packages/fs/tool-fs/lib/index.js");
const fixtureBase = path.join(dshRoot, "examples/jsonrpc-agent");

export function hasRealRuntime() {
  return existsSync(sdkPath) && existsSync(runnerPath) && existsSync(path.join(dshRoot, "packages/fs/tool-fs/lib/index.js")) && existsSync(fixtureBase);
}

function textPayloads(text) {
  return [
    JSON.stringify({ choices: [{ delta: { role: "assistant", content: null } }] }),
    JSON.stringify({ choices: [{ delta: { content: text } }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
  ];
}
function toolPayloads(callId, name, args) {
  return [
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: callId, type: "function", function: { name, arguments: "" } }] } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] } }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
  ];
}
export { textPayloads, toolPayloads };

/** Scripted OpenAI-compatible upstream: model listing + chat completions. */
export function createScriptedUpstream() {
  let scripts = [];
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "snn-blackbox-model" }] }));
      return;
    }
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      const lower = body.toLowerCase();
      const entry = scripts.find((candidate) => !candidate.used && (!candidate.match || lower.includes(candidate.match.toLowerCase())));
      if (entry) entry.used = true;
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": open\n\n");
      for (const payload of entry?.payloads ?? textPayloads("done")) response.write(`data: ${payload}\n\n`);
      response.end("data: [DONE]\n\n");
    });
  });
  return {
    requests,
    set(next) { scripts = next.map((entry) => ({ ...entry })); },
    async listen() { await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); this.url = `http://127.0.0.1:${server.address().port}`; },
    async close() { await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }); },
  };
}

/** Public web fixture the workspace.fetch tool can retrieve in tests. */
export function createPublicWebFixture(body, contentType = "text/plain; charset=utf-8") {
  const hits = [];
  const server = createServer((request, response) => {
    hits.push(request.url);
    response.writeHead(200, { "content-type": contentType });
    response.end(body);
  });
  return {
    hits,
    async listen() { await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); this.url = `http://127.0.0.1:${server.address().port}/public-web.txt`; },
    async close() { await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }); },
  };
}

async function removeTree(target) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { await rm(target, { recursive: true, force: true }); return; } catch { if (Date.now() > deadline) return; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
}

const MIME = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

/**
 * Frontend origin for the black-box browser: serves the built dist worker and
 * forwards every /api request to the real BFF with streaming preserved, so the
 * browser talks to one same-origin server exactly like production.
 */
async function createFrontendProxy(getBffBaseUrl) {
  const clientRoot = path.join(repoRoot, "dist", "client");
  const fontRoot = path.join(repoRoot, ".vinext", "fonts");
  const worker = (await import(pathToFileURL(path.join(repoRoot, "dist", "server", "index.js")).href)).default;

  function assetResponse(url) {
    const relative = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname).replace(/^\/+/, "");
    const isFont = relative.startsWith("__fonts/");
    const file = isFont
      ? path.resolve(fontRoot, relative.slice("__fonts/".length))
      : path.resolve(clientRoot, relative.replace(/^assets[\\/]/, "assets/"));
    const base = isFont ? fontRoot : clientRoot;
    if (!file.startsWith(base)) return Promise.resolve(new Response("forbidden", { status: 403 }));
    return readFile(file).then((body) => new Response(body, { headers: { "content-type": MIME[path.extname(file)] || "application/octet-stream" } })).catch(() => new Response("Not found", { status: 404 }));
  }

  async function forwardToBff(request) {
    const bffBaseUrl = getBffBaseUrl();
    if (!bffBaseUrl) return new Response("BFF not ready", { status: 503 });
    const target = `${bffBaseUrl}${new URL(request.url, "http://127.0.0.1").pathname}${new URL(request.url, "http://127.0.0.1").search}`;
    const upstream = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer()),
      redirect: "manual",
    });
    return upstream;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    try {
      let result;
      if (url.pathname === "/ai-config.js") {
        // Local deployment proxy semantics: blank the public gateway base URLs
        // so the client falls back to same-origin /api/ai and /api/agent.
        const raw = await readFile(path.join(clientRoot, "ai-config.js"), "utf8");
        const local = raw.replace(/window\.__SNN_(AI|AGENT)_API_BASE_URL__\s*=[^\n]*/g, (_match, kind) => `window.__SNN_${kind}_API_BASE_URL__ = ""`);
        result = new Response(local, { headers: { "content-type": "text/javascript" } });
      } else if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/__fonts/")) {
        result = await assetResponse(request.url);
      } else if (url.pathname.startsWith("/api/")) {
        const incoming = new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
          method: request.method,
          headers: request.headers,
          body: request.method === "GET" || request.method === "HEAD" ? undefined : Readable.toWeb(request),
          duplex: "half",
        });
        result = await forwardToBff(incoming);
      } else {
        result = await worker.fetch(new Request(`http://127.0.0.1${url.pathname}${url.search}`, { method: request.method, headers: request.headers }), {
          ASSETS: { fetch: (assetRequest) => assetResponse(assetRequest.url) },
        }, { waitUntil() {}, passThroughOnException() {} });
      }
      const headers = {};
      result.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-length") return;
        headers[key] = result.headers.getSetCookie && key.toLowerCase() === "set-cookie" ? result.headers.getSetCookie() : value;
      });
      response.writeHead(result.status, headers);
      if (result.body) {
        Readable.fromWeb(result.body).pipe(response);
      } else {
        response.end(Buffer.from(await result.arrayBuffer()));
      }
    } catch (error) {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { url: `http://127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, async close() { await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }); } };
}

export async function bootWorkspaceEditEnv(label, { fetchAllowPrivateNetworks = false } = {}) {
  if (!hasRealRuntime()) throw new Error("requires sibling DSH built SDK and jsonrpc fixture");
  const workspaceBase = await mkdtemp(path.join(tmpdir(), "snn-5b7-wsbase-"));
  const ownershipRoot = await mkdtemp(path.join(tmpdir(), "snn-5b7-own-"));
  const metadataRoot = await mkdtemp(path.join(tmpdir(), "snn-5b7-meta-"));
  const persistence = await mkdtemp(path.join(tmpdir(), "snn-5b7-sess-"));
  const defaultWsRoot = await mkdtemp(path.join(tmpdir(), "snn-5b7-default-"));
  const fixture = path.join(fixtureBase, `.snn-5b7-${label}`);
  await mkdir(fixture, { recursive: true });
  const cordis = path.join(fixture, "cordis.yml");
  await writeFile(cordis, [
    "- id: sdk-jsonrpc-server", "  name: '@deepseek-ai/dsh-sdk-jsonrpc-server'", "  config:", "    maxTokensAsSuccess: true",
    "- id: llm-deepseek", "  name: '@deepseek-ai/dsh-llm-deepseek'", "  config:", "    thinking: disabled",
    "- id: sandbox", "  name: '@deepseek-ai/dsh-sandbox-local'",
    "- id: sandbox-policy", "  name: '@deepseek-ai/dsh-sandbox-policy'", "  config:", "    mode: read-only", "    workspaceRoot: !!js process.env.DSH_CWD",
    "- id: agent-spine-demo", "  name: '@deepseek-ai/dsh-agent-spine-demo'", "  config:", "    persona: 'SNN workspace editor'", "    workspaceContext: false", "    skills:", "      enabled: false", "    toolBash: false", "    toolJobs: false",
    "- id: subagent", "  name: '@deepseek-ai/dsh-subagent'",
    "- id: sessions", "  name: '@deepseek-ai/dsh-session-persistence-jsonl'", "  config:", "    root: !!js process.env.DSH_SESSION_ROOT", "    compression: none",
    "- id: fs-sandbox", "  name: '@deepseek-ai/dsh-fs-sandbox'", "  config:", "    cwd: !!js process.env.DSH_CWD",
    "- id: tool-fs", "  name: '@deepseek-ai/dsh-tool-fs'", "",
  ].join("\n"));

  const upstream = createScriptedUpstream();
  await upstream.listen();

  // Frontend proxy first so its origin can be whitelisted by the BFF.
  let bffBaseUrl = null;
  const proxy = await createFrontendProxy(() => bffBaseUrl);

  const workspaceManager = new WorkspaceManager();
  const defaultWs = await workspaceManager.register(defaultWsRoot, { id: "snn-workspace-default" });
  const metadataStore = new SessionMetadataStore(metadataRoot);
  const ownershipStore = new PublicAgentOwnershipStore(ownershipRoot);
  const ingestion = new FileIngestionService({ workspaceManager });
  const attachmentResolver = new AttachmentContextResolver({ fileInventory: ingestion });

  const runtimeConfig = {
    sdkPath, toolHostPath, runtimeExecutable: process.execPath, runtimeArguments: [runnerPath], cordisConfig: cordis,
    runtimeCwd: defaultWsRoot, provider: "deepseek-official", model: "snn-blackbox-model", requestTimeoutMs: 120_000, shutdownTimeoutMs: 10_000,
    fetchAllowPrivateNetworks,
    environment: { PATH: process.env.PATH, DEEPSEEK_API_KEY: "test-key", DEEPSEEK_BASE_URL: upstream.url, DSH_SESSION_ROOT: persistence, DSH_CWD: defaultWsRoot, DSH_HOME: path.join(defaultWsRoot, ".home"), DSH_AGENTS_HOME: path.join(defaultWsRoot, ".agents") },
  };
  const createManagerForWs = (ws) => new AgentRuntimeManager({ createRuntime: () => createConfiguredAgentRuntime({ ...runtimeConfig, runtimeCwd: ws.root, environment: { ...runtimeConfig.environment, DSH_CWD: ws.root, DSH_HOME: path.join(ws.root, ".home"), DSH_AGENTS_HOME: path.join(ws.root, ".agents") } }) });
  const defaultManager = createManagerForWs(defaultWs);
  const runtimeRegistry = new WorkspaceRuntimeRegistry({
    createManager: async (ws) => (ws.id === defaultWs.id ? defaultManager : createManagerForWs(ws)),
  });

  const controller = new AgentSessionController({
    manager: defaultManager,
    toolMetadata: BUILT_IN_TOOL_METADATA,
    capabilityResolver: createDefaultCapabilityResolver(),
    workspace: defaultWs,
    workspaceManager,
    metadataStore,
    runtimeRegistry,
    attachmentContextResolver: attachmentResolver,
  });

  const allowedOrigins = ["https://snnai.cn", proxy.origin];
  const publicConfig = {
    enabled: true,
    workspaceBase,
    ownershipRoot,
    cookieName: "snn_agent_owner",
    cookieSecure: false,
    sessionTtlMs: 24 * 60 * 60 * 1000,
    limits: { maxSessionsGlobal: 100, maxSessionsPerOwner: 10, maxActiveRunsGlobal: 20, maxActiveRunsPerOwner: 3, maxActiveWorkspaces: 100 },
  };
  const serverConfig = {
    host: "127.0.0.1", port: 0,
    allowedOrigins,
    upstreamBaseUrl: `${upstream.url}/v1`, upstreamApiKey: "", model: "snn-blackbox-model",
    statusTimeoutMs: 4000, chatConnectTimeoutMs: 4000, streamIdleTimeoutMs: 30_000, maxOutputTokens: 4096, maxBodyBytes: 65536, systemPrompt: "You are SNN AI.",
    agent: { enabled: true, host: "127.0.0.1", port: 0, maxBodyBytes: 16384, messageMaxLength: 16384 },
    publicAgent: publicConfig,
    webSearch: null,
  };
  const publicBff = createPublicAgentBff({
    config: serverConfig,
    publicConfig,
    controller,
    workspaceManager,
    metadataStore,
    runtimeRegistry,
    ingestionService: ingestion,
    ownershipStore,
    workspaceBase,
  });
  const server = createAiNodeServer(serverConfig, { publicBff, logger: { info() {}, error() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  bffBaseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    frontendUrl: proxy.url,
    bffUrl: bffBaseUrl,
    upstream,
    workspaceBase,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await proxy.close();
      await runtimeRegistry.disposeAll().catch(() => {});
      await defaultManager.dispose().catch(() => {});
      await upstream.close();
      for (const target of [workspaceBase, ownershipRoot, metadataRoot, persistence, defaultWsRoot, fixture]) await removeTree(target);
    },
  };
}
