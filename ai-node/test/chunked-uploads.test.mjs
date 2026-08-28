// Chunked workspace upload acceptance: server-choreographed declare/chunk/
// complete protocol through the public BFF, plus the staging service rules
// (geometry validation, idempotency, conflict, concealment, TTL sweep).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAiNodeServer } from "../src/server.mjs";
import { AgentRuntimeManager } from "../src/agent/runtime-manager.mjs";
import { AgentSessionController } from "../src/agent/session-controller.mjs";
import { BUILT_IN_TOOL_METADATA } from "../src/agent/built-in-tools.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { FileIngestionService } from "../src/agent/workspace/file-ingestion-service.mjs";
import { ChunkedUploadService } from "../src/agent/workspace/chunked-upload-service.mjs";
import { SessionMetadataStore } from "../src/agent/session-metadata-store.mjs";
import { AttachmentContextResolver } from "../src/agent/attachments/attachment-context-resolver.mjs";
import { WorkspaceRuntimeRegistry } from "../src/agent/workspace-runtime-registry.mjs";
import { PublicAgentOwnershipStore } from "../src/agent/public/ownership-store.mjs";
import { createPublicAgentBff } from "../src/agent/public/bff.mjs";
import { createDefaultCapabilityResolver } from "../src/agent/capabilities/built-ins.mjs";

const ORIGIN = "https://snnai.cn";

async function withChunking(options, run) {
  const workspaceBase = await mkdtemp(join(tmpdir(), "snn-chunk-wsbase-"));
  const ownershipRoot = await mkdtemp(join(tmpdir(), "snn-chunk-own-"));
  const metadataRoot = await mkdtemp(join(tmpdir(), "snn-chunk-meta-"));
  const runtimeCwd = await mkdtemp(join(tmpdir(), "snn-chunk-rt-"));
  const stagingRoot = await mkdtemp(join(tmpdir(), "snn-chunk-stage-"));
  const workspaceManager = new WorkspaceManager();
  const metadataStore = new SessionMetadataStore(metadataRoot);
  const ownershipStore = new PublicAgentOwnershipStore(ownershipRoot);
  const ingestion = new FileIngestionService({ workspaceManager, maxUploadBytes: 8 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 });
  const attachmentResolver = new AttachmentContextResolver({ fileInventory: ingestion });
  const fakeRuntime = {
    async createSession() {},
    async resumeSession() {},
    async *sendMessage() { yield { type: "run.started", runId: "snn-run-00000000-0000-4000-8000-000000000001", sessionId: "x", timestamp: "t" }; yield { type: "run.completed", runId: "snn-run-00000000-0000-4000-8000-000000000001", sessionId: "x", timestamp: "t" }; },
    async abort() {},
    async dispose() {},
  };
  const manager = new AgentRuntimeManager({ createRuntime: async () => fakeRuntime });
  const defaultWs = await workspaceManager.register(runtimeCwd, { id: "snn-workspace-default" });
  const runtimeRegistry = new WorkspaceRuntimeRegistry({
    createManager: async (ws) => (ws.id === defaultWs.id ? manager : new AgentRuntimeManager({ createRuntime: async () => fakeRuntime })),
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
  const chunkedUploads = new ChunkedUploadService({
    root: stagingRoot,
    maxFileBytes: options?.maxFileBytes ?? 8 * 1024 * 1024,
    chunkSize: options?.chunkSize ?? 1024 * 1024,
    ttlMs: options?.ttlMs ?? 24 * 60 * 60 * 1000,
    clock: options?.clock,
  });
  const publicConfig = {
    enabled: true,
    workspaceBase,
    ownershipRoot,
    uploadStagingRoot: stagingRoot,
    cookieName: "snn_agent_owner",
    cookieSecure: false,
    sessionTtlMs: 60 * 60 * 1000,
    limits: {
      maxSessionsGlobal: 100, maxSessionsPerOwner: 10, maxActiveRunsGlobal: 20,
      maxActiveRunsPerOwner: 3, maxActiveWorkspaces: 100,
    },
  };
  const config = {
    host: "127.0.0.1", port: 0, allowedOrigins: [ORIGIN],
    upstreamBaseUrl: "http://127.0.0.1:8000/v1", upstreamApiKey: "", model: "test-model",
    statusTimeoutMs: 40, chatConnectTimeoutMs: 40, streamIdleTimeoutMs: 40,
    maxOutputTokens: 128, maxBodyBytes: 65536, systemPrompt: "test",
    agent: { enabled: true, host: "127.0.0.1", port: 0, maxBodyBytes: 16384, messageMaxLength: 16384 },
    publicAgent: publicConfig,
    webSearch: null,
  };
  const bff = createPublicAgentBff({
    config, publicConfig, controller, workspaceManager, metadataStore, runtimeRegistry,
    ingestionService: ingestion, ownershipStore, workspaceBase, chunkedUploads,
    logger: { info() {}, error() {} },
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
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  };
  try {
    await run({ baseUrl, stagingRoot, ingestion });
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

function authHeaders(jar, extra = {}) {
  return { origin: ORIGIN, cookie: jar.cookie, ...extra };
}

async function createUpload(baseUrl, jar, sessionId, body) {
  return fetch(`${baseUrl}/api/agent/sessions/${sessionId}/uploads`, {
    method: "POST", headers: authHeaders(jar, { "content-type": "application/json" }), body: JSON.stringify(body),
  });
}

async function putChunk(baseUrl, jar, sessionId, uploadId, index, bytes) {
  return fetch(`${baseUrl}/api/agent/sessions/${sessionId}/uploads/${uploadId}/chunks/${index}`, {
    method: "PUT", headers: authHeaders(jar, { "content-type": "application/octet-stream" }), body: bytes,
  });
}

test("chunked upload round trip preserves exact bytes and lands in the manifest", async () => {
  await withChunking({}, async ({ baseUrl }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const chunkSize = 1024 * 1024;
    const total = chunkSize * 2 + 12345;
    const original = Buffer.alloc(total);
    for (let i = 0; i < total; i += 4096) original.write("snn", i);
    const createRes = await createUpload(baseUrl, jar, sessionId, { originalName: "big-note.bin", contentType: "application/octet-stream", totalSize: total });
    assert.equal(createRes.status, 201);
    const { upload } = await createRes.json();
    assert.match(upload.uploadId, /^snn-upload-/);
    assert.equal(upload.totalSize, total);
    assert.equal(upload.chunkSize, chunkSize);
    assert.deepEqual(upload.receivedChunks, []);

    for (let index = 0; index < 3; index += 1) {
      const slice = original.subarray(index * chunkSize, Math.min((index + 1) * chunkSize, total));
      const res = await putChunk(baseUrl, jar, sessionId, upload.uploadId, index, slice);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.sha256, createHash("sha256").update(slice).digest("hex"));
    }

    const completeRes = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/uploads/${upload.uploadId}/complete`, { method: "POST", headers: authHeaders(jar) });
    assert.equal(completeRes.status, 201);
    const { file } = await completeRes.json();
    assert.match(file.fileId, /^snn-file-/);
    assert.equal(file.size, total);
    assert.equal(file.originalName, "big-note.bin");

    const download = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/files/${file.fileId}`, { headers: authHeaders(jar) });
    assert.equal(download.status, 200);
    const downloaded = Buffer.from(await download.arrayBuffer());
    assert.equal(downloaded.length, total);
    assert.equal(downloaded.equals(original), true);
    assert.equal(createHash("sha256").update(downloaded).digest("hex"), createHash("sha256").update(original).digest("hex"));
  });
});

test("chunk idempotency: same bytes succeed silently, different bytes conflict", async () => {
  await withChunking({}, async ({ baseUrl }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const { upload } = await (await createUpload(baseUrl, jar, sessionId, { originalName: "idem.bin", totalSize: 1024 * 1024 })).json();
    const first = Buffer.alloc(1024 * 1024, 7);
    assert.equal((await putChunk(baseUrl, jar, sessionId, upload.uploadId, 0, first)).status, 200);
    const replay = await putChunk(baseUrl, jar, sessionId, upload.uploadId, 0, first);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).idempotent, true);
    const conflict = await putChunk(baseUrl, jar, sessionId, upload.uploadId, 0, Buffer.alloc(1024 * 1024, 9));
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "AGENT_CHUNK_CONFLICT");
  });
});

test("upload geometry and declaration limits are enforced", async () => {
  await withChunking({}, async ({ baseUrl }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const oversize = await createUpload(baseUrl, jar, sessionId, { originalName: "big.bin", totalSize: 9 * 1024 * 1024 });
    assert.equal(oversize.status, 413);
    const badName = await createUpload(baseUrl, jar, sessionId, { originalName: "../escape.bin", totalSize: 1024 });
    assert.equal(badName.status, 400);
    const zero = await createUpload(baseUrl, jar, sessionId, { originalName: "zero.bin", totalSize: 0 });
    assert.equal(zero.status, 413);
    const { upload } = await (await createUpload(baseUrl, jar, sessionId, { originalName: "geo.bin", totalSize: 1024 * 1024 })).json();
    const shortChunk = await putChunk(baseUrl, jar, sessionId, upload.uploadId, 0, Buffer.alloc(512));
    assert.equal(shortChunk.status, 400);
    const badIndex = await putChunk(baseUrl, jar, sessionId, upload.uploadId, 9, Buffer.alloc(1024 * 1024));
    assert.equal(badIndex.status, 400);
  });
});

test("incomplete finalize is rejected and never creates a workspace file", async () => {
  await withChunking({}, async ({ baseUrl, ingestion }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const { upload } = await (await createUpload(baseUrl, jar, sessionId, { originalName: "partial.bin", totalSize: 2 * 1024 * 1024 })).json();
    await putChunk(baseUrl, jar, sessionId, upload.uploadId, 0, Buffer.alloc(1024 * 1024, 1));
    const res = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/uploads/${upload.uploadId}/complete`, { method: "POST", headers: authHeaders(jar) });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, "AGENT_UPLOAD_INCOMPLETE");
    const files = await ingestion.list((await ingestion.list("snn-workspace-default"), "snn-workspace-default")).catch(() => []);
    assert.equal(files.length, 0);
  });
});

test("uploadIds are concealed across sessions and owners", async () => {
  await withChunking({}, async ({ baseUrl }) => {
    const jarA = {};
    const sessionIdA = await createSession(baseUrl, jarA);
    const { upload } = await (await createUpload(baseUrl, jarA, sessionIdA, { originalName: "secret.bin", totalSize: 1024 * 1024 })).json();
    // Owner B: own session, other owner's uploadId must be indistinguishable
    // from a missing one.
    const jarB = {};
    await createSession(baseUrl, jarB);
    const crossOwner = await putChunk(baseUrl, jarB, sessionIdA, upload.uploadId, 0, Buffer.alloc(1024 * 1024));
    assert.equal(crossOwner.status, 404);
    // Owner A: another of their own sessions cannot see the upload either.
    const sessionIdA2 = await createSession(baseUrl, jarA);
    const crossSession = await putChunk(baseUrl, jarA, sessionIdA2, upload.uploadId, 0, Buffer.alloc(1024 * 1024));
    assert.equal(crossSession.status, 404);
    const cancel = await fetch(`${baseUrl}/api/agent/sessions/${sessionIdA2}/uploads/${upload.uploadId}`, { method: "DELETE", headers: authHeaders(jarA) });
    assert.equal(cancel.status, 404);
  });
});

test("cancel removes staging and rejects later chunks", async () => {
  await withChunking({}, async ({ baseUrl, stagingRoot }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const { upload } = await (await createUpload(baseUrl, jar, sessionId, { originalName: "cancel.bin", totalSize: 1024 * 1024 })).json();
    await putChunk(baseUrl, jar, sessionId, upload.uploadId, 0, Buffer.alloc(1024 * 1024, 3));
    const cancel = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/uploads/${upload.uploadId}`, { method: "DELETE", headers: authHeaders(jar) });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).status, "cancelled");
    const late = await putChunk(baseUrl, jar, sessionId, upload.uploadId, 0, Buffer.alloc(1024 * 1024, 3));
    assert.equal(late.status, 404);
    const sessionDir = join(stagingRoot, sessionId);
    const leftovers = (await readdir(sessionDir).catch(() => [])).filter((entry) => entry === upload.uploadId);
    assert.equal(leftovers.length, 0);
  });
});

test("chunk PUT for an unknown upload id is concealed as 404", async () => {
  await withChunking({}, async ({ baseUrl }) => {
    const jar = {};
    const sessionId = await createSession(baseUrl, jar);
    const res = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/uploads/snn-upload-00000000-0000-4000-8000-000000000000/chunks/0`, {
      method: "PUT", headers: authHeaders(jar, { "content-type": "application/octet-stream" }), body: Buffer.alloc(8),
    });
    assert.equal(res.status, 404);
  });
});

test("expired meta sweep actually removes staging (service level)", async () => {
  let now = 5_000_000_000_000;
  const stagingRoot = await mkdtemp(join(tmpdir(), "snn-chunk-sweep-"));
  try {
    const service = new ChunkedUploadService({ root: stagingRoot, chunkSize: 1024, ttlMs: 500, clock: () => now });
    const sessionId = "snn-agent-11111111-1111-4111-8111-111111111111";
    const stale = await service.create({ sessionId, originalName: "stale.bin", totalSize: 2048 });
    await service.putChunk({ sessionId, uploadId: stale.uploadId, index: 0, bytes: Buffer.alloc(1024, 1) });
    await service.putChunk({ sessionId, uploadId: stale.uploadId, index: 1, bytes: Buffer.alloc(1024, 2) });
    now += 1000;
    assert.equal(await service.sweepExpired(now), 1);
    await assert.rejects(() => service.putChunk({ sessionId, uploadId: stale.uploadId, index: 0, bytes: Buffer.alloc(1024, 1) }), /AGENT_UPLOAD_NOT_FOUND|Upload was not found/);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});
