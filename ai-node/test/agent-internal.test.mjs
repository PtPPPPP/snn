import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";
import { AgentRuntimeManager } from "../src/agent/runtime-manager.mjs";
import { AgentSessionController } from "../src/agent/session-controller.mjs";
import { BUILT_IN_TOOL_METADATA } from "../src/agent/built-in-tools.mjs";
import { createAgentInternalServer } from "../src/agent/internal-server.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function event(type, runId, sessionId) {
  return { type, runId, sessionId, timestamp: "2026-08-24T00:00:00.000Z" };
}

function createRuntime() {
  const calls = [];
  const releases = new Map();
  let number = 0;
  return {
    calls,
    async createSession(input) { calls.push(["create", input]); },
    async resumeSession(input) { calls.push(["resume", input]); },
    sendMessage({ sessionId, content }) {
      const runId = `snn-run-00000000-0000-4000-8000-${String(++number).padStart(12, "0")}`;
      const hold = deferred();
      releases.set(runId, hold);
      calls.push(["run", sessionId, content, runId]);
      return {
        runId,
        events: (async function* events() {
          yield event("run.started", runId, sessionId);
          if (content === "wait") await hold.promise;
          yield event("message.delta", runId, sessionId);
          yield event("run.completed", runId, sessionId);
        })(),
      };
    },
    async abort({ sessionId, runId }) { calls.push(["abort", sessionId, runId]); releases.get(runId)?.resolve(); },
    async dispose() { calls.push(["dispose"]); },
  };
}

async function withInternal(run) {
  const runtime = createRuntime();
  const manager = new AgentRuntimeManager({ createRuntime: async () => runtime });
  const controller = new AgentSessionController({ manager, toolMetadata: BUILT_IN_TOOL_METADATA.filter((tool) => tool.name !== "workspace.read"), maxMessageLength: 32 });
  const server = createAgentInternalServer({
    config: { enabled: true, host: "127.0.0.1", port: 0, maxBodyBytes: 64 },
    controller,
    manager,
    logger: { error() {} },
  });
  await server.listen();
  const address = server.address();
  try { await run({ baseUrl: `http://127.0.0.1:${address.port}`, runtime, manager }); }
  finally { await server.close(); await manager.dispose(); }
}

async function json(url, options = {}) {
  return fetch(url, { ...options, headers: { "content-type": "application/json", ...options.headers } });
}

test("Agent runtime config is disabled by default and loopback-only", () => {
  const config = loadConfig({ QWEN_UPSTREAM_BASE_URL: "http://127.0.0.1:8000/v1" });
  assert.equal(config.agent.enabled, false);
  assert.equal(config.agent.host, "127.0.0.1");
  assert.throws(
    () => loadConfig({ QWEN_UPSTREAM_BASE_URL: "http://127.0.0.1:8000/v1", SNN_AGENT_INTERNAL_HOST: "0.0.0.0" }),
    /127.0.0.1 only/,
  );
  assert.throws(
    () => loadConfig({ QWEN_UPSTREAM_BASE_URL: "http://127.0.0.1:8000/v1", SNN_AGENT_INTERNAL_ENABLED: "true" }),
    /SNN_AGENT_DSH_SDK_PATH is required/,
  );
  assert.throws(
    () => loadConfig({
      QWEN_UPSTREAM_BASE_URL: "http://127.0.0.1:8000/v1", SNN_AGENT_INTERNAL_ENABLED: "true",
      SNN_AGENT_DSH_SDK_PATH: "sdk.mjs", SNN_AGENT_DSH_TOOL_HOST_PATH: "tool-host.mjs", SNN_AGENT_WORKSPACE_ID: "snn-workspace-test", SNN_AGENT_SESSION_METADATA_ROOT: "metadata", SNN_AGENT_DSH_RUNTIME_EXECUTABLE: "node", SNN_AGENT_DSH_RUNTIME_ARGUMENTS: "not-json",
      SNN_AGENT_DSH_CORDIS_CONFIG: "cordis.yml", SNN_AGENT_DSH_RUNTIME_CWD: "runtime", SNN_AGENT_DSH_PROVIDER: "provider", SNN_AGENT_DSH_MODEL: "model",
    }),
    /SNN_AGENT_DSH_RUNTIME_ARGUMENTS must be a JSON string array/,
  );
});

test("internal status has only the public capability contract", async () => {
  await withInternal(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/internal/agent/status`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      enabled: true,
      runtimeState: "STOPPED",
      capabilities: { streaming: true, tools: true, toolPolicy: true, cancel: true, resume: true, persistence: true, attachments: true },
    });
  });
});

test("internal create derives the server tool policy and rejects client escalation", async () => {
  await withInternal(async ({ baseUrl, runtime }) => {
    const rejected = await json(`${baseUrl}/internal/agent/sessions`, { method: "POST", body: JSON.stringify({ toolPolicy: { default: "allow" } }) });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, "INVALID_REQUEST");

    const created = await json(`${baseUrl}/internal/agent/sessions`, { method: "POST", body: "{}" });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.match(body.sessionId, /^snn-agent-[a-f0-9-]{36}$/);
    const policy = runtime.calls.find(([kind]) => kind === "create")[1].toolPolicy;
    assert.equal(policy.default, "deny");
    assert.equal(policy.rules.find((rule) => rule.toolName === "read").decision, "allow");
    for (const name of ["write", "execute", "fetch"]) assert.equal(policy.rules.some((rule) => rule.toolName === name), false);
  });
});

test("internal create accepts only a workspace ID selector", async () => {
  await withInternal(async ({ baseUrl, runtime }) => {
    const selected = await json(`${baseUrl}/internal/agent/sessions`, { method: "POST", body: JSON.stringify({ workspaceId: "snn-workspace-a" }) });
    assert.equal(selected.status, 201);
    assert.match((await selected.json()).sessionId, /^snn-agent-[a-f0-9-]{36}$/);
    assert.equal(runtime.calls.filter(([kind]) => kind === "create").length, 1);
    const rejected = await json(`${baseUrl}/internal/agent/sessions`, { method: "POST", body: JSON.stringify({ workspaceId: "snn-workspace-a", cwd: "C:\\" }) });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, "INVALID_REQUEST");
  });
});

test("internal run streams only SNN events and maps same-session and stale cancellation conflicts", async () => {
  await withInternal(async ({ baseUrl, runtime }) => {
    const sessionId = (await (await json(`${baseUrl}/internal/agent/sessions`, { method: "POST", body: "{}" })).json()).sessionId;
    const stream = await json(`${baseUrl}/internal/agent/sessions/${sessionId}/runs`, { method: "POST", body: JSON.stringify({ message: "wait" }) });
    assert.equal(stream.status, 200);
    const runId = runtime.calls.find(([kind]) => kind === "run")[3];
    const conflict = await json(`${baseUrl}/internal/agent/sessions/${sessionId}/runs`, { method: "POST", body: JSON.stringify({ message: "second" }) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "AGENT_RUN_CONFLICT");
    const stale = await json(`${baseUrl}/internal/agent/sessions/${sessionId}/runs/snn-run-00000000-0000-4000-8000-999999999999/cancel`, { method: "POST", body: "{}" });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, "STALE_AGENT_RUN");
    const cancelled = await json(`${baseUrl}/internal/agent/sessions/${sessionId}/runs/${runId}/cancel`, { method: "POST", body: "{}" });
    assert.equal(cancelled.status, 202);
    const sse = await stream.text();
    assert.match(sse, /event: run\.started/);
    assert.match(sse, /event: run\.completed/);
    assert.doesNotMatch(sse, /toolPolicy|workspaceRoot|cwd|arguments/);
  });
});

test("internal API validates content type, JSON, body size, IDs, and methods", async () => {
  await withInternal(async ({ baseUrl }) => {
    const missingContentType = await fetch(`${baseUrl}/internal/agent/sessions`, { method: "POST", body: "{}" });
    assert.equal(missingContentType.status, 400);
    const malformed = await json(`${baseUrl}/internal/agent/sessions`, { method: "POST", body: "{" });
    assert.equal(malformed.status, 400);
    const oversized = await json(`${baseUrl}/internal/agent/sessions`, { method: "POST", body: JSON.stringify({ padding: "x".repeat(80) }) });
    assert.equal(oversized.status, 413);
    const badId = await json(`${baseUrl}/internal/agent/sessions/not-a-session/resume`, { method: "POST", body: "{}" });
    assert.equal(badId.status, 400);
    const wrongMethod = await fetch(`${baseUrl}/internal/agent/sessions`);
    assert.equal(wrongMethod.status, 405);
    for (const response of [missingContentType, malformed, oversized, badId, wrongMethod]) {
      const body = await response.clone().json();
      assert.deepEqual(Object.keys(body), ["error"]);
      assert.equal(typeof body.error.code, "string");
      assert.equal(typeof body.error.message, "string");
    }
  });
});
