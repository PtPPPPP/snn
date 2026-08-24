import { randomUUID } from "node:crypto";
import { adaptDshNotification } from "./event-adapter.mjs";
import { createSnnAgentEvent, SnnAgentRuntime } from "./contract.mjs";
import { ToolExecutionBridge } from "./tool-execution-bridge.mjs";

/** SNN-owned Agent Runtime implementation over the private DSH client. */
export class DshRuntimeAdapter extends SnnAgentRuntime {
  #client;
  #now;
  #activeRuns = new Map();
  #activeSessionRuns = new Map();
  #toolBridge;
  #onDiagnostic;
  #disposed = false;
  #disposeTask;
  #failureListeners = new Set();

  /** @param {{ client: object, now?: () => string, metadataFor?: (toolName: string) => Record<string, unknown> | undefined, onDiagnostic?: (diagnostic: Readonly<Record<string, unknown>>) => void, toolBridge?: ToolExecutionBridge }} options */
  constructor({ client, now = () => new Date().toISOString(), metadataFor, onDiagnostic = () => {}, toolBridge } = {}) {
    super();
    if (!client) throw new TypeError("client is required");
    if (typeof onDiagnostic !== "function") throw new TypeError("onDiagnostic must be a function");
    this.#client = client;
    this.#now = now;
    this.#onDiagnostic = onDiagnostic;
    this.#toolBridge = toolBridge ?? new ToolExecutionBridge({ metadataFor, now, onDiagnostic });
  }

  createSession(options) {
    this.#assertActive();
    return this.#client.createSession(options);
  }

  resumeSession(options) {
    this.#assertActive();
    return this.#client.resumeSession(options);
  }

  /**
   * Start one message and return its identity plus an async SNN event stream.
   * @param {{ sessionId: string, content: string | unknown[] }} input
   */
  sendMessage({ sessionId, content }) {
    this.#assertActive();
    if (typeof sessionId !== "string" || sessionId.length === 0) throw new TypeError("sessionId must be a non-empty string");
    if (typeof content !== "string" && !Array.isArray(content)) {
      throw new TypeError("content must be text or content blocks");
    }
    const existingRunId = this.#activeSessionRuns.get(sessionId);
    if (existingRunId) throw new Error(`Agent session already has an active run: ${existingRunId}`);
    const runId = `snn-run-${randomUUID()}`;
    const stream = new AsyncEventStream();
    this.#activeRuns.set(runId, { sessionId, stream, terminal: undefined });
    this.#activeSessionRuns.set(sessionId, runId);
    this.#toolBridge.beginRun({ runId, sessionId });
    stream.push(createSnnAgentEvent({
      type: "run.started",
      runId,
      sessionId,
      timestamp: this.#now(),
    }));

    const contentBlocks = typeof content === "string" ? [{ type: "text", text: content }] : content;
    void Promise.resolve().then(() => this.#client.sendMessage({
      sessionId,
      contentBlocks,
      onNotification: (notification) => {
        for (const toolEvent of this.#toolBridge.observeDshNotification(notification, { runId, sessionId })) {
          stream.push(toolEvent);
        }
        const event = adaptDshNotification(notification, { runId, sessionId, now: this.#now }, { onDiagnostic: this.#onDiagnostic });
        if (event) this.#publishRunEvent(runId, sessionId, stream, event);
      },
    })).then(
      () => stream.close(),
      (error) => {
        if (isRuntimeTransportFailure(error)) this.#notifyFailure(error);
        this.#publishRunEvent(runId, sessionId, stream, createSnnAgentEvent({
          type: "run.failed",
          runId,
          sessionId,
          timestamp: this.#now(),
          error: normalizeRuntimeError(error),
        }));
        stream.fail(error instanceof Error ? error : new Error(String(error)));
      },
    ).finally(() => {
      this.#toolBridge.endRun({ runId, sessionId, outcome: "run.closed" });
      this.#activeRuns.delete(runId);
      this.#activeSessionRuns.delete(sessionId);
    });

    return { runId, events: stream };
  }

  /** Request cancellation through the client capability. */
  abort({ sessionId, runId }) {
    this.#assertActive();
    const active = this.#activeRuns.get(runId);
    if (!active || active.sessionId !== sessionId) throw new Error(`Agent run is not active: ${runId}`);
    return this.#client.abort({ sessionId, runId });
  }

  onFailure(listener) {
    if (typeof listener !== "function") throw new TypeError("failure listener must be a function");
    this.#failureListeners.add(listener);
    return () => this.#failureListeners.delete(listener);
  }

  /** Dispose the complete internal runtime. */
  dispose() {
    this.#disposeTask ??= (() => {
      this.#disposed = true;
      this.#toolBridge.dispose();
      return Promise.resolve(this.#client.dispose());
    })();
    return this.#disposeTask;
  }

  #assertActive() {
    if (this.#disposed) throw new Error("SNN Agent Runtime is disposed");
  }

  #notifyFailure(error) {
    for (const listener of this.#failureListeners) {
      try { listener(error); } catch { /* Failure observers must not alter a run. */ }
    }
  }

  #publishRunEvent(runId, sessionId, stream, event) {
    if (!isRunTerminal(event.type)) {
      stream.push(event);
      return;
    }
    const active = this.#activeRuns.get(runId);
    if (!active || active.terminal !== undefined) {
      try {
        this.#onDiagnostic(Object.freeze({ code: "SNN_RUN_DUPLICATE_TERMINAL", runId, sessionId, terminal: event.type }));
      } catch {
        // Diagnostics are observational and must not alter the run outcome.
      }
      return;
    }
    active.terminal = event.type;
    stream.push(event);
    this.#toolBridge.endRun({ runId, sessionId, outcome: event.type });
  }
}

/** @param {unknown} type */
function isRunTerminal(type) {
  return type === "run.completed" || type === "run.failed" || type === "run.cancelled";
}

class AsyncEventStream {
  #queue = [];
  #waiters = [];
  #closed = false;
  #error;

  push(event) {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter.resolve({ value: event, done: false });
    else this.#queue.push(event);
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter.resolve({ value: undefined, done: true });
  }

  fail(error) {
    if (this.#closed) return;
    this.#closed = true;
    this.#error = error;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
  }

  next() {
    const event = this.#queue.shift();
    if (event) return Promise.resolve({ value: event, done: false });
    if (this.#error) return Promise.reject(this.#error);
    if (this.#closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve, reject) => this.#waiters.push({ resolve, reject }));
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

/** @param {unknown} error */
function normalizeRuntimeError(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "DSH_RUNTIME_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

function isRuntimeTransportFailure(error) {
  return ["TRANSPORT_CLOSED", "ECONNRESET", "EPIPE", "DSH_RUNTIME_CLOSED"].includes(error?.code);
}
