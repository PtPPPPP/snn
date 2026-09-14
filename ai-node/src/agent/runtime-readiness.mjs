/**
 * Reports whether the configured public Agent has completed one real DSH
 * startup, whether its public tool capability actually resolves, and whether a
 * real model tool-call has ever been verified. It never starts a runtime or
 * calls a model from a status request.
 *
 * Field sources of truth (Section 57):
 * - runtimeReady: the DSH runtime state machine (runtimeState()).
 * - toolsReady: derived at snapshot time from runtimeState() PLUS a real
 *   capability resolution (resolveTools). true only when the runtime is READY
 *   and the public workspace-editor skill resolves with every required tool
 *   present and available; false when the runtime failed or resolution throws;
 *   "unknown" when it cannot yet be determined (runtime not started, or no
 *   resolver wired). toolsReadyReason carries the concrete evidence either way.
 * - modelToolCallingVerified: "verified" only after recordToolCallVerification
 *   is called by a real model tool-call probe; otherwise "unknown" (never false
 *   — an unprobed runtime is unknown, not broken). modelToolCalling holds
 *   { lastVerifiedAt, model, tool } and no prompt or user data.
 */
export class AgentRuntimeReadiness {
  #configured;
  #ensureRuntime;
  #runtimeState;
  #resolveTools;
  #startupState = "pending";
  #startupTask;
  #toolCallVerification = null;

  constructor({ configured, ensureRuntime, runtimeState, resolveTools }) {
    if (typeof configured !== "boolean") throw new TypeError("configured must be a boolean");
    if (configured && typeof ensureRuntime !== "function") throw new TypeError("ensureRuntime is required when configured");
    if (configured && typeof runtimeState !== "function") throw new TypeError("runtimeState is required when configured");
    if (resolveTools !== undefined && typeof resolveTools !== "function") throw new TypeError("resolveTools must be a function when provided");
    this.#configured = configured;
    this.#ensureRuntime = ensureRuntime;
    this.#runtimeState = runtimeState;
    this.#resolveTools = resolveTools;
  }

  snapshot() {
    if (!this.#configured) return this.#snapshot("disabled", false, { ready: false, reason: "agent not configured" }, false);
    const runtimeState = this.#runtimeState();
    if (runtimeState === "READY") return this.#snapshot("ready", true, this.#deriveToolsReady());
    if (runtimeState === "FAILED" || this.#startupState === "failed") return this.#snapshot("failed", false, { ready: false, reason: "runtime failed to start" });
    return this.#snapshot(this.#startupTask ? "starting" : "pending", false, { ready: "unknown", reason: "runtime not started yet" });
  }

  /**
   * Real runtime capability check (Section 33): resolve the public
   * workspace-editor skill. resolve() throws if any required tool is missing or
   * unavailable, so a non-empty result proves capability resolution succeeded
   * and every required public tool exists. Cheap and in-memory, run only once
   * the runtime is READY; it never calls the model.
   */
  #deriveToolsReady() {
    if (typeof this.#resolveTools !== "function") return { ready: "unknown", reason: "no capability resolver wired" };
    try {
      const toolIds = this.#resolveTools();
      const count = Array.isArray(toolIds) ? toolIds.length : 0;
      if (count === 0) return { ready: false, reason: "capability resolved zero tools" };
      return { ready: true, reason: `capability resolution ok; ${count} public tools available` };
    } catch (error) {
      return { ready: false, reason: error?.code ?? "capability resolution failed" };
    }
  }

  #snapshot(state, runtimeReady, tools, configured = true) {
    return Object.freeze({
      configured,
      state,
      runtimeReady,
      toolsReady: tools.ready,
      toolsReadyReason: tools.reason,
      modelToolCallingVerified: this.#toolCallVerification ? "verified" : "unknown",
      modelToolCalling: this.#toolCallVerification,
    });
  }

  /**
   * Record that a real model tool-call probe succeeded (Section 34/35). Stores
   * only the model name, tool name, and timestamp — never prompt or user data.
   * Invoked from an isolated, bounded probe (startup, deployment preflight, or a
   * manual readiness endpoint), never from a status poll.
   */
  recordToolCallVerification({ model, tool, at } = {}) {
    if (typeof model !== "string" || model.length === 0) throw new TypeError("model is required");
    if (typeof tool !== "string" || tool.length === 0) throw new TypeError("tool is required");
    const lastVerifiedAt = typeof at === "string" && at.length > 0 ? at : new Date().toISOString();
    this.#toolCallVerification = Object.freeze({ lastVerifiedAt, model, tool });
    return this.snapshot();
  }

  warm() {
    if (!this.#configured) return Promise.resolve(this.snapshot());
    this.#startupTask ??= Promise.resolve()
      .then(() => this.#ensureRuntime())
      .then(() => {
        this.#startupState = "ready";
        return this.snapshot();
      })
      .catch((error) => {
        this.#startupState = "failed";
        throw error;
      });
    return this.#startupTask;
  }
}
