/** Owns one shared SNN Agent runtime instance. */
export class AgentRuntimeManager {
  #createRuntime;
  #runtime;
  #state = "STOPPED";
  #startTask;
  #disposeTask;
  #error;

  constructor({ createRuntime }) {
    if (typeof createRuntime !== "function") throw new TypeError("createRuntime must be a function");
    this.#createRuntime = createRuntime;
  }

  get state() { return this.#state; }
  get error() { return this.#error; }

  async ensureReady() {
    if (this.#state === "READY") return this.#runtime;
    if (this.#state === "STARTING") return this.#startTask;
    if (this.#state === "STOPPING") throw new Error("Agent runtime is stopping");
    if (this.#state === "FAILED") {
      if (this.#runtime) await this.#runtime.dispose().catch(() => {});
      this.#runtime = undefined;
    }
    this.#state = "STARTING";
    this.#error = undefined;
    this.#startTask = Promise.resolve().then(async () => {
      const runtime = await this.#createRuntime();
      if (!runtime || typeof runtime.createSession !== "function" || typeof runtime.sendMessage !== "function"
        || typeof runtime.abort !== "function" || typeof runtime.resumeSession !== "function" || typeof runtime.dispose !== "function") {
        throw Object.assign(new Error("Agent runtime is incompatible"), { code: "AGENT_RUNTIME_INCOMPATIBLE" });
      }
      this.#runtime = runtime;
      if (typeof runtime.onFailure === "function") {
        runtime.onFailure((error) => this.#markFailed(error));
      }
      this.#state = "READY";
      return runtime;
    }).catch((error) => {
      this.#error = error;
      this.#state = "FAILED";
      throw error;
    });
    return this.#startTask;
  }

  dispose() {
    this.#disposeTask ??= (async () => {
      this.#state = "STOPPING";
      try { await this.#startTask?.catch(() => {}); await this.#runtime?.dispose(); }
      finally { this.#runtime = undefined; this.#state = "STOPPED"; }
    })();
    return this.#disposeTask;
  }

  #markFailed(error) {
    if (this.#state === "STOPPING" || this.#state === "STOPPED") return;
    this.#error = error instanceof Error ? error : new Error("Agent runtime failed");
    this.#state = "FAILED";
  }
}
