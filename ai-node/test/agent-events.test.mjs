import assert from "node:assert/strict";
import test from "node:test";
import { adaptDshNotification } from "../src/agent/event-adapter.mjs";

const context = {
  runId: "run-1",
  sessionId: "session-1",
  now: () => "2026-08-23T00:00:00.000Z",
};

function sessionEvent(type, data) {
  return {
    method: "session.event",
    params: { sessionId: "session-1", event: { type, seq: 1, time: 1, data } },
  };
}

test("adapts message delta without exposing the DSH event name", () => {
  const event = adaptDshNotification(sessionEvent("assistant/chunk", {
    chunk: { type: "text-delta", index: 0, text: "hello" },
  }), context);

  assert.deepEqual(event, {
    type: "message.delta",
    runId: "run-1",
    sessionId: "session-1",
    timestamp: "2026-08-23T00:00:00.000Z",
    payload: { text: "hello" },
  });
  assert.equal(JSON.stringify(event).includes("assistant/chunk"), false);
});

test("adapts reasoning lifecycle", () => {
  const started = adaptDshNotification(sessionEvent("assistant/chunk", {
    chunk: { type: "block-start", index: 0, blockType: "reasoning" },
  }), context);
  const delta = adaptDshNotification(sessionEvent("assistant/chunk", {
    chunk: { type: "reasoning-delta", index: 0, text: "think" },
  }), context);
  const completed = adaptDshNotification(sessionEvent("assistant/chunk", {
    chunk: { type: "block-end", index: 0, block: { type: "reasoning", text: "think" } },
  }), context);

  assert.deepEqual([started.type, delta.type, completed.type], [
    "reasoning.started",
    "reasoning.delta",
    "reasoning.completed",
  ]);
});

test("adapts tool started", () => {
  const event = adaptDshNotification(sessionEvent("tool/call", {
    callId: "call-1",
    name: "read_file",
    arguments: '{"path":"README.md"}',
  }), context);

  assert.equal(event.type, "tool.started");
  assert.equal(event.toolCallId, "call-1");
  assert.deepEqual(event.payload, { name: "read_file", arguments: '{"path":"README.md"}' });
});

test("adapts tool completed", () => {
  const event = adaptDshNotification(sessionEvent("tool/result", {
    message: { role: "tool", toolCallId: "call-1", content: [{ type: "text", text: "ok" }] },
  }), context);

  assert.equal(event.type, "tool.completed");
  assert.equal(event.toolCallId, "call-1");
});

test("adapts tool failed with a stable error", () => {
  const event = adaptDshNotification(sessionEvent("tool/result", {
    message: { role: "tool", toolCallId: "call-1", content: [{ type: "text", text: "denied" }] },
    error: { name: "ToolDeniedError", code: "DENIED" },
  }), context);

  assert.equal(event.type, "tool.failed");
  assert.deepEqual(event.error, { code: "DENIED", message: "ToolDeniedError" });
});

test("adapts approval required", () => {
  const event = adaptDshNotification(sessionEvent("approval/asked", {
    id: "approval-1",
    toolName: "bash",
    callId: "call-1",
    reason: "requires execution",
  }), context);

  assert.equal(event.type, "approval.required");
  assert.equal(event.toolCallId, "call-1");
  assert.deepEqual(event.payload, { toolName: "bash", reason: "requires execution" });
});

test("adapts completed and cancelled runs", () => {
  const completed = adaptDshNotification(sessionEvent("turn/end", {
    turn: 1,
    reason: { kind: "completed" },
  }), context);
  const cancelled = adaptDshNotification(sessionEvent("turn/end", {
    turn: 2,
    reason: { kind: "aborted", reason: { kind: "user" } },
  }), context);

  assert.equal(completed.type, "run.completed");
  assert.equal(cancelled.type, "run.cancelled");
});

test("ignores unknown DSH events", () => {
  assert.equal(adaptDshNotification(sessionEvent("future/native-event", {}), context), null);
  assert.equal(adaptDshNotification({ method: "future.notification", params: {} }, context), null);
});
