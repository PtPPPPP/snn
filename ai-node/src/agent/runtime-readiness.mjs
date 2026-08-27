/**
 * Reports whether the configured public Agent has completed one real DSH
 * startup. It never starts a runtime from a status request.
 */
export class AgentRuntimeReadiness {
  #configured;
  #ensureRuntime;
  #runtimeState;
  #startupState = "pending";
  #startupTask;

  constructor({ configured, ensureRuntime, runtimeState }) {
    if (typeof configured !== "boolean") throw new TypeError("configured must be a boolean");
    if (configured && typeof ensureRuntime !== "function") throw new TypeError("ensureRuntime is required when configured");
    if (configured && typeof runtimeState !== "function") throw new TypeError("runtimeState is required when configured");
    this.#configured = configured;
    this.#ensureRuntime = ensureRuntime;
    this.#runtimeState = runtimeState;
  }

  snapshot() {
    if (!this.#configured) return Object.freeze({ configured: false, state: "disabled", runtimeReady: false, toolsReady: "unknown", modelToolCallingVerified: "unknown" });
    const runtimeState = this.#runtimeState();
    if (runtimeState === "READY") return Object.freeze({ configured: true, state: "ready", runtimeReady: true, toolsReady: "unknown", modelToolCallingVerified: "unknown" });
    if (runtimeState === "FAILED" || this.#startupState === "failed") return Object.freeze({ configured: true, state: "failed", runtimeReady: false, toolsReady: "unknown", modelToolCallingVerified: "unknown" });
    return Object.freeze({ configured: true, state: this.#startupTask ? "starting" : "pending", runtimeReady: false, toolsReady: "unknown", modelToolCallingVerified: "unknown" });
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
