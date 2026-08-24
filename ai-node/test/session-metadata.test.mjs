import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionMetadataStore } from "../src/agent/session-metadata-store.mjs";
import { AgentSessionController } from "../src/agent/session-controller.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { createDefaultCapabilityResolver } from "../src/agent/capabilities/built-ins.mjs";

const sessionId = "snn-agent-00000000-0000-4000-8000-000000000001";

test("session metadata persists only stable binding references and rejects invalid state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-session-metadata-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new SessionMetadataStore(root);
  const saved = await store.create(sessionId, { schemaVersion: 1, workspaceId: "snn-workspace-test", skillId: "workspace-reader" });
  assert.deepEqual(saved, { schemaVersion: 1, workspaceId: "snn-workspace-test", skillId: "workspace-reader" });
  assert.deepEqual(await store.get(sessionId), saved);
  await assert.rejects(() => store.create(sessionId, saved), (error) => error.code === "AGENT_SESSION_METADATA_EXISTS");
  await writeFile(join(root, `${sessionId}.json`), "{not-json");
  await assert.rejects(() => store.get(sessionId), (error) => error.code === "AGENT_SESSION_METADATA_INVALID");
  await writeFile(join(root, `${sessionId}.json`), JSON.stringify({ schemaVersion: 2, workspaceId: "snn-workspace-test", skillId: "workspace-reader" }));
  await assert.rejects(() => store.get(sessionId), (error) => error.code === "AGENT_SESSION_METADATA_INVALID");
  await assert.rejects(() => store.get("snn-agent-00000000-0000-4000-8000-000000000002"), (error) => error.code === "AGENT_SESSION_METADATA_NOT_FOUND");
});

test("Session create rolls back SNN metadata when DSH session creation fails", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-session-rollback-"));
  const workspaceRoot = await mkdtemp(join(tmpdir(), "snn-session-rollback-workspace-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(workspaceRoot, { recursive: true, force: true }); });
  const workspaceManager = new WorkspaceManager();
  const workspace = await workspaceManager.register(workspaceRoot, { id: "snn-workspace-rollback" });
  const store = new SessionMetadataStore(root);
  const controller = new AgentSessionController({
    manager: { async ensureReady() { return { async createSession() { throw new Error("DSH create failed"); } }; } },
    capabilityResolver: createDefaultCapabilityResolver(),
    workspace,
    workspaceManager,
    metadataStore: store,
  });
  await assert.rejects(() => controller.createSession(), /DSH create failed/);
  const files = await (await import("node:fs/promises")).readdir(root);
  assert.deepEqual(files, []);
});
