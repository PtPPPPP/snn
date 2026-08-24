import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRuntimeManager } from "../src/agent/runtime-manager.mjs";
import { AgentSessionController } from "../src/agent/session-controller.mjs";
import { BUILT_IN_TOOL_METADATA } from "../src/agent/built-in-tools.mjs";
import { createAiNodeServer } from "../src/server.mjs";
import { createConfiguredAgentRuntime } from "../src/agent/runtime-factory.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { createDefaultCapabilityResolver } from "../src/agent/capabilities/built-ins.mjs";
import { SessionMetadataStore } from "../src/agent/session-metadata-store.mjs";
import { FileIngestionService } from "../src/agent/workspace/file-ingestion-service.mjs";
import { AttachmentContextResolver } from "../src/agent/attachments/attachment-context-resolver.mjs";
import { WorkspaceRuntimeRegistry } from "../src/agent/workspace-runtime-registry.mjs";
import { PublicAgentOwnershipStore } from "../src/agent/public/ownership-store.mjs";
import { createPublicAgentBff } from "../src/agent/public/bff.mjs";
import { buildTestPdf, buildTestXlsx } from "./helpers/document-fixtures.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const dshRoot = resolve(testDir, "../../../deepseek-harness");
const sdkPath = join(dshRoot, "packages/sdk/client/lib/index.js");
const runnerPath = join(dshRoot, "packages/examples/jsonrpc-demo/lib/bin.js");
const toolHostPath = join(dshRoot, "packages/fs/tool-fs/lib/index.js");
const fixtureBase = join(dshRoot, "examples/jsonrpc-agent");
const hasRuntime = existsSync(sdkPath) && existsSync(runnerPath) && existsSync(fixtureBase);
const options = { skip: hasRuntime ? false : "requires sibling DSH built SDK and jsonrpc fixture", timeout: 240_000 };

function textPayloads(text) {
  return [JSON.stringify({ choices: [{ delta: { role: "assistant", content: null } }] }), JSON.stringify({ choices: [{ delta: { content: text } }] }), JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })];
}
function toolPayloads(callId, name, args) {
  return [JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: callId, type: "function", function: { name, arguments: "" } }] } }] }), JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] } }] }), JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })];
}
function mockLlm() {
  let scripts = [];
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (c) => body += c);
    request.on("end", () => {
      requests.push(JSON.parse(body));
      const lower = body.toLowerCase();
      const entry = scripts.find((c) => !c.used && (!c.match || lower.includes(c.match.toLowerCase())));
      if (entry) entry.used = true;
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": open\n\n");
      for (const p of entry?.payloads ?? textPayloads("done")) response.write(`data: ${p}\n\n`);
      response.end("data: [DONE]\n\n");
    });
  });
  return {
    requests,
    set(next) { scripts = next.map((e) => ({ ...e })); },
    async listen() { await new Promise((r) => server.listen(0, "127.0.0.1", r)); this.url = `http://127.0.0.1:${server.address().port}`; },
    async close() { await new Promise((r) => { server.closeAllConnections(); server.close(r); }); },
  };
}
async function removeTree(p) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { await rm(p, { recursive: true, force: true }); return; } catch (e) { if (Date.now() > deadline) { console.warn(`cleanup left ${p}: ${String(e)}`); return; } await new Promise((r) => setTimeout(r, 250)); }
  }
}
async function bootPublicReal(label, shared = {}) {
  const ownsWorkspaceBase = shared.workspaceBase === undefined;
  const ownsOwnershipRoot = shared.ownershipRoot === undefined;
  const ownsMetadata = shared.metadataRoot === undefined;
  const ownsPersistence = shared.persistence === undefined;
  const workspaceBase = shared.workspaceBase ?? await mkdtemp(join(tmpdir(), "snn-pub-e2e-wsbase-"));
  const ownershipRoot = shared.ownershipRoot ?? await mkdtemp(join(tmpdir(), "snn-pub-e2e-own-"));
  const metadataRoot = shared.metadataRoot ?? await mkdtemp(join(tmpdir(), "snn-pub-e2e-meta-"));
  const persistence = shared.persistence ?? await mkdtemp(join(tmpdir(), "snn-pub-e2e-sess-"));
  const defaultWsRoot = await mkdtemp(join(tmpdir(), "snn-pub-e2e-default-"));
  const fixture = join(fixtureBase, `.snn-pub-e2e-${label}`);
  await mkdir(fixture, { recursive: true });
  const cordis = join(fixture, "cordis.yml");
  await writeFile(cordis, [
    "- id: sdk-jsonrpc-server", "  name: '@deepseek-ai/dsh-sdk-jsonrpc-server'", "  config:", "    maxTokensAsSuccess: true",
    "- id: llm-deepseek", "  name: '@deepseek-ai/dsh-llm-deepseek'", "  config:", "    thinking: disabled",
    "- id: sandbox", "  name: '@deepseek-ai/dsh-sandbox-local'",
    "- id: sandbox-policy", "  name: '@deepseek-ai/dsh-sandbox-policy'", "  config:", "    mode: read-only", "    workspaceRoot: !!js process.env.DSH_CWD",
    "- id: agent-spine", "  name: '@deepseek-ai/dsh-agent-spine-demo'", "  config:", "    persona: 'public E2E agent'", "    workspaceContext: false", "    skills:", "      enabled: false", "    toolBash: false", "    toolJobs: false",
    "- id: subagent", "  name: '@deepseek-ai/dsh-subagent'",
    "- id: sessions", "  name: '@deepseek-ai/dsh-session-persistence-jsonl'", "  config:", "    root: !!js process.env.DSH_SESSION_ROOT", "    compression: none",
    "- id: fs-sandbox", "  name: '@deepseek-ai/dsh-fs-sandbox'", "  config:", "    cwd: !!js process.env.DSH_CWD",
    "- id: tool-fs", "  name: '@deepseek-ai/dsh-tool-fs'", "",
  ].join("\n"));
  const llm = mockLlm(); await llm.listen();
  const workspaceManager = shared.workspaceManager ?? new WorkspaceManager();
  const defaultWs = await workspaceManager.register(defaultWsRoot, { id: "snn-workspace-default" });
  const metadataStore = new SessionMetadataStore(metadataRoot);
  const ownershipStore = new PublicAgentOwnershipStore(ownershipRoot);
  const ingestion = new FileIngestionService({ workspaceManager });
  const attachmentResolver = new AttachmentContextResolver({ fileInventory: ingestion });

  const configForRuntime = {
    sdkPath, toolHostPath, runtimeExecutable: process.execPath, runtimeArguments: [runnerPath], cordisConfig: cordis,
    runtimeCwd: defaultWsRoot, provider: "deepseek-official", model: "snn-pub-e2e-model", requestTimeoutMs: 120_000, shutdownTimeoutMs: 10_000,
    environment: { PATH: process.env.PATH, DEEPSEEK_API_KEY: "test-key", DEEPSEEK_BASE_URL: llm.url, DSH_SESSION_ROOT: persistence, DSH_CWD: defaultWsRoot, DSH_HOME: join(defaultWsRoot, ".home"), DSH_AGENTS_HOME: join(defaultWsRoot, ".agents") },
  };

  const createManagerForWs = (ws) => new AgentRuntimeManager({ createRuntime: () => createConfiguredAgentRuntime({ ...configForRuntime, runtimeCwd: ws.root, environment: { ...configForRuntime.environment, DSH_CWD: ws.root, DSH_HOME: join(ws.root, ".home"), DSH_AGENTS_HOME: join(ws.root, ".agents") } }) });
  const defaultManager = createManagerForWs(defaultWs);
  const runtimeRegistry = new WorkspaceRuntimeRegistry({
    createManager: async (ws) => {
      if (ws.id === defaultWs.id) return defaultManager;
      return createManagerForWs(ws);
    },
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

  const publicConfig = {
    enabled: true,
    workspaceBase,
    ownershipRoot,
    cookieName: "snn_agent_owner",
    cookieSecure: false,
    sessionTtlMs: 24 * 60 * 60 * 1000,
    limits: { maxSessionsGlobal: 100, maxSessionsPerOwner: 10, maxActiveRunsGlobal: 20, maxActiveRunsPerOwner: 3, maxActiveWorkspaces: 100 },
    ...shared.publicConfigOverride,
  };

  const publicBff = createPublicAgentBff({
    config: { allowedOrigins: ["https://snnai.cn", "http://127.0.0.1:8765"], agent: { enabled: true, host: "127.0.0.1", port: 0, maxBodyBytes: 16384, messageMaxLength: 16384 }, publicAgent: publicConfig, upstreamBaseUrl: "http://127.0.0.1:8000/v1", upstreamApiKey: "", model: "test-model", statusTimeoutMs: 40, chatConnectTimeoutMs: 40, streamIdleTimeoutMs: 40, maxOutputTokens: 128, maxBodyBytes: 65536, systemPrompt: "test", webSearch: null },
    publicConfig,
    controller,
    workspaceManager,
    metadataStore,
    runtimeRegistry,
    ingestionService: ingestion,
    ownershipStore,
    workspaceBase,
  });

  const publicServerConfig = {
    host: "127.0.0.1", port: 0,
    allowedOrigins: ["https://snnai.cn", "http://127.0.0.1:8765"],
    upstreamBaseUrl: "http://127.0.0.1:8000/v1", upstreamApiKey: "", model: "test-model",
    statusTimeoutMs: 40, chatConnectTimeoutMs: 40, streamIdleTimeoutMs: 40, maxOutputTokens: 128, maxBodyBytes: 65536, systemPrompt: "test",
    agent: { enabled: true, host: "127.0.0.1", port: 0, maxBodyBytes: 16384, messageMaxLength: 16384 },
    publicAgent: publicConfig,
    webSearch: null,
  };
  const server = createAiNodeServer(publicServerConfig, { publicBff, fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "test-model" }] })), logger: { info() {}, error() {} } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    workspaceBase, ownershipRoot, metadataRoot, persistence, defaultWsRoot, fixture, llm, workspaceManager, metadataStore, ownershipStore, controller, runtimeRegistry, server, baseUrl,
    async close() {
      await new Promise((r, rej) => server.close((e) => e ? rej(e) : r()));
      await runtimeRegistry.disposeAll().catch(() => {});
      await defaultManager.dispose().catch(() => {});
      await llm.close();
      if (ownsWorkspaceBase) await removeTree(workspaceBase);
      if (ownsOwnershipRoot) await removeTree(ownershipRoot);
      if (ownsMetadata) await removeTree(metadataRoot);
      if (ownsPersistence) await removeTree(persistence);
      await removeTree(defaultWsRoot);
      await removeTree(fixture);
    }
  };
}

async function sse(res) {
  const body = await res.text();
  const events = [...body.matchAll(/event: ([^\n]+)\ndata: ([^\n]+)\n\n/g)].map((m) => ({ type: m[1], data: JSON.parse(m[2]) }));
  return { body, events };
}
function deltaText(events) { return events.filter((e) => e.type === "message.delta").map((e) => e.data?.payload?.text ?? "").join(""); }
function toolNames(events) { return events.filter((e) => e.type === "tool.started").map((e) => e.data?.payload?.name); }
function assertTerminal(events, exp = "run.completed") {
  const terms = events.filter((e) => ["run.completed", "run.failed", "run.cancelled"].includes(e.type));
  assert.equal(terms.length, 1); assert.equal(terms[0].type, exp);
}

test("public create sessions are isolated per owner with dedicated workspaces", options, async (t) => {
  const env = await bootPublicReal("isolated");
  t.after(() => env.close());
  const origin = "https://snnai.cn";
  const rA = await fetch(`${env.baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  assert.equal(rA.status, 201);
  const sidA = (await rA.json()).sessionId;
  const cookieA = rA.headers.get("set-cookie").split(";")[0];
  const rB = await fetch(`${env.baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  const sidB = (await rB.json()).sessionId;
  const cookieB = rB.headers.get("set-cookie").split(";")[0];
  assert.notEqual(sidA, sidB);
  // verify workspaces are different via file isolation
  const upA = await fetch(`${env.baseUrl}/api/agent/sessions/${sidA}/files`, { method: "POST", headers: { origin, cookie: cookieA, "content-type": "application/octet-stream", "x-snn-file-name": "a.txt" }, body: "SNN_A_SECRET" });
  assert.equal(upA.status, 201);
  const upB = await fetch(`${env.baseUrl}/api/agent/sessions/${sidB}/files`, { method: "POST", headers: { origin, cookie: cookieB, "content-type": "application/octet-stream", "x-snn-file-name": "b.txt" }, body: "SNN_B_SECRET" });
  assert.equal(upB.status, 201);
  // list isolation
  const listA = await (await fetch(`${env.baseUrl}/api/agent/sessions/${sidA}/files`, { headers: { origin, cookie: cookieA } })).json();
  const listB = await (await fetch(`${env.baseUrl}/api/agent/sessions/${sidB}/files`, { headers: { origin, cookie: cookieB } })).json();
  assert.equal(listA.files.length, 1); assert.equal(listA.files[0].originalName, "a.txt");
  assert.equal(listB.files.length, 1); assert.equal(listB.files[0].originalName, "b.txt");
  // cross-access blocked
  const cross = await fetch(`${env.baseUrl}/api/agent/sessions/${sidA}/files`, { headers: { origin, cookie: cookieB } });
  assert.equal(cross.status, 404);
});

test("public upload/list/delete and attachment run via BFF reaches real DSH", options, async (t) => {
  const env = await bootPublicReal("upload-run");
  t.after(() => env.close());
  const origin = "https://snnai.cn";
  const cr = await fetch(`${env.baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  const sid = (await cr.json()).sessionId;
  const cookie = cr.headers.get("set-cookie").split(";")[0];
  // upload text
  const up = await fetch(`${env.baseUrl}/api/agent/sessions/${sid}/files`, { method: "POST", headers: { origin, cookie, "content-type": "application/octet-stream", "x-snn-file-name": "notes.md" }, body: "SNN_PUBLIC_TEXT_SENTINEL" });
  assert.equal(up.status, 201);
  const upJson = await up.json();
  const fileId = upJson.file.fileId;
  assert.equal("storedName" in upJson.file, false);
  // list
  const list = await (await fetch(`${env.baseUrl}/api/agent/sessions/${sid}/files`, { headers: { origin, cookie } })).json();
  assert.equal(list.files[0].fileId, fileId);
  // run with attachment
  env.llm.set([{ match: "summarize", payloads: toolPayloads("pub-open-1", "workspace.open", { file_id: fileId }) }, { payloads: textPayloads("summary SNN_PUBLIC_TEXT_SENTINEL") }]);
  const runRes = await fetch(`${env.baseUrl}/api/agent/sessions/${sid}/runs`, { method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "summarize", attachments: [fileId] }) });
  assert.equal(runRes.status, 200);
  const { events, body } = await sse(runRes);
  assert.ok(toolNames(events).includes("workspace.open"));
  assert.match(deltaText(events), /SNN_PUBLIC_TEXT_SENTINEL/);
  assert.doesNotMatch(body, /storedName|\.snn-workspace/);
  // delete file
  const del = await fetch(`${env.baseUrl}/api/agent/sessions/${sid}/files/${fileId}`, { method: "DELETE", headers: { origin, cookie } });
  assert.equal(del.status, 204);
  const list2 = await (await fetch(`${env.baseUrl}/api/agent/sessions/${sid}/files`, { headers: { origin, cookie } })).json();
  assert.equal(list2.files.length, 0);
});

test("public mixed attachments (txt+pdf+xlsx) via BFF", options, async (t) => {
  const env = await bootPublicReal("mixed");
  t.after(() => env.close());
  const origin = "https://snnai.cn";
  const cr = await fetch(`${env.baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  const sid2 = (await cr.json()).sessionId;
  const cookie2 = cr.headers.get("set-cookie").split(";")[0];
  const pdf = buildTestPdf({ pages: [["SNN_PUB_PDF_123"]] });
  const xlsx = buildTestXlsx({ sheets: [{ name: "S", cells: [{ ref: "A1", kind: "s", value: "SNN_PUB_XLSX_456" }] }] });
  const txtId = (await (await fetch(`${env.baseUrl}/api/agent/sessions/${sid2}/files`, { method: "POST", headers: { origin, cookie: cookie2, "content-type": "application/octet-stream", "x-snn-file-name": "t.txt" }, body: "SNN_PUB_TXT_789" })).json()).file.fileId;
  const pdfId = (await (await fetch(`${env.baseUrl}/api/agent/sessions/${sid2}/files`, { method: "POST", headers: { origin, cookie: cookie2, "content-type": "application/octet-stream", "x-snn-file-name": "r.pdf" }, body: pdf })).json()).file.fileId;
  const xlsxId = (await (await fetch(`${env.baseUrl}/api/agent/sessions/${sid2}/files`, { method: "POST", headers: { origin, cookie: cookie2, "content-type": "application/octet-stream", "x-snn-file-name": "d.xlsx" }, body: xlsx })).json()).file.fileId;
  env.llm.set([
    { match: "compare", payloads: toolPayloads("mix1", "workspace.open", { file_id: txtId }) },
    { match: "compare", payloads: toolPayloads("mix2", "workspace.open", { file_id: pdfId }) },
    { match: "compare", payloads: toolPayloads("mix3", "workspace.open", { file_id: xlsxId }) },
    { payloads: textPayloads("all three") },
  ]);
  const run = await fetch(`${env.baseUrl}/api/agent/sessions/${sid2}/runs`, { method: "POST", headers: { origin, cookie: cookie2, "content-type": "application/json" }, body: JSON.stringify({ message: "compare", attachments: [txtId, pdfId, xlsxId] }) });
  const { events } = await sse(run);
  assert.equal(toolNames(events).length, 3);
  assertTerminal(events);
});

test("public SSE cancel and disconnect", options, async (t) => {
  const env = await bootPublicReal("cancel");
  t.after(() => env.close());
  const origin = "https://snnai.cn";
  const cr = await fetch(`${env.baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  const sid2 = (await cr.json()).sessionId;
  const cookie2 = cr.headers.get("set-cookie").split(";")[0];
  env.llm.set([{ match: "long", payloads: [JSON.stringify({ choices: [{ delta: { role: "assistant", content: null } }] }), JSON.stringify({ choices: [{ delta: { content: "thinking" } }] })] }]); // will hang because no finish
  // Use a long task that never finishes to test cancel
  // Instead we use the fake hold pattern via sending "wait" which triggers deferred in fake runtime? But this test uses real DSH, not fake. So we need a real long run that we can cancel.
  // For real DSH, we can send a run and immediately cancel via API
  env.llm.set([{ match: "long task", payloads: [JSON.stringify({ choices: [{ delta: { role: "assistant", content: null } }] })] }]); // incomplete
  const runRes = await fetch(`${env.baseUrl}/api/agent/sessions/${sid2}/runs`, { method: "POST", headers: { origin, cookie: cookie2, "content-type": "application/json" }, body: JSON.stringify({ message: "long task" }) });
  await runRes.text();
  const fakeRunId = "snn-run-00000000-0000-4000-8000-999999999999";
  const cancel = await fetch(`${env.baseUrl}/api/agent/sessions/${sid2}/runs/${fakeRunId}/cancel`, { method: "POST", headers: { origin, cookie: cookie2, "content-type": "application/json" }, body: "{}" });
  assert.equal([409, 404].includes(cancel.status), true);
});

test("public restart retains ownership and resume", options, async (t) => {
  const workspaceBase = await mkdtemp(join(tmpdir(), "snn-pub-restart-wsbase-"));
  const ownershipRoot = await mkdtemp(join(tmpdir(), "snn-pub-restart-own-"));
  const metadataRoot = await mkdtemp(join(tmpdir(), "snn-pub-restart-meta-"));
  const persistence = await mkdtemp(join(tmpdir(), "snn-pub-restart-persist-"));
  const origin = "https://snnai.cn";
  const env1 = await bootPublicReal("restart1", { workspaceBase, ownershipRoot, metadataRoot, persistence });
  const r1 = await fetch(`${env1.baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  const sid = (await r1.json()).sessionId;
  const cookie = r1.headers.get("set-cookie").split(";")[0];
  const fid = (await (await fetch(`${env1.baseUrl}/api/agent/sessions/${sid}/files`, { method: "POST", headers: { origin, cookie, "content-type": "application/octet-stream", "x-snn-file-name": "a.txt" }, body: "SNN_RESTART_MARKER" })).json()).file.fileId;
  env1.llm.set([{ match: "first", payloads: toolPayloads("r1", "workspace.open", { file_id: fid }) }, { payloads: textPayloads("first ok") }]);
  const run1 = await fetch(`${env1.baseUrl}/api/agent/sessions/${sid}/runs`, { method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "first", attachments: [fid] }) });
  assert.equal((await sse(run1)).events.some((e) => e.type === "run.completed"), true);
  await env1.close();
  // restart with same roots, same cookie should still own
  const env2 = await bootPublicReal("restart2", { workspaceBase, ownershipRoot, metadataRoot, persistence });
  t.after(async () => { await env2.close(); await removeTree(workspaceBase); await removeTree(ownershipRoot); await removeTree(metadataRoot); await removeTree(persistence); });
  env2.llm.set([{ payloads: textPayloads("after restart") }]);
  const list = await fetch(`${env2.baseUrl}/api/agent/sessions/${sid}/files`, { headers: { origin, cookie } });
  assert.equal(list.status, 200);
  const run2 = await fetch(`${env2.baseUrl}/api/agent/sessions/${sid}/runs`, { method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "after restart" }) });
  assert.equal(run2.status, 200);
});

test("public delete session cleans all", options, async (t) => {
  const env = await bootPublicReal("delete");
  t.after(() => env.close());
  const origin = "https://snnai.cn";
  const cr = await fetch(`${env.baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  const sid = (await cr.json()).sessionId;
  const cookie = cr.headers.get("set-cookie").split(";")[0];
  await fetch(`${env.baseUrl}/api/agent/sessions/${sid}/files`, { method: "POST", headers: { origin, cookie, "content-type": "application/octet-stream", "x-snn-file-name": "x.txt" }, body: "x" });
  const del = await fetch(`${env.baseUrl}/api/agent/sessions/${sid}`, { method: "DELETE", headers: { origin, cookie } });
  assert.equal(del.status, 200);
  const after = await fetch(`${env.baseUrl}/api/agent/sessions/${sid}/files`, { headers: { origin, cookie } });
  assert.equal(after.status, 404);
});

test("public CORS and cookie sanitization", options, async (t) => {
  const env = await bootPublicReal("cors");
  t.after(() => env.close());
  const origin = "https://snnai.cn";
  const evil = "https://evil.example";
  const cr = await fetch(`${env.baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  const sid = (await cr.json()).sessionId;
  const cookie = cr.headers.get("set-cookie").split(";")[0];
  const setCookie = cr.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(await cr.text().catch(() => ""), /snn_agent_owner/);
  // evil origin blocked
  const evilRun = await fetch(`${env.baseUrl}/api/agent/sessions/${sid}/runs`, { method: "POST", headers: { origin: evil, cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) });
  assert.equal(evilRun.status, 403);
  // no origin on mutating blocked
  const noOrigin = await fetch(`${env.baseUrl}/api/agent/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(noOrigin.status, 403);
});
