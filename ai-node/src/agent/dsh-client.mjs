import { randomUUID } from "node:crypto";
import { AgentSessionNotFoundError } from "./contract.mjs";

/**
 * Private wrapper around the official `@deepseek-ai/dsh-sdk-client` API.
 * The factory is injected so this foundation remains keyless and testable.
 */
export class DshClient {
  #createHarness;
  #harnessOptions;
  #harness;
  #startTask;
  #sessions = new Map();
  #disposeTask;
  #onInternalDiagnostic;
  #onDispose;

  /**
   * @param {{ createHarness: (options: Record<string, unknown>) => object, harnessOptions: Record<string, unknown> }} options
   */
  constructor({ createHarness, harnessOptions, onInternalDiagnostic = () => {}, onDispose = () => {} }) {
    if (typeof createHarness !== "function") throw new TypeError("createHarness must be a function");
    if (typeof onInternalDiagnostic !== "function") throw new TypeError("onInternalDiagnostic must be a function");
    if (typeof onDispose !== "function") throw new TypeError("onDispose must be a function");
    this.#createHarness = createHarness;
    this.#harnessOptions = { ...harnessOptions };
    this.#onInternalDiagnostic = onInternalDiagnostic;
    this.#onDispose = onDispose;
  }

  /** Start and initialize the official DSH runtime subprocess once. */
  start() {
    if (this.#disposeTask) throw new Error("DSH client is disposed");
    this.#startTask ??= (async () => {
      this.#harness = this.#createHarness(this.#harnessOptions);
      if (typeof this.#harness?.start !== "function") throw new TypeError("Official DSH harness must provide start()");
      await this.#harness.start();
    })().catch((error) => { this.#diagnose("DSH_START_FAILED", error); throw error; });
    return this.#startTask;
  }

  /** Reserve an SDK session identity; official DSH creates it lazily on first prompt. */
  async createSession({ sessionId = `snn-session-${randomUUID()}`, toolPolicy } = {}) {
    await this.start();
    requireSessionId(sessionId);
    if (this.#sessions.has(sessionId)) throw new Error(`Agent session already exists: ${sessionId}`);
    this.#sessions.set(sessionId, toolPolicy);
    return { sessionId };
  }

  /** Reopen a session known by this process; cold persisted resume is not on the official SDK wire. */
  async resumeSession({ sessionId, toolPolicy }) {
    await this.start();
    requireSessionId(sessionId);
    if (!this.#sessions.has(sessionId)) {
      try {
        await this.#harness.resumeSession(sessionId, toolPolicy);
      } catch (error) {
        this.#diagnose("DSH_RESUME_FAILED", error);
        if (isDshSessionNotFound(error, sessionId)) {
          throw new AgentSessionNotFoundError(sessionId);
        }
        throw error;
      }
      this.#sessions.set(sessionId, toolPolicy);
    }
    return { sessionId };
  }

  /** Send one prompt through the official high-level session API. */
  async sendMessage({ sessionId, contentBlocks, onNotification }) {
    await this.start();
    requireSessionId(sessionId);
    if (!Array.isArray(contentBlocks)) throw new TypeError("contentBlocks must be an array");
    if (!this.#sessions.has(sessionId)) throw new AgentSessionNotFoundError(sessionId);
    const session = this.#harness.session(sessionId);
    return session.run(contentBlocks, { onNotification, toolPolicy: this.#sessions.get(sessionId) });
  }

  /** Official SDK per-session cancel request for one known live session. */
  async abort({ sessionId }) {
    requireSessionId(sessionId);
    if (!this.#sessions.has(sessionId)) throw new AgentSessionNotFoundError(sessionId);
    return this.#harness.session(sessionId).cancel();
  }

  /** Shut down and reap the owned runtime subprocess. */
  dispose() {
    this.#disposeTask ??= (async () => {
      if (this.#startTask) await this.#startTask.catch(() => {});
      try { if (this.#harness?.close) await this.#harness.close(); }
      finally { this.#sessions.clear(); await this.#onDispose(); }
    })();
    return this.#disposeTask;
  }

  #diagnose(stage, error) {
    try {
      this.#onInternalDiagnostic(Object.freeze({
        stage,
        name: typeof error?.name === "string" ? error.name : typeof error,
        ...(typeof error?.code === "string" || typeof error?.code === "number" ? { code: error.code } : {}),
        ...(isRecord(error?.data) ? { dataKeys: Object.freeze(Object.keys(error.data).sort()) } : {}),
        ...(typeof error?.message === "string" ? { message: error.message } : {}),
      }));
    } catch {
      // Diagnostics are strictly observational.
    }
  }
}

function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }

function isDshSessionNotFound(error, sessionId) {
  if (error?.code === "SESSION_NOT_FOUND" || error?.code === "session-not-found") return true;
  return error?.name === "JsonRpcResponseError"
    && error.code === -32603
    && error.message === `session "${sessionId}" not found`;
}

/** @param {unknown} sessionId */
function requireSessionId(sessionId) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new TypeError("sessionId must be a non-empty string");
  }
}
