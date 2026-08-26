import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { FileIngestionService } from "../src/agent/workspace/file-ingestion-service.mjs";

function body(bytes) { return (async function* () { yield Buffer.from(bytes); })(); }

test("ingestion stores safe inventory with bounded filenames and opaque binaries", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-ingest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = new WorkspaceManager();
  const workspace = await manager.register(root, { id: "snn-workspace-ingest" });
  const service = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 8, maxFiles: 2, maxTotalBytes: 12 });
  const first = await service.ingest({ workspaceId: workspace.id, originalName: "report.txt", contentType: "text/plain", body: body("hello") });
  await assert.rejects(() => service.ingest({ workspaceId: workspace.id, originalName: "report.txt", body: body(Buffer.from([0, 1])) }), (error) => error.code === "AGENT_FILE_CONFLICT");
  const second = await service.ingest({ workspaceId: workspace.id, originalName: "opaque.bin", body: body(Buffer.from([0, 1])) });
  assert.equal(second.kind, "opaque");
  assert.deepEqual(await service.list(workspace.id), [first, second]);
  await assert.rejects(() => service.ingest({ workspaceId: workspace.id, originalName: "../evil.txt", body: body("x") }), (error) => error.code === "AGENT_FILE_INVALID");
  await assert.rejects(() => service.ingest({ workspaceId: workspace.id, originalName: "big.txt", body: body("123456789") }), (error) => error.code === "AGENT_FILE_TOO_LARGE");
  await service.remove({ workspaceId: workspace.id, fileId: first.fileId });
  assert.deepEqual(await service.list(workspace.id), [second]);
});

test("file retrieval returns verified bytes and rejects mutation or unknown ids", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-retrieve-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = new WorkspaceManager();
  const workspace = await manager.register(root, { id: "snn-workspace-retrieve" });
  const service = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 64 });
  const uploaded = await service.ingest({ workspaceId: workspace.id, originalName: "result.md", contentType: "text/markdown", body: body("before") });
  const result = await service.readFile({ workspaceId: workspace.id, fileId: uploaded.fileId });
  assert.deepEqual(result.file, uploaded);
  assert.equal(result.bytes.toString("utf8"), "before");
  await assert.rejects(() => service.readFile({ workspaceId: workspace.id, fileId: "snn-file-unknown-0000-4000-8000-000000000000" }), (error) => error.code === "AGENT_FILE_NOT_FOUND");
  const manifest = JSON.parse(await readFile(join(root, ".snn-workspace-files.json"), "utf8"));
  await writeFile(join(root, manifest.files[0].storedName), "tampered");
  await assert.rejects(() => service.readFile({ workspaceId: workspace.id, fileId: uploaded.fileId }), (error) => error.code === "AGENT_FILE_MUTATED");
});

test("manifest-managed text mutation preserves fileId and rejects stale or escaping paths", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-edit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = new WorkspaceManager();
  const workspace = await manager.register(root, { id: "snn-workspace-edit" });
  const service = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 64 });
  const uploaded = await service.ingest({ workspaceId: workspace.id, originalName: "notes.md", contentType: "text/markdown", body: body("version one") });
  const initial = await service.readEditableText({ workspaceId: workspace.id, virtualPath: "notes.md" });
  const edited = await service.writeEditableText({ workspaceId: workspace.id, virtualPath: "notes.md", content: "version two", expected: { kind: "replaceIfVersion", version: initial.version } });
  assert.equal(edited.file.fileId, uploaded.fileId);
  assert.notEqual(edited.file.sha256, initial.version);
  assert.equal((await service.readEditableText({ workspaceId: workspace.id, virtualPath: "notes.md" })).content, "version two");
  assert.equal((await service.readFile({ workspaceId: workspace.id, fileId: uploaded.fileId })).bytes.toString("utf8"), "version two");
  await assert.rejects(() => service.writeEditableText({ workspaceId: workspace.id, virtualPath: "notes.md", content: "stale", expected: { kind: "replaceIfVersion", version: initial.version } }), (error) => error.code === "AGENT_FILE_STALE");
  const created = await service.writeEditableText({ workspaceId: workspace.id, virtualPath: "docs/summary.md", content: "created", expected: { kind: "createIfAbsent" } });
  assert.equal(created.operation, "create");
  assert.equal((await service.resolveVirtualPath({ workspaceId: workspace.id, virtualPath: "docs/summary.md" })).file.fileId, created.file.fileId);
  await assert.rejects(() => service.resolveVirtualPath({ workspaceId: workspace.id, virtualPath: "../outside.txt" }), (error) => error.code === "AGENT_FILE_PATH_INVALID");
  await assert.rejects(() => service.writeEditableText({ workspaceId: workspace.id, virtualPath: "notes.md", content: "new", expected: { kind: "createIfAbsent" } }), (error) => error.code === "AGENT_FILE_EXISTS");
  await service.ingest({ workspaceId: workspace.id, originalName: "report.pdf", contentType: "application/pdf", body: body("%PDF-1.4") });
  await assert.rejects(() => service.writeEditableText({ workspaceId: workspace.id, virtualPath: "report.pdf", content: "corrupt", expected: undefined }), (error) => error.code === "AGENT_FILE_NOT_EDITABLE");
});

test("a v1 manifest upgrades to v2 on mutation and survives a fresh service reload", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-v1-migrate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = new WorkspaceManager();
  const workspace = await manager.register(root, { id: "snn-workspace-v1-migrate" });
  const fileId = "snn-file-11111111-1111-4111-8111-111111111111";
  const storedName = ".snn-upload-11111111-1111-4111-8111-111111111111";
  const original = Buffer.from("legacy version", "utf8");
  await writeFile(join(root, storedName), original);
  await writeFile(join(root, ".snn-workspace-files.json"), JSON.stringify({ schemaVersion: 1, files: [{ fileId, originalName: "legacy.md", storedName, size: original.length, contentType: "text/markdown", kind: "text", sha256: createHash("sha256").update(original).digest("hex") }] }));
  const service = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 64 });
  const before = await service.readEditableText({ workspaceId: workspace.id, virtualPath: "legacy.md" });
  await service.writeEditableText({ workspaceId: workspace.id, virtualPath: "legacy.md", content: "migrated version", expected: { kind: "replaceIfVersion", version: before.version } });
  const manifest = JSON.parse(await readFile(join(root, ".snn-workspace-files.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.files[0].fileId, fileId);
  assert.equal(manifest.files[0].virtualPath, "legacy.md");
  const reloaded = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 64 });
  assert.equal((await reloaded.readEditableText({ workspaceId: workspace.id, virtualPath: "legacy.md" })).content, "migrated version");
});

test("copy-on-write keeps the prior manifest authoritative across storage failure windows", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-cow-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = new WorkspaceManager();
  const workspace = await manager.register(root, { id: "snn-workspace-cow-test" });
  const base = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 64 });
  await base.ingest({ workspaceId: workspace.id, originalName: "notes.md", contentType: "text/markdown", body: body("old") });
  const old = await base.readEditableText({ workspaceId: workspace.id, virtualPath: "notes.md" });
  const failBlob = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 64, io: { writeFile: async (path, ...args) => { if (String(path).endsWith(".stage")) throw new Error("blob write failed"); return writeFile(path, ...args); } } });
  await assert.rejects(() => failBlob.writeEditableText({ workspaceId: workspace.id, virtualPath: "notes.md", content: "new", expected: { kind: "replaceIfVersion", version: old.version } }));
  assert.equal((await base.readEditableText({ workspaceId: workspace.id, virtualPath: "notes.md" })).content, "old");
  const failManifest = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 64, io: { rename: async (from, to) => { if (String(to).endsWith(".snn-workspace-files.json")) throw new Error("manifest publish failed"); return rename(from, to); } } });
  await assert.rejects(() => failManifest.writeEditableText({ workspaceId: workspace.id, virtualPath: "notes.md", content: "new", expected: { kind: "replaceIfVersion", version: old.version } }));
  assert.equal((await base.readEditableText({ workspaceId: workspace.id, virtualPath: "notes.md" })).content, "old");
  const oldStored = (await base.resolveVirtualPath({ workspaceId: workspace.id, virtualPath: "notes.md" })).file.storedName;
  const cleanupFailure = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 64, io: { rm: async (path, options) => { if (String(path).endsWith(oldStored)) throw new Error("old cleanup failed"); return rm(path, options); } } });
  await cleanupFailure.writeEditableText({ workspaceId: workspace.id, virtualPath: "notes.md", content: "new", expected: { kind: "replaceIfVersion", version: old.version } });
  assert.equal((await base.readEditableText({ workspaceId: workspace.id, virtualPath: "notes.md" })).content, "new");
});
