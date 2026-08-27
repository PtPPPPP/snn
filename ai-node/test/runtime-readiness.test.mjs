import test from "node:test";
import assert from "node:assert/strict";
import { AgentRuntimeReadiness } from "../src/agent/runtime-readiness.mjs";

test("disabled readiness never starts a runtime", async () => {
  const readiness = new AgentRuntimeReadiness({ configured: false });
  assert.deepEqual(readiness.snapshot(), {
    configured: false,
    state: "disabled",
    runtimeReady: false,
    toolsReady: "unknown",
    modelToolCallingVerified: "unknown",
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
    modelToolCallingVerified: "unknown",
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
  state = "FAILED";
  assert.equal(runtimeFailure.snapshot().runtimeReady, false);
  assert.equal(runtimeFailure.snapshot().state, "failed");
});
