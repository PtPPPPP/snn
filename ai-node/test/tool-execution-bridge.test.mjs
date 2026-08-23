import assert from "node:assert/strict";
import test from "node:test";
import { ToolExecutionBridge } from "../src/agent/tool-execution-bridge.mjs";

const NOW = () => "2026-08-23T00:00:00.000Z";

function metadata(name, risk = "READ") {
  return {
    name,
    displayName: name === "read" ? "读取文件" : name,
    risk,
    approvalPolicy: risk === "READ" ? "none" : "required",
    category: "workspace",
  };
}

function notification(type, data, sessionId = "session-1") {
  return { method: "session.event", params: { sessionId, event: { type, data } } };
}

function requested(callId = "call-1", name = "read") {
  return notification("tool/call", { callId, name, arguments: '{"file_path":"secret.txt"}' });
}

function result(callId = "call-1", isError = false) {
  return notification("tool/result", {
    message: {
      content: [{ type: "tool-result", toolCallId: callId, content: [{ type: "text", text: "secret output" }], ...(isError ? { isError: true } : {}) }],
    },
    ...(isError ? { error: { name: "InternalToolError", code: "PRIVATE_CODE" } } : {}),
  });
}

function bridgeWithDiagnostics() {
  const diagnostics = [];
  const bridge = new ToolExecutionBridge({
    now: NOW,
    metadataFor: (name) => metadata(name),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  bridge.beginRun({ runId: "run-1", sessionId: "session-1" });
  return { bridge, diagnostics };
}

test("emits one strict lifecycle for a verified tool execution", () => {
  const { bridge, diagnostics } = bridgeWithDiagnostics();
  assert.deepEqual(bridge.observeDshNotification(requested(), { runId: "run-1", sessionId: "session-1" }), []);

  const started = bridge.observeToolExecutionStarted({ runId: "run-1", sessionId: "session-1", toolCallId: "call-1", toolName: "read" });
  const completed = bridge.observeDshNotification(result(), { runId: "run-1", sessionId: "session-1" });

  assert.deepEqual([...started, ...completed].map((event) => event.type), ["tool.started", "tool.completed"]);
  assert.deepEqual(started[0].payload, {
    name: "read",
    displayName: "读取文件",
    risk: "READ",
    approvalPolicy: "none",
    category: "workspace",
    policy: "allow",
  });
  assert.equal(JSON.stringify(completed[0]).includes("secret output"), false);
  assert.equal(JSON.stringify(started[0]).includes("file_path"), false);
  assert.deepEqual(diagnostics, []);
});

test("maps a DSH tool error to a stable public failure", () => {
  const { bridge } = bridgeWithDiagnostics();
  bridge.observeDshNotification(requested(), { runId: "run-1", sessionId: "session-1" });
  bridge.observeToolExecutionStarted({ runId: "run-1", sessionId: "session-1", toolCallId: "call-1", toolName: "read" });

  const failed = bridge.observeDshNotification(result("call-1", true), { runId: "run-1", sessionId: "session-1" });

  assert.equal(failed[0].type, "tool.failed");
  assert.deepEqual(failed[0].error, { code: "TOOL_EXECUTION_FAILED", message: "Tool execution failed" });
  assert.equal(JSON.stringify(failed[0]).includes("InternalToolError"), false);
  assert.equal(JSON.stringify(failed[0]).includes("secret output"), false);
});

test("deduplicates repeated starts and terminal events", () => {
  const { bridge, diagnostics } = bridgeWithDiagnostics();
  bridge.observeDshNotification(requested(), { runId: "run-1", sessionId: "session-1" });
  const started = bridge.observeToolExecutionStarted({ runId: "run-1", sessionId: "session-1", toolCallId: "call-1", toolName: "read" });
  const duplicateStart = bridge.observeToolExecutionStarted({ runId: "run-1", sessionId: "session-1", toolCallId: "call-1", toolName: "read" });
  const completed = bridge.observeDshNotification(result(), { runId: "run-1", sessionId: "session-1" });
  const duplicateCompleted = bridge.observeDshNotification(result(), { runId: "run-1", sessionId: "session-1" });
  const conflictingFailed = bridge.observeDshNotification(result("call-1", true), { runId: "run-1", sessionId: "session-1" });

  assert.deepEqual([started, duplicateStart, completed, duplicateCompleted, conflictingFailed].map((events) => events.length), [1, 0, 1, 0, 0]);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TOOL_EXECUTION_START_DUPLICATE_OR_TERMINAL",
    "DSH_TOOL_RESULT_DUPLICATE_OR_CONFLICT",
    "DSH_TOOL_RESULT_DUPLICATE_OR_CONFLICT",
  ]);
});

test("fails closed when a terminal result has no verified execution start", () => {
  const { bridge, diagnostics } = bridgeWithDiagnostics();
  bridge.observeDshNotification(requested(), { runId: "run-1", sessionId: "session-1" });

  assert.deepEqual(bridge.observeDshNotification(result(), { runId: "run-1", sessionId: "session-1" }), []);
  assert.equal(diagnostics[0].code, "TOOL_RESULT_WITHOUT_EXECUTION_START");
});

test("diagnoses duplicate requests, unknown call ids, and starts without requests", () => {
  const { bridge, diagnostics } = bridgeWithDiagnostics();
  bridge.observeDshNotification(requested(), { runId: "run-1", sessionId: "session-1" });
  bridge.observeDshNotification(requested(), { runId: "run-1", sessionId: "session-1" });
  bridge.observeDshNotification(result("unknown"), { runId: "run-1", sessionId: "session-1" });
  bridge.observeToolExecutionStarted({ runId: "run-1", sessionId: "session-1", toolCallId: "missing", toolName: "read" });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "DSH_TOOL_REQUEST_DUPLICATE",
    "TOOL_RESULT_WITHOUT_REQUEST",
    "TOOL_EXECUTION_START_WITHOUT_REQUEST",
  ]);
});

test("cleans incomplete tool state when every run terminal path ends", () => {
  for (const outcome of ["run.completed", "run.failed", "run.cancelled"]) {
    const { bridge, diagnostics } = bridgeWithDiagnostics();
    bridge.observeDshNotification(requested(), { runId: "run-1", sessionId: "session-1" });
    bridge.endRun({ runId: "run-1", sessionId: "session-1", outcome });
    bridge.beginRun({ runId: "run-1", sessionId: "session-1" });
    assert.equal(diagnostics.at(-1).code, "TOOL_LIFECYCLE_INCOMPLETE_AT_RUN_END");
  }
});

test("isolates different sessions and rejects mismatched session facts", () => {
  const diagnostics = [];
  const bridge = new ToolExecutionBridge({ now: NOW, metadataFor: (name) => metadata(name), onDiagnostic: (event) => diagnostics.push(event) });
  bridge.beginRun({ runId: "run-a", sessionId: "session-a" });
  bridge.beginRun({ runId: "run-b", sessionId: "session-b" });
  bridge.observeDshNotification(requested("call-a", "read"), { runId: "run-a", sessionId: "session-a" });
  bridge.observeDshNotification(requested("call-b", "read"), { runId: "run-b", sessionId: "session-b" });

  const ignored = bridge.observeDshNotification(result("call-a"), { runId: "run-b", sessionId: "session-b" });
  const wrongSession = bridge.observeToolExecutionStarted({ runId: "run-a", sessionId: "session-b", toolCallId: "call-a", toolName: "read" });

  assert.deepEqual(ignored, []);
  assert.deepEqual(wrongSession, []);
  assert.equal(diagnostics.at(-1).code, "TOOL_EXECUTION_START_UNKNOWN_RUN");
});

test("diagnostic callback failures do not disturb lifecycle processing", () => {
  const bridge = new ToolExecutionBridge({
    now: NOW,
    metadataFor: () => undefined,
    onDiagnostic: () => { throw new Error("diagnostic sink failed"); },
  });
  bridge.beginRun({ runId: "run-1", sessionId: "session-1" });

  assert.doesNotThrow(() => {
    bridge.observeDshNotification(notification("future/event", {}), { runId: "run-1", sessionId: "session-1" });
    bridge.observeDshNotification(requested(), { runId: "run-1", sessionId: "session-1" });
    bridge.observeToolExecutionStarted({ runId: "run-1", sessionId: "session-1", toolCallId: "call-1", toolName: "read" });
  });
});
