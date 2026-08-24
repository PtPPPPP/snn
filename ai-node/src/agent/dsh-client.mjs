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

  /**
   * @param {{ createHarness: (options: Record<string, unknown>) => object, harnessOptions: Record<string, unknown> }} options
   */
  constructor({ createHarness, harnessOptions }) {
    if (typeof createHarness !== "function") throw new TypeError("createHarness must be a function");
    this.#createHarness = createHarness;
    this.#harnessOptions = { ...harnessOptions };
  }

  /** Start and initialize the official DSH runtime subprocess once. */
  start() {
    if (this.#disposeTask) throw new Error("DSH client is disposed");
    this.#startTask ??= (async () => {
      this.#harness = this.#createHarness(this.#harnessOptions);
      if (typeof this.#harness?.start !== "function") throw new TypeError("Official DSH harness must provide start()");
      await this.#harness.start();
    })();
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
      await this.#harness.resumeSession(sessionId, toolPolicy);
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
      if (this.#harness?.close) await this.#harness.close();
      this.#sessions.clear();
    })();
    return this.#disposeTask;
  }
}

/** @param {unknown} sessionId */
function requireSessionId(sessionId) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new TypeError("sessionId must be a non-empty string");
  }
}
