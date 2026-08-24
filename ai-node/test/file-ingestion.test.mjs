import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
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
