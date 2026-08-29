// Direct workspace text editing: optimistic-concurrency save endpoint through
// the public BFF, covering the full security/validation matrix.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
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

const ORIGIN = "https://snnai.cn";

async function withEditing(run) {
  const workspaceBase = await mkdtemp(join(tmpdir(), "snn-edit-wsbase-"));
  const ownershipRoot = await mkdtemp(join(tmpdir(), "snn-edit-own-"));
  const metadataRoot = await mkdtemp(join(tmpdir(), "snn-edit-meta-"));
  const runtimeCwd = await mkdtemp(join(tmpdir(), "snn-edit-rt-"));
  const workspaceManager = new WorkspaceManager();
  const metadataStore = new SessionMetadataStore(metadataRoot);
  const ownershipStore = new PublicAgentOwnershipStore(ownershipRoot);
  const ingestion = new FileIngestionService({ workspaceManager });
  const attachmentResolver = new AttachmentContextResolver({ fileInventory: ingestion });
  const fakeRuntime = {
    async createSession() {}, async resumeSession() {},
    async *sendMessage() {}, async abort() {}, async dispose() {},
  };
  const manager = new AgentRuntimeManager({ createRuntime: async () => fakeRuntime });
  const defaultWs = await workspaceManager.register(runtimeCwd, { id: "snn-workspace-default" });
  const runtimeRegistry = new WorkspaceRuntimeRegistry({
    createManager: async (ws) => (ws.id === defaultWs.id ? manager : new AgentRuntimeManager({ createRuntime: async () => fakeRuntime })),
  });
  const controller = new AgentSessionController({
    manager, toolMetadata: BUILT_IN_TOOL_METADATA, capabilityResolver: createDefaultCapabilityResolver(),
    workspace: defaultWs, workspaceManager, metadataStore, runtimeRegistry, attachmentContextResolver: attachmentResolver,
  });
  const publicConfig = {
    enabled: true, workspaceBase, ownershipRoot, cookieName: "snn_agent_owner", cookieSecure: false,
    sessionTtlMs: 60 * 60 * 1000,
    limits: { maxSessionsGlobal: 100, maxSessionsPerOwner: 10, maxActiveRunsGlobal: 20, maxActiveRunsPerOwner: 3, maxActiveWorkspaces: 100 },
  };
  const config = {
    host: "127.0.0.1", port: 0, allowedOrigins: [ORIGIN],
    upstreamBaseUrl: "http://127.0.0.1:8000/v1", upstreamApiKey: "", model: "test-model",
    statusTimeoutMs: 40, chatConnectTimeoutMs: 40, streamIdleTimeoutMs: 40,
    maxOutputTokens: 128, maxBodyBytes: 65536, systemPrompt: "test",
    agent: { enabled: true, host: "127.0.0.1", port: 0, maxBodyBytes: 16384, messageMaxLength: 16384 },
    publicAgent: publicConfig, webSearch: null,
  };
  const bff = createPublicAgentBff({
    config, publicConfig, controller, workspaceManager, metadataStore, runtimeRegistry,
    ingestionService: ingestion, ownershipStore, workspaceBase, logger: { info() {}, error() {} },
  });
  const server = createAiNodeServer(config, { publicBff: bff, logger: { info() {}, error() {} }, fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "test-model" }] })) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const cleanup = async () => {
    await new Promise((r, rej) => server.close((e) => (e ? rej(e) : r())));
    await runtimeRegistry.disposeAll().catch(() => {});
    await manager.dispose().catch(() => {});
    await rm(workspaceBase, { recursive: true, force: true }).catch(() => {});
    await rm(ownershipRoot, { recursive: true, force: true }).catch(() => {});
    await rm(metadataRoot, { recursive: true, force: true }).catch(() => {});
    await rm(runtimeCwd, { recursive: true, force: true }).catch(() => {});
  };
  try {
    await run({ baseUrl, ingestion, workspaceManager, workspaceBase });
  } finally {
    await cleanup();
  }
}

async function createSession(baseUrl, jar) {
  const res = await fetch(`${baseUrl}/api/agent/sessions`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" });
  assert.equal(res.status, 201);
  jar.cookie = res.headers.get("set-cookie").split(";")[0];
  return (await res.json()).sessionId;
}

async function uploadText(baseUrl, jar, sessionId, name, content) {
  const res = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/files`, {
    method: "POST", headers: { origin: ORIGIN, cookie: jar.cookie, "content-type": "application/octet-stream", "x-snn-file-name": name, "x-snn-file-content-type": "text/markdown" },
    body: content,
  });
  assert.equal(res.status, 201);
  return (await res.json()).file;
}

function putContent(baseUrl, jar, sessionId, fileId, body) {
  return fetch(`${baseUrl}/api/agent/sessions/${sessionId}/files/${fileId}/content`, {
    method: "PUT", headers: { origin: ORIGIN, cookie: jar.cookie, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

test("direct edit round trip: save updates authoritative file, download returns exact bytes", async () => {
  await withEditing(async ({ baseUrl }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const file = await uploadText(baseUrl, jar, sessionId, "direct-edit.md", "DIRECT_EDIT_ORIGINAL_92841");
    const res = await putContent(baseUrl, jar, sessionId, file.fileId, { content: "DIRECT_EDIT_UPDATED_92841", baseSha256: file.sha256 });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.file.fileId, file.fileId);
    assert.equal(data.file.size, "DIRECT_EDIT_UPDATED_92841".length);
    assert.equal(data.file.storedName, undefined, "server-private storedName must never reach the client");
    assert.notEqual(data.sha256, file.sha256);
    assert.match(data.sha256, /^[a-f0-9]{64}$/);
    const download = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/files/${file.fileId}`, { headers: { origin: ORIGIN, cookie: jar.cookie } });
    assert.equal(await download.text(), "DIRECT_EDIT_UPDATED_92841");
  });
});

test("stale baseSha256 conflicts and never overwrites the newer version", async () => {
  await withEditing(async ({ baseUrl }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const file = await uploadText(baseUrl, jar, sessionId, "conflict.md", "VERSION_A");
    // Another writer (the agent path) moves the file to B while the user edits.
    const res = await putContent(baseUrl, jar, sessionId, file.fileId, { content: "VERSION_B", baseSha256: file.sha256 });
    assert.equal(res.status, 200);
    const stale = await putContent(baseUrl, jar, sessionId, file.fileId, { content: "VERSION_C", baseSha256: file.sha256 });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, "AGENT_FILE_EDIT_CONFLICT");
    const download = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/files/${file.fileId}`, { headers: { origin: ORIGIN, cookie: jar.cookie } });
    assert.equal(await download.text(), "VERSION_B");
  });
});

test("unknown, path-like, cross-session and cross-owner file ids are all concealed 404s", async () => {
  await withEditing(async ({ baseUrl }) => {
    const jarA = {};
    const sessionIdA = await createSession(baseUrl, jarA);
    const file = await uploadText(baseUrl, jarA, sessionIdA, "mine.md", "hello");
    const body = { content: "x", baseSha256: file.sha256 };

    const unknown = await putContent(baseUrl, jarA, sessionIdA, "snn-file-00000000-0000-4000-8000-000000000000", body);
    assert.equal(unknown.status, 404);

    const pathLike = await putContent(baseUrl, jarA, sessionIdA, encodeURIComponent("../escape.md"), body);
    assert.equal(pathLike.status, 404);

    const sessionIdA2 = await createSession(baseUrl, jarA);
    const crossSession = await putContent(baseUrl, jarA, sessionIdA2, file.fileId, body);
    assert.equal(crossSession.status, 404);

    const jarB = {};
    await createSession(baseUrl, jarB);
    const crossOwner = await putContent(baseUrl, jarB, sessionIdA, file.fileId, body);
    assert.equal(crossOwner.status, 404);

    const noCookie = await fetch(`${baseUrl}/api/agent/sessions/${sessionIdA}/files/${file.fileId}/content`, {
      method: "PUT", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(noCookie.status, 404);
  });
});

test("office and binary files are refused with 415", async () => {
  await withEditing(async ({ baseUrl }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const pdf = await uploadText(baseUrl, jar, sessionId, "doc.pdf", "%PDF-1.4 fake");
    const pdfRes = await putContent(baseUrl, jar, sessionId, pdf.fileId, { content: "x", baseSha256: pdf.sha256 });
    assert.equal(pdfRes.status, 415);

    // A no-extension file whose stored bytes are not valid UTF-8: 415, not a
    // silent latin1 rewrite.
    const latin = await uploadText(baseUrl, jar, sessionId, "latin", Buffer.from([0xe9, 0xe8, 0xfc]));
    const latinRes = await putContent(baseUrl, jar, sessionId, latin.fileId, { content: "x", baseSha256: latin.sha256 });
    assert.equal(latinRes.status, 415);
  });
});

test("oversized edit content is a bounded 413 and malformed requests are 400", async () => {
  await withEditing(async ({ baseUrl }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const file = await uploadText(baseUrl, jar, sessionId, "big.md", "ok");
    const big = "x".repeat(256 * 1024 + 1);
    const res = await putContent(baseUrl, jar, sessionId, file.fileId, { content: big, baseSha256: file.sha256 });
    assert.equal(res.status, 413);

    const badSha = await putContent(baseUrl, jar, sessionId, file.fileId, { content: "x", baseSha256: "not-a-hash" });
    assert.equal(badSha.status, 400);
    const noContent = await putContent(baseUrl, jar, sessionId, file.fileId, { baseSha256: file.sha256 });
    assert.equal(noContent.status, 400);
  });
});

test("tampered stored bytes fail integrity before any write happens", async () => {
  await withEditing(async ({ baseUrl, workspaceBase }) => {
    const { readdir, writeFile } = await import("node:fs/promises");
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const file = await uploadText(baseUrl, jar, sessionId, "tamper.md", "clean content");
    // Locate the session workspace root (single workspace under the base) and
    // corrupt the stored file behind the service's back.
    const wsDirs = (await readdir(workspaceBase)).filter((entry) => entry.startsWith("snn-workspace-"));
    assert.equal(wsDirs.length, 1);
    const wsRoot = join(workspaceBase, wsDirs[0]);
    const stored = (await readdir(wsRoot)).find((entry) => entry.startsWith(".snn-upload-"));
    assert.ok(stored);
    await writeFile(join(wsRoot, stored), "tampered bytes that no longer match the manifest sha");
    const res = await putContent(baseUrl, jar, sessionId, file.fileId, { content: "x", baseSha256: file.sha256 });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, "AGENT_FILE_MUTATED");
  });
});
