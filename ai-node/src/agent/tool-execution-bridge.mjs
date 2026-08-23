import { createSnnAgentEvent } from "./contract.mjs";
import { defineToolMetadata } from "./tool-metadata.mjs";
import { projectDefaultToolPolicy } from "./tool-policy.mjs";

/**
 * Correlates DSH tool facts to a single SNN run without owning tool execution.
 * `tool/call` records a DSH scheduler request only. A caller must provide an
 * actual body-start fact before this class emits public `tool.started`.
 */
export class ToolExecutionBridge {
  #runs = new Map();
  #metadataFor;
  #now;
  #onDiagnostic;

  /**
   * @param {{ metadataFor?: (toolName: string) => Record<string, unknown> | undefined, now?: () => string, onDiagnostic?: (diagnostic: Readonly<Record<string, unknown>>) => void }} options
   */
  constructor({ metadataFor = () => undefined, now = () => new Date().toISOString(), onDiagnostic = () => {} } = {}) {
    if (typeof metadataFor !== "function") throw new TypeError("metadataFor must be a function");
    if (typeof onDiagnostic !== "function") throw new TypeError("onDiagnostic must be a function");
    this.#metadataFor = metadataFor;
    this.#now = now;
    this.#onDiagnostic = onDiagnostic;
  }

  /** Create short-lived state for one SNN run. */
  beginRun({ runId, sessionId }) {
    if (this.#runs.has(runId)) throw new Error(`Tool bridge run already exists: ${runId}`);
    this.#runs.set(runId, { sessionId, calls: new Map() });
  }

  /**
   * Observe an official SDK `session.event` notification. Only durable DSH
   * `tool/call` and `tool/result` facts belong here.
   * @param {{ method?: unknown, params?: unknown }} notification
   * @param {{ runId: string, sessionId: string }} context
   * @returns {Readonly<Record<string, unknown>>[]}
   */
  observeDshNotification(notification, context) {
    if (notification?.method !== "session.event" || !isRecord(notification.params)) return [];
    if (notification.params.sessionId !== context.sessionId || !isRecord(notification.params.event)) return [];
    const event = notification.params.event;
    if (event.type === "tool/call") return this.#observeToolRequested(event.data, context);
    if (event.type === "tool/result") return this.#observeToolResult(event.data, context);
    return [];
  }

  /**
   * Receive a verified DSH tool-body start fact from a future SDK extension.
   * This must be called only after DSH has begun the tool body, not when the
   * model merely requested a tool.
   * @param {{ runId: string, sessionId: string, toolCallId: string, toolName: string }} input
   * @returns {Readonly<Record<string, unknown>>[]}
   */
  observeToolExecutionStarted({ runId, sessionId, toolCallId, toolName }) {
    const run = this.#runFor(runId, sessionId, toolCallId, "TOOL_EXECUTION_START_UNKNOWN_RUN");
    if (!run) return [];
    const call = run.calls.get(toolCallId);
    if (!call) {
      this.#diagnose("TOOL_EXECUTION_START_WITHOUT_REQUEST", { runId, sessionId, toolCallId });
      return [];
    }
    if (call.name !== toolName) {
      this.#diagnose("TOOL_EXECUTION_START_NAME_MISMATCH", { runId, sessionId, toolCallId });
      return [];
    }
    if (call.state !== "requested") {
      this.#diagnose("TOOL_EXECUTION_START_DUPLICATE_OR_TERMINAL", { runId, sessionId, toolCallId });
      return [];
    }
    call.state = "started";
    return [this.#event("tool.started", runId, sessionId, toolCallId, call)];
  }

  /** Release all state for one completed, failed, cancelled, or closed run. */
  endRun({ runId, sessionId, outcome }) {
    const run = this.#runs.get(runId);
    if (!run) return;
    if (run.sessionId !== sessionId) {
      this.#diagnose("TOOL_RUN_SESSION_MISMATCH", { runId, sessionId });
      return;
    }
    for (const [toolCallId, call] of run.calls) {
      if (call.state !== "completed" && call.state !== "failed") {
        this.#diagnose("TOOL_LIFECYCLE_INCOMPLETE_AT_RUN_END", { runId, sessionId, toolCallId, outcome });
      }
    }
    this.#runs.delete(runId);
  }

  /** Clear all run-scoped state when the adapter disposes. */
  dispose() {
    this.#runs.clear();
  }

  #observeToolRequested(data, { runId, sessionId }) {
    if (!isRecord(data) || typeof data.callId !== "string" || typeof data.name !== "string") {
      this.#diagnose("DSH_TOOL_REQUEST_INVALID", { runId, sessionId });
      return [];
    }
    const run = this.#runFor(runId, sessionId, data.callId, "TOOL_REQUEST_UNKNOWN_RUN");
    if (!run) return [];
    if (run.calls.has(data.callId)) {
      this.#diagnose("DSH_TOOL_REQUEST_DUPLICATE", { runId, sessionId, toolCallId: data.callId });
      return [];
    }
    const metadata = this.#metadata(data.name, runId, sessionId, data.callId);
    run.calls.set(data.callId, { name: data.name, metadata, state: "requested" });
    return [];
  }

  #observeToolResult(data, { runId, sessionId }) {
    const result = readToolResult(data);
    if (!result) {
      this.#diagnose("DSH_TOOL_RESULT_INVALID", { runId, sessionId });
      return [];
    }
    const run = this.#runFor(runId, sessionId, result.toolCallId, "TOOL_RESULT_UNKNOWN_RUN");
    if (!run) return [];
    const call = run.calls.get(result.toolCallId);
    if (!call) {
      this.#diagnose("TOOL_RESULT_WITHOUT_REQUEST", { runId, sessionId, toolCallId: result.toolCallId });
      return [];
    }
    if (call.state === "requested") {
      this.#diagnose("TOOL_RESULT_WITHOUT_EXECUTION_START", { runId, sessionId, toolCallId: result.toolCallId });
      return [];
    }
    if (call.state === "completed" || call.state === "failed") {
      this.#diagnose("DSH_TOOL_RESULT_DUPLICATE_OR_CONFLICT", { runId, sessionId, toolCallId: result.toolCallId });
      return [];
    }
    call.state = result.isError ? "failed" : "completed";
    return [this.#event(
      result.isError ? "tool.failed" : "tool.completed",
      runId,
      sessionId,
      result.toolCallId,
      call,
      result.isError ? result.error : undefined,
    )];
  }

  #event(type, runId, sessionId, toolCallId, call, error) {
    return createSnnAgentEvent({
      type,
      runId,
      sessionId,
      toolCallId,
      timestamp: this.#now(),
      payload: publicToolPayload(call),
      ...(error === undefined ? {} : { error }),
    });
  }

  #runFor(runId, sessionId, toolCallId, code) {
    const run = this.#runs.get(runId);
    if (!run || run.sessionId !== sessionId) {
      this.#diagnose(code, { runId, sessionId, ...(toolCallId === undefined ? {} : { toolCallId }) });
      return undefined;
    }
    return run;
  }

  #metadata(toolName, runId, sessionId, toolCallId) {
    try {
      const candidate = this.#metadataFor(toolName);
      if (candidate === undefined) {
        this.#diagnose("TOOL_METADATA_NOT_FOUND", { runId, sessionId, toolCallId });
        return undefined;
      }
      return defineToolMetadata(candidate);
    } catch {
      this.#diagnose("TOOL_METADATA_INVALID", { runId, sessionId, toolCallId });
      return undefined;
    }
  }

  #diagnose(code, details) {
    try {
      this.#onDiagnostic(Object.freeze({ code, ...details }));
    } catch {
      // Diagnostics are observational and must not break the runtime.
    }
  }
}

/** @param {{ name: string, metadata?: Record<string, unknown> }} call */
function publicToolPayload(call) {
  const metadata = call.metadata;
  const policy = projectDefaultToolPolicy(metadata);
  return {
    name: call.name,
    ...(metadata === undefined
      ? {}
      : {
          displayName: metadata.displayName,
          risk: metadata.risk,
          approvalPolicy: metadata.approvalPolicy,
          category: metadata.category,
        }),
    policy: policy.decision,
  };
}

/** @param {unknown} data */
function readToolResult(data) {
  if (!isRecord(data) || !isRecord(data.message) || !Array.isArray(data.message.content)) return undefined;
  const block = data.message.content.find((item) => isRecord(item) && item.type === "tool-result");
  if (!isRecord(block) || typeof block.toolCallId !== "string") return undefined;
  const isError = block.isError === true;
  return {
    toolCallId: block.toolCallId,
    isError,
    ...(isError ? { error: publicError() } : {}),
  };
}

/** Return a public failure without exposing a DSH exception or raw tool output. */
function publicError() {
  return { code: "TOOL_EXECUTION_FAILED", message: "Tool execution failed" };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
