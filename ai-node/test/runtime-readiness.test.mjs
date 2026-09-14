import test from "node:test";
import assert from "node:assert/strict";
import { AgentRuntimeReadiness } from "../src/agent/runtime-readiness.mjs";

test("disabled readiness never starts a runtime", async () => {
  const readiness = new AgentRuntimeReadiness({ configured: false });
  assert.deepEqual(readiness.snapshot(), {
    configured: false,
    state: "disabled",
    runtimeReady: false,
    toolsReady: false,
    toolsReadyReason: "agent not configured",
    modelToolCallingVerified: "unknown",
    modelToolCalling: null,
  });
  await readiness.warm();
});

test("readiness becomes ready only after the DSH startup resolves", async () => {
  let state = "STOPPED";
  let resolveStartup;
  const readiness = new AgentRuntimeReadiness({
    configured: true,
    runtimeState: () => state,
    ensureRuntime: () => new Promise((resolve) => { resolveStartup = () => { state = "READY"; resolve(); }; }),
  });

  assert.equal(readiness.snapshot().state, "pending");
  const warm = readiness.warm();
  assert.equal(readiness.snapshot().state, "starting");
  await Promise.resolve();
  resolveStartup();
  await warm;
  assert.deepEqual(readiness.snapshot(), {
    configured: true,
    state: "ready",
    runtimeReady: true,
    toolsReady: "unknown",
    toolsReadyReason: "no capability resolver wired",
    modelToolCallingVerified: "unknown",
    modelToolCalling: null,
  });
});

test("readiness fails closed when startup or the running runtime fails", async () => {
  let state = "STOPPED";
  const startupFailure = new AgentRuntimeReadiness({
    configured: true,
    runtimeState: () => state,
    ensureRuntime: async () => { throw Object.assign(new Error("startup failed"), { code: "DSH_START_FAILED" }); },
  });
  await assert.rejects(startupFailure.warm(), /startup failed/);
  assert.equal(startupFailure.snapshot().state, "failed");

  state = "READY";
  const runtimeFailure = new AgentRuntimeReadiness({
    configured: true,
    runtimeState: () => state,
    ensureRuntime: async () => {},
  });
  assert.equal(runtimeFailure.snapshot().runtimeReady, true);
  // READY but no resolver wired -> toolsReady cannot be determined.
  assert.equal(runtimeFailure.snapshot().toolsReady, "unknown");
  state = "FAILED";
  assert.equal(runtimeFailure.snapshot().runtimeReady, false);
  assert.equal(runtimeFailure.snapshot().state, "failed");
  // A failed runtime can never have ready tools.
  assert.equal(runtimeFailure.snapshot().toolsReady, false);
  assert.equal(runtimeFailure.snapshot().toolsReadyReason, "runtime failed to start");
});

test("toolsReady is true when the runtime is READY and capability resolution succeeds", () => {
  const readiness = new AgentRuntimeReadiness({
    configured: true,
    runtimeState: () => "READY",
    ensureRuntime: async () => {},
    resolveTools: () => ["read", "edit", "workspace.list", "workspace.word.patch"],
  });
  const snapshot = readiness.snapshot();
  assert.equal(snapshot.toolsReady, true);
  assert.match(snapshot.toolsReadyReason, /4 public tools available/);
});

test("toolsReady is false with the resolver error code when capability resolution fails", () => {
  const readiness = new AgentRuntimeReadiness({
    configured: true,
    runtimeState: () => "READY",
    ensureRuntime: async () => {},
    resolveTools: () => { throw Object.assign(new Error("Skill capability is unavailable"), { code: "SNN_SKILL_CAPABILITY_UNAVAILABLE" }); },
  });
  const snapshot = readiness.snapshot();
  assert.equal(snapshot.toolsReady, false);
  assert.equal(snapshot.toolsReadyReason, "SNN_SKILL_CAPABILITY_UNAVAILABLE");
});

test("modelToolCallingVerified stays unknown until a real probe records it, then exposes only model/tool/time", () => {
  const readiness = new AgentRuntimeReadiness({
    configured: true,
    runtimeState: () => "READY",
    ensureRuntime: async () => {},
    resolveTools: () => ["read"],
  });
  assert.equal(readiness.snapshot().modelToolCallingVerified, "unknown");
  assert.equal(readiness.snapshot().modelToolCalling, null);

  assert.throws(() => readiness.recordToolCallVerification({ model: "", tool: "read" }), /model is required/);
  assert.throws(() => readiness.recordToolCallVerification({ model: "qwen", tool: "" }), /tool is required/);

  const snapshot = readiness.recordToolCallVerification({ model: "Qwen3.8-27B", tool: "workspace.list", at: "2026-09-14T00:00:00.000Z" });
  assert.equal(snapshot.modelToolCallingVerified, "verified");
  assert.deepEqual(snapshot.modelToolCalling, { lastVerifiedAt: "2026-09-14T00:00:00.000Z", model: "Qwen3.8-27B", tool: "workspace.list" });
  // No prompt/user data leaks: exactly these three keys.
  assert.deepEqual(Object.keys(snapshot.modelToolCalling).sort(), ["lastVerifiedAt", "model", "tool"]);
});
