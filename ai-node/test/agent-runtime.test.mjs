import assert from "node:assert/strict";
import test from "node:test";
import { DshClient } from "../src/agent/dsh-client.mjs";
import { DshExtensionRequiredError } from "../src/agent/contract.mjs";
import { DshRuntimeAdapter } from "../src/agent/runtime-adapter.mjs";

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

test("DSH client fails loud for SDK resume and cancel gaps", async () => {
  const harness = { async start() {}, async close() {} };
  const client = new DshClient({ createHarness: () => harness, harnessOptions: {} });

  await assert.rejects(
    client.resumeSession({ sessionId: "cold-session" }),
    (error) => error instanceof DshExtensionRequiredError && error.code === "DSH_EXTENSION_REQUIRED",
  );
  await client.createSession({ sessionId: "session-1" });
  await assert.rejects(
    client.abort({ sessionId: "session-1", runId: "run-1" }),
    (error) => error instanceof DshExtensionRequiredError && /session\/cancel/.test(error.extensionPoint),
  );
  await client.dispose();
});
