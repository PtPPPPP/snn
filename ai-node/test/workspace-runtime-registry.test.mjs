import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceRuntimeRegistry } from "../src/agent/workspace-runtime-registry.mjs";
import { AgentSessionController } from "../src/agent/session-controller.mjs";
import { SessionMetadataStore } from "../src/agent/session-metadata-store.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { createDefaultCapabilityResolver } from "../src/agent/capabilities/built-ins.mjs";

test("workspace runtime registry single-flights per workspace and isolates keys", async () => {
  const created = [];
  const registry = new WorkspaceRuntimeRegistry({ createManager: async (workspace) => { const manager = { workspaceId: workspace.id, async ensureReady() {}, async dispose() {} }; created.push(manager); return manager; } });
  const a = { id: "snn-workspace-a" }; const b = { id: "snn-workspace-b" };
  const [a1, a2, b1] = await Promise.all([registry.getOrCreate(a), registry.getOrCreate(a), registry.getOrCreate(b)]);
  assert.equal(a1, a2); assert.notEqual(a1, b1); assert.equal(created.length, 2);
});

test("failed workspace creation is removed so a later call can recover", async () => {
  let attempts = 0;
  const registry = new WorkspaceRuntimeRegistry({ createManager: async () => { attempts += 1; if (attempts === 1) throw new Error("start failed"); return { async ensureReady() {}, async dispose() {} }; } });
  await assert.rejects(() => registry.getOrCreate({ id: "snn-workspace-a" }), /start failed/);
  await registry.getOrCreate({ id: "snn-workspace-a" });
  assert.equal(attempts, 2);
});

test("a failed workspace startup does not affect another workspace", async () => {
  const registry = new WorkspaceRuntimeRegistry({
    createManager: async (workspace) => {
      if (workspace.id === "snn-workspace-a") throw new Error("workspace A failed");
      return { workspaceId: workspace.id, async ensureReady() {}, async dispose() {} };
    },
  });
  const [failed, ready] = await Promise.allSettled([
    registry.getOrCreate({ id: "snn-workspace-a" }),
    registry.getOrCreate({ id: "snn-workspace-b" }),
  ]);
  assert.equal(failed.status, "rejected");
  assert.equal(ready.status, "fulfilled");
  assert.equal(ready.value.workspaceId, "snn-workspace-b");
  assert.equal(registry.get("snn-workspace-a"), undefined);
});

test("disposeAll attempts every workspace even when one disposal fails", async () => {
  const disposed = [];
  const registry = new WorkspaceRuntimeRegistry({
    createManager: async (workspace) => ({
      async ensureReady() {},
      async dispose() {
        disposed.push(workspace.id);
        if (workspace.id === "snn-workspace-a") throw new Error("A disposal failed");
      },
    }),
  });
  await Promise.all([
    registry.getOrCreate({ id: "snn-workspace-a" }),
    registry.getOrCreate({ id: "snn-workspace-b" }),
    registry.getOrCreate({ id: "snn-workspace-c" }),
  ]);
  await assert.rejects(() => registry.disposeAll(), /A disposal failed/);
  assert.deepEqual(disposed.sort(), ["snn-workspace-a", "snn-workspace-b", "snn-workspace-c"]);
  assert.equal(registry.get("snn-workspace-a"), undefined);
  assert.equal(registry.get("snn-workspace-b"), undefined);
  assert.equal(registry.get("snn-workspace-c"), undefined);
});

test("sessions route to their bound workspace manager and cancel through its owner", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-workspace-routing-"));
  const aRoot = await mkdtemp(join(tmpdir(), "snn-workspace-routing-a-"));
  const bRoot = await mkdtemp(join(tmpdir(), "snn-workspace-routing-b-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(aRoot, { recursive: true, force: true }); await rm(bRoot, { recursive: true, force: true }); });
  const workspaces = new WorkspaceManager();
  const workspaceA = await workspaces.register(aRoot, { id: "snn-workspace-routing-a" });
  const workspaceB = await workspaces.register(bRoot, { id: "snn-workspace-routing-b" });
  const created = [];
  const registry = new WorkspaceRuntimeRegistry({
    createManager: async (workspace) => {
      const calls = [];
      const runtime = {
        async createSession(input) { calls.push(["create", input]); },
        sendMessage({ sessionId }) {
          const runId = `snn-run-${workspace.id}-00000000`;
          calls.push(["run", sessionId, runId]);
          return { runId, events: (async function* () {})() };
        },
        async abort(input) { calls.push(["abort", input]); },
      };
      const manager = { workspaceId: workspace.id, calls, async ensureReady() { return runtime; }, async dispose() {} };
      created.push(manager);
      return manager;
    },
  });
  const controller = new AgentSessionController({
    manager: { async ensureReady() { throw new Error("global manager must not be used"); } },
    capabilityResolver: createDefaultCapabilityResolver(),
    workspace: workspaceA,
    workspaceManager: workspaces,
    metadataStore: new SessionMetadataStore(root),
    runtimeRegistry: registry,
  });

  const a1 = await controller.createSession({ workspaceId: workspaceA.id });
  const a2 = await controller.createSession({ workspaceId: workspaceA.id });
  const b1 = await controller.createSession({ workspaceId: workspaceB.id });
  assert.equal(created.length, 2, "one manager per workspace");
  const managerA = created.find((manager) => manager.workspaceId === workspaceA.id);
  const managerB = created.find((manager) => manager.workspaceId === workspaceB.id);
  assert.equal(managerA.calls.filter(([kind]) => kind === "create").length, 2);
  assert.equal(managerB.calls.filter(([kind]) => kind === "create").length, 1);

  const run = await controller.startRun(b1.sessionId, "read the workspace");
  await controller.cancel(b1.sessionId, run.runId);
  assert.equal(managerA.calls.some(([kind]) => kind === "abort"), false);
  assert.deepEqual(managerB.calls.find(([kind]) => kind === "abort"), ["abort", { sessionId: b1.sessionId, runId: run.runId }]);
  assert.equal(controller.activeRunId(a1.sessionId), undefined);
  assert.equal(controller.activeRunId(a2.sessionId), undefined);
});
