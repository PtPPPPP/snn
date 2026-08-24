import assert from "node:assert/strict";
import test from "node:test";
import { DshClient } from "../src/agent/dsh-client.mjs";
import { DshRuntimeAdapter } from "../src/agent/runtime-adapter.mjs";
import { AgentRuntimeManager } from "../src/agent/runtime-manager.mjs";
import { AgentSessionController } from "../src/agent/session-controller.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test("runtime adapter creates and resumes sessions through its client", async () => {
  const calls = [];
  const client = {
    async createSession(options) { calls.push(["create", options]); return { sessionId: "session-1" }; },
    async resumeSession(options) { calls.push(["resume", options]); return { sessionId: options.sessionId }; },
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client });

  assert.deepEqual(await runtime.createSession({ sessionId: "session-1" }), { sessionId: "session-1" });
  assert.deepEqual(await runtime.resumeSession({ sessionId: "session-1" }), { sessionId: "session-1" });
  assert.deepEqual(calls, [
    ["create", { sessionId: "session-1" }],
    ["resume", { sessionId: "session-1" }],
  ]);
});

test("runtime adapter forwards DSH notifications as SNN events", async () => {
  const client = {
    async createSession() { return { sessionId: "session-1" }; },
    async sendMessage({ onNotification }) {
      onNotification({
        method: "session.event",
        params: {
          sessionId: "session-1",
          event: { type: "assistant/chunk", data: { chunk: { type: "text-delta", index: 0, text: "hello" } } },
        },
      });
      onNotification({
        method: "session.event",
        params: {
          sessionId: "session-1",
          event: { type: "turn/end", data: { reason: { kind: "completed" } } },
        },
      });
    },
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client, now: () => "2026-08-23T00:00:00.000Z" });
  const run = runtime.sendMessage({ sessionId: "session-1", content: "hello" });
  const events = await collect(run.events);

  assert.deepEqual(events.map((event) => event.type), ["run.started", "message.delta", "run.completed"]);
  assert.ok(events.every((event) => event.runId === run.runId));
});

test("runtime adapter does not mislabel a DSH tool request as execution start", async () => {
  const diagnostics = [];
  const client = {
    async sendMessage({ onNotification }) {
      onNotification({
        method: "session.event",
        params: {
          sessionId: "session-1",
          event: { type: "tool/call", data: { callId: "call-1", name: "read", arguments: "{}" } },
        },
      });
      onNotification({
        method: "session.event",
        params: {
          sessionId: "session-1",
          event: {
            type: "tool/result",
            data: { message: { content: [{ type: "tool-result", toolCallId: "call-1", content: [], isError: false }] } },
          },
        },
      });
      onNotification({
        method: "session.event",
        params: { sessionId: "session-1", event: { type: "turn/end", data: { reason: { kind: "completed" } } } },
      });
    },
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client, onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });
  const run = runtime.sendMessage({ sessionId: "session-1", content: "hello" });
  const events = await collect(run.events);

  assert.deepEqual(events.map((event) => event.type), ["run.started", "run.completed"]);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TOOL_RESULT_WITHOUT_EXECUTION_START"), true);
});

test("runtime adapter delegates abort for an active run", async () => {
  const pending = deferred();
  const aborts = [];
  const client = {
    sendMessage() { return pending.promise; },
    async abort(input) { aborts.push(input); },
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client });
  const run = runtime.sendMessage({ sessionId: "session-1", content: "hello" });
  assert.equal((await run.events.next()).value.type, "run.started");

  await runtime.abort({ sessionId: "session-1", runId: run.runId });
  assert.deepEqual(aborts, [{ sessionId: "session-1", runId: run.runId }]);
  pending.resolve();
  assert.equal((await run.events.next()).done, true);
});

test("runtime adapter rejects abort for a run that is not active", async () => {
  const client = { async dispose() {} };
  const runtime = new DshRuntimeAdapter({ client });
  assert.throws(
    () => runtime.abort({ sessionId: "session-1", runId: "snn-run-missing" }),
    /not active/,
  );
});

test("runtime adapter reports run.failed when the child runtime crashes after a cancel request", async () => {
  const diagnostics = [];
  let rejectSendMessage;
  const client = {
    sendMessage() {
      return new Promise((_, reject) => { rejectSendMessage = reject; });
    },
    async abort() {},
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({
    client,
    now: () => "2026-08-23T00:00:00.000Z",
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  const run = runtime.sendMessage({ sessionId: "session-1", content: "hello" });
  assert.equal((await run.events.next()).value.type, "run.started");

  await runtime.abort({ sessionId: "session-1", runId: run.runId });
  // The child runtime dies instead of answering with a terminal fact. A
  // client-side timeout or transport loss must never masquerade as
  // run.cancelled: only the runtime's own terminal fact may.
  rejectSendMessage(Object.assign(new Error("DeepSeek Harness runtime exited"), { code: "TRANSPORT_CLOSED" }));
  const events = [];
  await assert.rejects(
    async () => {
      for await (const event of run.events) events.push(event);
    },
    /runtime exited/,
  );
  // run.started was consumed above; the terminal fact is run.failed exactly once.
  assert.deepEqual(events.map((event) => event.type), ["run.failed"]);
  assert.equal(events[0].error.code, "TRANSPORT_CLOSED");
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "SNN_RUN_DUPLICATE_TERMINAL"), false);
});

test("runtime adapter rejects overlapping runs for one session", async () => {
  const pending = deferred();
  const client = {
    sendMessage() { return pending.promise; },
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client });
  const first = runtime.sendMessage({ sessionId: "session-1", content: "first" });

  assert.throws(
    () => runtime.sendMessage({ sessionId: "session-1", content: "second" }),
    /already has an active run/,
  );
  pending.resolve();
  await collect(first.events);
});

test("runtime adapter emits run.failed and preserves the runtime rejection", async () => {
  const failure = Object.assign(new Error("runtime crashed"), { code: "RUNTIME_CRASHED" });
  const client = {
    async sendMessage() { throw failure; },
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client, now: () => "2026-08-23T00:00:00.000Z" });
  const run = runtime.sendMessage({ sessionId: "session-1", content: "hello" });
  const events = [];

  await assert.rejects(async () => {
    for await (const event of run.events) events.push(event);
  }, failure);
  assert.deepEqual(events.map((event) => event.type), ["run.started", "run.failed"]);
  assert.deepEqual(events[1].error, { code: "RUNTIME_CRASHED", message: "runtime crashed" });
});

test("runtime adapter emits exactly one terminal event", async () => {
  const diagnostics = [];
  const client = {
    async sendMessage({ onNotification }) {
      for (const reason of [{ kind: "completed" }, { kind: "aborted", reason: { kind: "user" } }]) {
        onNotification({
          method: "session.event",
          params: { sessionId: "session-1", event: { type: "turn/end", data: { reason } } },
        });
      }
    },
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client, onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });
  const run = runtime.sendMessage({ sessionId: "session-1", content: "hello" });
  const events = await collect(run.events);

  assert.deepEqual(events.map((event) => event.type), ["run.started", "run.completed"]);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "SNN_RUN_DUPLICATE_TERMINAL"), true);
});

test("runtime adapter disposes its client once", async () => {
  let disposals = 0;
  const runtime = new DshRuntimeAdapter({ client: { async dispose() { disposals += 1; } } });

  await Promise.all([runtime.dispose(), runtime.dispose()]);
  assert.equal(disposals, 1);
  assert.throws(() => runtime.createSession(), /disposed/);
});

test("DSH client uses the official high-level session API", async () => {
  const calls = [];
  const harness = {
    async start() { calls.push("start"); },
    session(sessionId) {
      calls.push(["session", sessionId]);
      return {
        async run(contentBlocks, options) {
          calls.push(["run", contentBlocks]);
          options.onNotification({ method: "session.status", params: { sessionId, status: "running" } });
          return { sessionId };
        },
      };
    },
    async close() { calls.push("close"); },
  };
  const notifications = [];
  const client = new DshClient({ createHarness: () => harness, harnessOptions: { launch: {} } });

  await client.createSession({ sessionId: "session-1" });
  await client.resumeSession({ sessionId: "session-1" });
  await client.sendMessage({
    sessionId: "session-1",
    contentBlocks: [{ type: "text", text: "hello" }],
    onNotification: (notification) => notifications.push(notification),
  });
  await client.dispose();

  assert.deepEqual(calls, [
    "start",
    ["session", "session-1"],
    ["run", [{ type: "text", text: "hello" }]],
    "close",
  ]);
  assert.equal(notifications.length, 1);
});

test("DSH client delegates resume and cancel to the official SDK", async () => {
  const calls = [];
  const harness = {
    async start() {},
    async close() {},
    async resumeSession(sessionId, toolPolicy) { calls.push(["resume", sessionId, toolPolicy]); },
    session(sessionId) { return { async cancel() { calls.push(["cancel", sessionId]); } }; },
  };
  const client = new DshClient({ createHarness: () => harness, harnessOptions: {} });

  await client.resumeSession({ sessionId: "cold-session", toolPolicy: { default: "deny" } });
  await client.abort({ sessionId: "cold-session", runId: "run-1" });
  await client.dispose();

  assert.deepEqual(calls, [
    ["resume", "cold-session", { default: "deny" }],
    ["cancel", "cold-session"],
  ]);
});

test("DSH client cancel and sendMessage reject unknown sessions without runtime traffic", async () => {
  const calls = [];
  const harness = {
    async start() {},
    async close() {},
    session(sessionId) {
      return {
        async run() { calls.push(["run", sessionId]); return {}; },
        async cancel() { calls.push(["cancel", sessionId]); return "idle"; },
      };
    },
  };
  const client = new DshClient({ createHarness: () => harness, harnessOptions: {} });
  await client.start();

  await assert.rejects(
    () => client.abort({ sessionId: "ghost", runId: "run-1" }),
    (error) => error.code === "AGENT_SESSION_NOT_FOUND",
  );
  await assert.rejects(
    () => client.sendMessage({ sessionId: "ghost", contentBlocks: [], onNotification: () => {} }),
    (error) => error.code === "AGENT_SESSION_NOT_FOUND",
  );
  assert.deepEqual(calls, []);
  await client.dispose();
});

test("DSH client re-resume of a known session is local and sends no wire request", async () => {
  const resumes = [];
  const harness = {
    async start() {},
    async close() {},
    async resumeSession(sessionId) { resumes.push(sessionId); },
    session() { throw new Error("unexpected session use"); },
  };
  const client = new DshClient({ createHarness: () => harness, harnessOptions: {} });

  const first = await client.resumeSession({ sessionId: "warm-session" });
  const second = await client.resumeSession({ sessionId: "warm-session" });
  assert.deepEqual(first, { sessionId: "warm-session" });
  assert.deepEqual(second, { sessionId: "warm-session" });
  assert.deepEqual(resumes, ["warm-session"]);
  await client.dispose();
});

test("DSH client maps a missing persisted session to the stable SNN error", async () => {
  const client = new DshClient({
    createHarness: () => ({
      async start() {},
      async close() {},
      async resumeSession() { throw Object.assign(new Error("missing"), { code: "SESSION_NOT_FOUND" }); },
    }),
    harnessOptions: {},
  });
  await assert.rejects(
    () => client.resumeSession({ sessionId: "missing-session" }),
    (error) => error.code === "AGENT_SESSION_NOT_FOUND",
  );
  await client.dispose();
});

test("DSH client maps only the exact real-child missing-session JSON-RPC error", async () => {
  const sessionId = "missing-session";
  const missing = new DshClient({
    createHarness: () => ({ async start() {}, async close() {}, async resumeSession() { throw Object.assign(new Error(`session "${sessionId}" not found`), { name: "JsonRpcResponseError", code: -32603 }); } }),
    harnessOptions: {},
  });
  await assert.rejects(() => missing.resumeSession({ sessionId }), (error) => error.code === "AGENT_SESSION_NOT_FOUND");
  await missing.dispose();
  const generic = new DshClient({
    createHarness: () => ({ async start() {}, async close() {}, async resumeSession() { throw Object.assign(new Error("session persistence is not configured"), { name: "JsonRpcResponseError", code: -32603 }); } }),
    harnessOptions: {},
  });
  await assert.rejects(() => generic.resumeSession({ sessionId }), (error) => error.code !== "AGENT_SESSION_NOT_FOUND");
  await generic.dispose();
});

test("runtime manager starts once, observes child failure, and permits one explicit recovery", async () => {
  let creates = 0;
  let disposals = 0;
  let fail;
  function runtime() {
    return {
      async createSession() {}, async resumeSession() {}, sendMessage() {}, async abort() {},
      async dispose() { disposals += 1; },
      onFailure(listener) { fail = listener; },
    };
  }
  const manager = new AgentRuntimeManager({ createRuntime: async () => { creates += 1; return runtime(); } });
  await Promise.all([manager.ensureReady(), manager.ensureReady()]);
  assert.equal(creates, 1);
  assert.equal(manager.state, "READY");
  fail(Object.assign(new Error("child exited"), { code: "TRANSPORT_CLOSED" }));
  assert.equal(manager.state, "FAILED");
  await manager.ensureReady();
  assert.equal(creates, 2);
  assert.equal(disposals, 1);
  await Promise.all([manager.dispose(), manager.dispose()]);
  assert.equal(manager.state, "STOPPED");
  assert.equal(disposals, 2);
});

test("session controller uses one server policy and isolates same-session ownership", async () => {
  const calls = [];
  const pending = deferred();
  const manager = {
    async ensureReady() {
      return {
        async createSession(input) { calls.push(["create", input]); },
        async resumeSession(input) { calls.push(["resume", input]); },
        sendMessage() { return { runId: "snn-run-00000000-0000-4000-8000-000000000001", events: pending.promise }; },
        async abort(input) { calls.push(["abort", input]); },
      };
    },
  };
  const controller = new AgentSessionController({ manager, toolMetadata: [{ name: "read", risk: "READ" }, { name: "write", risk: "WRITE" }] });
  const created = await controller.createSession();
  const policy = calls[0][1].toolPolicy;
  assert.equal(policy.default, "deny");
  assert.deepEqual(policy.rules, [{ toolName: "read", decision: "allow" }]);
  const run = await controller.startRun(created.sessionId, "hello");
  await assert.rejects(() => controller.startRun(created.sessionId, "again"), (error) => error.code === "AGENT_RUN_CONFLICT");
  await assert.rejects(() => controller.cancel(created.sessionId, "snn-run-00000000-0000-4000-8000-000000000002"), (error) => error.code === "STALE_AGENT_RUN");
  await controller.cancel(created.sessionId, run.runId);
  controller.finish(created.sessionId, run.runId);
  assert.equal(controller.activeRunId(created.sessionId), undefined);
});
