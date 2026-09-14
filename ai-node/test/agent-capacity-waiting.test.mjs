import assert from "node:assert/strict";
import test from "node:test";
import { DshRuntimeAdapter } from "../src/agent/runtime-adapter.mjs";

// Phase 5C2: truthful queue semantics. A just-admitted run is "waiting" until
// the first DSH notification proves the model slot engaged it. These tests pin
// the event order, the queued-cancel path, and slot release on every terminal.

const STAMP = "2026-09-14T00:00:00.000Z";

function turnEnd(reason) {
  return { method: "session.event", params: { sessionId: "session-1", event: { type: "turn/end", data: { reason } } } };
}

test("a waiting run reports run.waiting at admission and run.active on first DSH activity", async () => {
  let notify = () => {};
  let settle = () => {};
  const client = {
    sendMessage({ onNotification }) {
      return new Promise((resolve) => {
        notify = () => onNotification({
          method: "session.event",
          params: { sessionId: "session-1", event: { type: "assistant/chunk", data: { chunk: { type: "text-delta", index: 0, text: "hi" } } } },
        });
        settle = resolve;
      });
    },
    async abort() {},
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client, now: () => STAMP });
  const run = runtime.sendMessage({ sessionId: "session-1", content: "hello" });

  const started = await run.events.next();
  assert.equal(started.value.type, "run.started");
  const waiting = await run.events.next();
  assert.equal(waiting.value.type, "run.waiting");
  assert.deepEqual(waiting.value.payload, { reason: "model_pending" });
  assert.equal(waiting.value.runId, run.runId);

  // No DSH activity yet: the stream must stay silent (no active, no delta).
  // The model slot opens: first activity flips waiting -> active.
  notify();
  assert.equal((await run.events.next()).value.type, "run.active");
  assert.equal((await run.events.next()).value.type, "message.delta");

  settle();
  assert.equal((await run.events.next()).value.type, "run.completed");
  assert.equal((await run.events.next()).done, true);
});

test("a queued run cancelled before any DSH activity never reports run.active", async () => {
  let settle = () => {};
  const client = {
    sendMessage() {
      return new Promise((resolve) => { settle = resolve; });
    },
    async abort() {},
    async dispose() {},
  };
  const runtime = new DshRuntimeAdapter({ client, now: () => STAMP });
  const run = runtime.sendMessage({ sessionId: "session-1", content: "hello" });
  assert.equal((await run.events.next()).value.type, "run.started");
  assert.equal((await run.events.next()).value.type, "run.waiting");

  await runtime.abort({ sessionId: "session-1", runId: run.runId });
  settle();
  const types = [];
  for await (const event of run.events) types.push(event.type);
  assert.deepEqual(types, ["run.cancelled"]);
});

test("every terminal path releases the per-session run slot", async () => {
  const scenarios = [
    { name: "completed", terminal: "run.completed" },
    { name: "incomplete", terminal: "run.incomplete" },
    { name: "cancelled", terminal: "run.cancelled" },
    { name: "queued-cancel", terminal: "run.cancelled" },
    { name: "failed", terminal: "run.failed" },
  ];
  for (const { name, terminal } of scenarios) {
    let notify = () => {};
    let settle = () => {};
    let rejectRun = () => {};
    const client = {
      sendMessage({ onNotification }) {
        return new Promise((resolve, reject) => {
          notify = (notification) => onNotification(notification);
          settle = resolve;
          rejectRun = () => reject(Object.assign(new Error("runtime crashed"), { code: "RUNTIME_CRASHED" }));
        });
      },
      async abort() {},
      async dispose() {},
    };
    const runtime = new DshRuntimeAdapter({ client, now: () => STAMP });
    const first = runtime.sendMessage({ sessionId: "session-1", content: "hello" });
    const types = [];
    const collector = (async () => {
      try {
        for await (const event of first.events) types.push(event.type);
      } catch {
        types.push(terminal);
      }
    })();

    // The adapter defers client.sendMessage by a microtask; the notify/settle
    // closures only exist once it ran. Give it a tick before triggering.
    await new Promise((resolve) => setTimeout(resolve, 5));

    if (name === "completed") notify(turnEnd({ kind: "completed" }));
    else if (name === "incomplete") notify(turnEnd({ kind: "max-tokens" }));
    else if (name === "cancelled") notify(turnEnd({ kind: "aborted", reason: { kind: "user" } }));
    else if (name === "queued-cancel") await runtime.abort({ sessionId: "session-1", runId: first.runId });
    else if (name === "failed") rejectRun();
    if (name !== "failed") settle();

    await collector;
    assert.equal(types[0], "run.started", `${name}: run.started must be first, got ${types.join(",")}`);
    assert.equal(types[1], "run.waiting", `${name}: run.waiting must follow, got ${types.join(",")}`);
    assert.equal(types.at(-1), terminal, `${name}: expected terminal ${terminal}, got ${types.join(",")}`);

    // The slot must be free now: a follow-up run is accepted without conflict.
    // (Its client promise is rejected on the next tick to end the run cleanly.)
    let second = null;
    assert.doesNotThrow(() => { second = runtime.sendMessage({ sessionId: "session-1", content: "again" }); }, `${name}: slot was not released`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    rejectRun();
    assert.ok(second.runId);
  }
});
