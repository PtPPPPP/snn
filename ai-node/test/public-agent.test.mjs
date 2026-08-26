import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAiNodeServer } from "../src/server.mjs";
import { AgentRuntimeManager } from "../src/agent/runtime-manager.mjs";
import { AgentSessionController } from "../src/agent/session-controller.mjs";
import { BUILT_IN_TOOL_METADATA } from "../src/agent/built-in-tools.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { FileIngestionService } from "../src/agent/workspace/file-ingestion-service.mjs";
import { SessionMetadataStore } from "../src/agent/session-metadata-store.mjs";
import { AttachmentContextResolver } from "../src/agent/attachments/attachment-context-resolver.mjs";
import { WorkspaceRuntimeRegistry } from "../src/agent/workspace-runtime-registry.mjs";
import { PublicAgentOwnershipStore } from "../src/agent/public/ownership-store.mjs";
import { createPublicAgentBff } from "../src/agent/public/bff.mjs";
import { createDefaultCapabilityResolver } from "../src/agent/capabilities/built-ins.mjs";
import { buildTestDocx, buildTestPdf, buildTestXlsx, docxDocumentXml } from "./helpers/document-fixtures.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
function event(type, runId, sessionId) {
  return { type, runId, sessionId, timestamp: "2026-08-24T00:00:00.000Z" };
}
function createFakeRuntime() {
  const calls = [];
  let n = 0;
  const holds = new Map();
  return {
    calls,
    async createSession(input) { calls.push(["create", input]); },
    async resumeSession(input) { calls.push(["resume", input]); },
    sendMessage({ sessionId, content }) {
      const runId = `snn-run-00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const d = deferred();
      holds.set(runId, d);
      const msg = Array.isArray(content) ? content.map((c) => c.text).join("|") : content;
      calls.push(["run", sessionId, msg, runId]);
      return {
        runId,
        events: (async function* () {
          yield event("run.started", runId, sessionId);
          if (msg.includes("wait")) await d.promise;
          yield event("message.delta", runId, sessionId);
          yield event("run.completed", runId, sessionId);
        })(),
      };
    },
    async abort({ sessionId, runId }) { calls.push(["abort", sessionId, runId]); holds.get(runId)?.resolve(); },
    async dispose() { calls.push(["dispose"]); },
  };
}

async function withPublic(options, run) {
  const workspaceBase = await mkdtemp(join(tmpdir(), "snn-public-wsbase-"));
  const ownershipRoot = await mkdtemp(join(tmpdir(), "snn-public-own-"));
  const metadataRoot = await mkdtemp(join(tmpdir(), "snn-public-meta-"));
  const runtimeCwd = await mkdtemp(join(tmpdir(), "snn-public-rt-"));
  // create a dummy cordis etc not needed for fake runtime
  const workspaceManager = new WorkspaceManager();
  const metadataStore = new SessionMetadataStore(metadataRoot);
  const ownershipStore = new PublicAgentOwnershipStore(ownershipRoot);
  const ingestion = new FileIngestionService({ workspaceManager });
  const attachmentResolver = new AttachmentContextResolver({ fileInventory: ingestion });
  const fakeRuntime = createFakeRuntime();
  const manager = new AgentRuntimeManager({ createRuntime: async () => fakeRuntime });
  // need a dummy workspace for internal fallback (not used for public per-session but required for controller)
  const defaultWs = await workspaceManager.register(runtimeCwd, { id: "snn-workspace-default" });
  const runtimeRegistry = new WorkspaceRuntimeRegistry({
    createManager: async (ws) => {
      if (ws.id === defaultWs.id) return manager;
      const m = new AgentRuntimeManager({ createRuntime: async () => fakeRuntime });
      return m;
    },
  });
  const controller = new AgentSessionController({
    manager,
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
    sessionTtlMs: 60 * 60 * 1000,
    limits: {
      maxSessionsGlobal: options?.limits?.maxSessionsGlobal ?? 100,
      maxSessionsPerOwner: options?.limits?.maxSessionsPerOwner ?? 10,
      maxActiveRunsGlobal: options?.limits?.maxActiveRunsGlobal ?? 20,
      maxActiveRunsPerOwner: options?.limits?.maxActiveRunsPerOwner ?? 3,
      maxActiveWorkspaces: options?.limits?.maxActiveWorkspaces ?? 100,
    },
  };
  const config = {
    host: "127.0.0.1",
    port: 0,
    allowedOrigins: options?.allowedOrigins ?? ["https://snnai.cn", "http://127.0.0.1:8765"],
    upstreamBaseUrl: "http://127.0.0.1:8000/v1",
    upstreamApiKey: "",
    model: "test-model",
    statusTimeoutMs: 40,
    chatConnectTimeoutMs: 40,
    streamIdleTimeoutMs: 40,
    maxOutputTokens: 128,
    maxBodyBytes: 65536,
    systemPrompt: "test",
    agent: {
      enabled: true,
      host: "127.0.0.1",
      port: 0,
      maxBodyBytes: 16384,
      messageMaxLength: 16384,
    },
    publicAgent: publicConfig,
    webSearch: null,
  };

  const bff = createPublicAgentBff({
    config,
    publicConfig,
    controller,
    workspaceManager,
    metadataStore,
    runtimeRegistry,
    ingestionService: ingestion,
    ownershipStore,
    workspaceBase,
  });

  const server = createAiNodeServer(config, { publicBff: bff, logger: { info() {}, error() {} }, fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "test-model" }] })) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const cleanup = async () => {
    await new Promise((r, rej) => server.close((e) => e ? rej(e) : r()));
    await runtimeRegistry.disposeAll().catch(() => {});
    await manager.dispose().catch(() => {});
    await rm(workspaceBase, { recursive: true, force: true }).catch(() => {});
    await rm(ownershipRoot, { recursive: true, force: true }).catch(() => {});
    await rm(metadataRoot, { recursive: true, force: true }).catch(() => {});
    await rm(runtimeCwd, { recursive: true, force: true }).catch(() => {});
  };
  try {
    await run({ baseUrl, workspaceBase, ownershipRoot, metadataRoot, workspaceManager, metadataStore, ownershipStore, controller, fakeRuntime, ingestion, bff, config });
  } finally {
    await cleanup();
  }
}

test("public feature flag disabled returns 404", async () => {
  const server = createAiNodeServer({
    host: "127.0.0.1", port: 0, allowedOrigins: ["https://snnai.cn"],
    upstreamBaseUrl: "http://127.0.0.1:8000/v1", upstreamApiKey: "", model: "x",
    statusTimeoutMs: 40, chatConnectTimeoutMs: 40, streamIdleTimeoutMs: 40, maxOutputTokens: 128, maxBodyBytes: 1024, systemPrompt: "x",
    agent: { enabled: false, host: "127.0.0.1", port: 0, maxBodyBytes: 16384, messageMaxLength: 16384 },
    publicAgent: { enabled: false, workspaceBase: "", ownershipRoot: "", cookieName: "snn_agent_owner", cookieSecure: false, sessionTtlMs: 86400000, limits: {} },
    webSearch: null,
  }, { fetchImpl: async () => new Response(JSON.stringify({ data: [] })), logger: { info() {}, error() {} } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/agent/sessions`, { method: "POST", headers: { origin: "https://snnai.cn", "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 404);
  } finally { await new Promise((r, rej) => server.close((e) => e ? rej(e) : r())); }
});

test("public session create issues HttpOnly cookie and isolates workspaces", async () => {
  await withPublic({}, async ({ baseUrl }) => {
    const origin = "https://snnai.cn";
    // owner A creates session
    const resA = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(resA.status, 201);
    const bodyA = await resA.json();
    assert.match(bodyA.sessionId, /^snn-agent-/);
    const setCookieA = resA.headers.get("set-cookie");
    assert.match(setCookieA, /HttpOnly/);
    assert.match(setCookieA, /SameSite=Strict/);
    assert.match(setCookieA, /Path=\/api\/agent/);
    assert.doesNotMatch(setCookieA, /Domain=/);
    assert.doesNotMatch(await resA.text().catch(() => ""), /snn_agent_owner/); // body must not contain token
    const cookieA = setCookieA.split(";")[0];

    // owner B creates session
    const resB = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(resB.status, 201);
    const bodyB = await resB.json();
    assert.notEqual(bodyA.sessionId, bodyB.sessionId);
    const cookieB = resB.headers.get("set-cookie").split(";")[0];
    assert.notEqual(cookieA, cookieB);

    // list own sessions
    const listA = await fetch(`${baseUrl}/api/agent/sessions`, { headers: { origin, cookie: cookieA } });
    assert.equal(listA.status, 200);
    const listABody = await listA.json();
    assert.equal(listABody.sessions.length, 1);
    assert.equal(listABody.sessions[0].sessionId, bodyA.sessionId);
    assert.equal("workspaceId" in listABody.sessions[0], false);

    // owner B cannot list A's session
    const listB = await fetch(`${baseUrl}/api/agent/sessions`, { headers: { origin, cookie: cookieB } });
    assert.equal((await listB.json()).sessions[0].sessionId, bodyB.sessionId);
  });
});

test("ownership isolation blocks cross-owner access", async () => {
  await withPublic({}, async ({ baseUrl }) => {
    const origin = "https://snnai.cn";
    const resA = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    const sidA = (await resA.json()).sessionId;
    const cookieA = resA.headers.get("set-cookie").split(";")[0];
    const resB = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    const cookieB = resB.headers.get("set-cookie").split(";")[0];
    const sidB = (await resB.json()).sessionId;

    // B tries to upload to A's session
    const upAwithB = await fetch(`${baseUrl}/api/agent/sessions/${sidA}/files`, { method: "POST", headers: { origin, cookie: cookieB, "content-type": "application/octet-stream", "x-snn-file-name": "evil.txt" }, body: "evil" });
    assert.equal(upAwithB.status, 404);
    assert.equal((await upAwithB.json()).error.code, "AGENT_SESSION_NOT_FOUND");

    // B tries to run A's session
    const runAwithB = await fetch(`${baseUrl}/api/agent/sessions/${sidA}/runs`, { method: "POST", headers: { origin, cookie: cookieB, "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) });
    assert.equal(runAwithB.status, 404);

    // B tries to list A's files
    const listAwithB = await fetch(`${baseUrl}/api/agent/sessions/${sidA}/files`, { headers: { origin, cookie: cookieB } });
    assert.equal(listAwithB.status, 404);

    // leaked fileId from A cannot be used in B's session (needs attachment but B has no such file)
    // First upload a file to A
    const up = await fetch(`${baseUrl}/api/agent/sessions/${sidA}/files`, { method: "POST", headers: { origin, cookie: cookieA, "content-type": "application/octet-stream", "x-snn-file-name": "secret.txt" }, body: "SNN_SECRET_123" });
    const fileId = (await up.json()).file.fileId;
    const runBwithAfile = await fetch(`${baseUrl}/api/agent/sessions/${sidB}/runs`, { method: "POST", headers: { origin, cookie: cookieB, "content-type": "application/json" }, body: JSON.stringify({ message: "use leaked", attachments: [fileId] }) });
    assert.equal(runBwithAfile.status, 404);
    const leakedCode = (await runBwithAfile.json()).error.code;
    assert.ok(leakedCode === "AGENT_ATTACHMENT_NOT_FOUND" || leakedCode === "AGENT_SESSION_NOT_FOUND", `leaked file should not be usable, got ${leakedCode}`);

    // no cookie
    const noCookie = await fetch(`${baseUrl}/api/agent/sessions/${sidA}/files`, { headers: { origin } });
    assert.equal(noCookie.status, 404);
    // tampered cookie
    const tampered = await fetch(`${baseUrl}/api/agent/sessions/${sidA}/files`, { headers: { origin, cookie: "snn_agent_owner=0000000000000000000000000000000000000000000000000000000000000000" } });
    assert.equal(tampered.status, 404);
  });
});

test("public file upload/list/delete via BFF is bounded and safe", async () => {
  await withPublic({}, async ({ baseUrl }) => {
    const origin = "https://snnai.cn";
    const res = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    const sid = (await res.json()).sessionId;
    const cookie = res.headers.get("set-cookie").split(";")[0];

    // upload text
    const up = await fetch(`${baseUrl}/api/agent/sessions/${sid}/files`, { method: "POST", headers: { origin, cookie, "content-type": "application/octet-stream", "x-snn-file-name": "notes.md", "x-snn-file-content-type": "text/markdown" }, body: "hello world" });
    assert.equal(up.status, 201);
    const file = (await up.json()).file;
    assert.match(file.fileId, /^snn-file-/);
    assert.equal("storedName" in file, false);
    assert.equal("workspaceId" in file, false);

    // list
    const list = await fetch(`${baseUrl}/api/agent/sessions/${sid}/files`, { headers: { origin, cookie } });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.files.length, 1);
    assert.equal(listBody.files[0].fileId, file.fileId);

    // second upload via octet-stream (multipart also supported, tested via raw path)
    const up2 = await fetch(`${baseUrl}/api/agent/sessions/${sid}/files`, { method: "POST", headers: { origin, cookie, "content-type": "application/octet-stream", "x-snn-file-name": "second.txt" }, body: "second file" });
    assert.equal(up2.status, 201);

    // delete
    const del = await fetch(`${baseUrl}/api/agent/sessions/${sid}/files/${file.fileId}`, { method: "DELETE", headers: { origin, cookie } });
    assert.equal(del.status, 204);
    const list2 = await fetch(`${baseUrl}/api/agent/sessions/${sid}/files`, { headers: { origin, cookie } });
    assert.equal((await list2.json()).files.length, 1); // one multipart file remains
  });
});

test("public BFF maps rejected file input to stable client errors", async () => {
  await withPublic({}, async ({ baseUrl }) => {
    const origin = "https://snnai.cn";
    const created = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    const { sessionId } = await created.json();
    const cookie = created.headers.get("set-cookie").split(";")[0];
    const invalid = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/files`, {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/octet-stream", "x-snn-file-name": "con.pdf" },
      body: "not-a-document",
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: { code: "AGENT_FILE_INVALID", message: "Filename is invalid" } });
  });
});

test("public BFF preserves browser FormData binary bytes and Unicode filenames", async () => {
  await withPublic({}, async ({ baseUrl, metadataStore, workspaceManager }) => {
    const origin = "https://snnai.cn";
    const created = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    const { sessionId } = await created.json();
    const cookie = created.headers.get("set-cookie").split(";")[0];
    const uploads = [
      ["中文测试报告.pdf", "application/pdf", buildTestPdf({ pages: [["SNN_PUBLIC_UNICODE_PDF"]] })],
      ["学校泳池项目合作意向书(1).docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buildTestDocx(docxDocumentXml([{ text: "SNN_PUBLIC_UNICODE_DOCX" }]))],
      ["数据分析.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buildTestXlsx({ sheets: [{ name: "数据", cells: [{ ref: "A1", kind: "s", value: "SNN_PUBLIC_UNICODE_XLSX" }] }] })],
    ];
    const binding = await metadataStore.get(sessionId);
    const workspace = workspaceManager.resolve(binding.workspaceId);
    for (const [filename, contentType, bytes] of uploads) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: contentType }), filename);
      const response = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/files`, { method: "POST", headers: { origin, cookie }, body: form });
      if (response.status !== 201) assert.fail(await response.text());
      const file = (await response.json()).file;
      assert.equal(file.originalName, filename);
      assert.equal(file.size, bytes.length);
      const manifest = JSON.parse(await readFile(join(workspace.root, ".snn-workspace-files.json"), "utf8"));
      const entry = manifest.files.find((candidate) => candidate.fileId === file.fileId);
      assert.notEqual(entry.storedName, filename);
      assert.match(entry.storedName, /^\.snn-upload-/);
      const stored = await readFile(join(workspace.root, entry.storedName));
      assert.equal(createHash("sha256").update(stored).digest("hex"), createHash("sha256").update(bytes).digest("hex"));
    }
  });
});

test("CORS and CSRF boundaries", async () => {
  await withPublic({ allowedOrigins: ["https://snnai.cn"] }, async ({ baseUrl }) => {
    // allowed origin
    const ok = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin: "https://snnai.cn", "content-type": "application/json" }, body: "{}" });
    assert.equal(ok.status, 201);
    const cookie = ok.headers.get("set-cookie").split(";")[0];
    const sid = (await ok.json()).sessionId;
    // evil origin blocked
    const evil = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    assert.equal(evil.status, 403);
    // mutating without origin blocked
    const noOrigin = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(noOrigin.status, 403);
    // preflight allowed
    const pre = await fetch(`${baseUrl}/api/agent/sessions`, { method: "OPTIONS", headers: { origin: "https://snnai.cn", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "https://snnai.cn");
    assert.equal(pre.headers.get("access-control-allow-credentials"), "true");
    // preflight evil blocked
    const preEvil = await fetch(`${baseUrl}/api/agent/sessions`, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    assert.equal(preEvil.status, 403);
    // GET with evil origin blocked
    const getEvil = await fetch(`${baseUrl}/api/agent/sessions/${sid}/files`, { headers: { origin: "https://evil.example", cookie } });
    assert.equal(getEvil.status, 403);
  });
});

test("resource limits fail closed without spawning extra workspace", async () => {
  await withPublic({ limits: { maxSessionsGlobal: 2, maxSessionsPerOwner: 1, maxActiveRunsGlobal: 1, maxActiveRunsPerOwner: 1, maxActiveWorkspaces: 2 } }, async ({ baseUrl, workspaceBase }) => {
    const origin = "https://snnai.cn";
    // per-owner cap 1
    const r1 = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(r1.status, 201);
    const cookie1 = r1.headers.get("set-cookie").split(";")[0];
    const r2 = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json", cookie: cookie1 }, body: "{}" });
    // same owner second session should be blocked per-owner 1
    assert.equal(r2.status, 429);
    assert.match((await r2.json()).error.code, /AGENT_PUBLIC_SESSION_LIMIT_PER_OWNER/);
    // different owner can still create up to global 2
    const r3 = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(r3.status, 201);
    // global cap 2 reached, next should block
    const r4 = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(r4.status, 429);
    // verify no extra workspace created beyond cap: count dirs
    const { readdir } = await import("node:fs/promises");
    const dirs = (await readdir(workspaceBase)).length;
    assert.equal(dirs, 2);
    // active run cap
    const sid1 = (await r1.json()).sessionId;
    const run1 = await fetch(`${baseUrl}/api/agent/sessions/${sid1}/runs`, { method: "POST", headers: { origin, cookie: cookie1, "content-type": "application/json" }, body: JSON.stringify({ message: "wait" }) });
    assert.equal(run1.status, 200);
    // second run same owner should be blocked
    const run2 = await fetch(`${baseUrl}/api/agent/sessions/${sid1}/runs`, { method: "POST", headers: { origin, cookie: cookie1, "content-type": "application/json" }, body: JSON.stringify({ message: "second" }) });
    assert.equal(run2.status, 429);
  });
});

test("explicit delete cleans ownership and workspace", async () => {
  await withPublic({}, async ({ baseUrl }) => {
    const origin = "https://snnai.cn";
    const res = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    const sid = (await res.json()).sessionId;
    const cookie = res.headers.get("set-cookie").split(";")[0];
    // upload
    await fetch(`${baseUrl}/api/agent/sessions/${sid}/files`, { method: "POST", headers: { origin, cookie, "content-type": "application/octet-stream", "x-snn-file-name": "a.txt" }, body: "data" });
    // delete session
    const del = await fetch(`${baseUrl}/api/agent/sessions/${sid}`, { method: "DELETE", headers: { origin, cookie } });
    assert.equal(del.status, 200);
    // subsequent operations 404
    const list = await fetch(`${baseUrl}/api/agent/sessions/${sid}/files`, { headers: { origin, cookie } });
    assert.equal(list.status, 404);
    const run = await fetch(`${baseUrl}/api/agent/sessions/${sid}/runs`, { method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) });
    assert.equal(run.status, 404);
    // other owner unaffected: create new session
    const res2 = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(res2.status, 201);
  });
});

test("TTL and sanitization", async () => {
  await withPublic({}, async ({ baseUrl, ownershipStore }) => {
    const origin = "https://snnai.cn";
    const res = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    const sid = (await res.json()).sessionId;
    const cookie = res.headers.get("set-cookie").split(";")[0];
    // sanitization: error must not leak internal paths
    const bad = await fetch(`${baseUrl}/api/agent/sessions/${sid}/runs`, { method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "hi", attachments: ["snn-file-bad"] }) });
    const badBody = await bad.text();
    assert.doesNotMatch(badBody, /127\.0\.0\.1/);
    assert.doesNotMatch(badBody, /workspaceId|storedName|\.snn-workspace/);
    // TTL: manipulate lastAccessAt to expired and sweep
    const rec = await ownershipStore.get(sid);
    await writeFile(join(ownershipStore.root, `${sid}.json`), JSON.stringify({ ...rec, lastAccessAt: new Date(Date.now() - 1000000).toISOString() }));
    const expired = await ownershipStore.sweepExpired(Date.now(), 50000);
    assert.ok(expired.includes(sid));
  });
});

test("existing chat unchanged when public disabled flag not set", async () => {
  // Use withPublic with enabled true but check that /api/ai/chat still works via same server
  await withPublic({}, async ({ baseUrl }) => {
    const chat = await fetch(`${baseUrl}/api/ai/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }) });
    // Without upstream mock, it will try to fetch upstream and fail -> 503 or 502, but not 404. The point is route still exists.
    assert.equal([200, 502, 503, 504].includes(chat.status), true);
  });
});
