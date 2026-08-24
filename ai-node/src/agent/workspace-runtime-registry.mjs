/** Owns one AgentRuntimeManager per server-resolved workspace identity. */
export class WorkspaceRuntimeRegistry {
  #createManager;
  #entries = new Map();

  constructor({ createManager }) {
    if (typeof createManager !== "function") throw new TypeError("createManager must be a function");
    this.#createManager = createManager;
  }

  get(workspaceId) { return this.#entries.get(workspaceId)?.manager; }

  async getOrCreate(workspace) {
    if (!workspace?.id) throw new TypeError("workspace is required");
    const current = this.#entries.get(workspace.id);
    if (current) return current.promise;
    const entry = {};
    entry.promise = Promise.resolve().then(async () => {
      const manager = await this.#createManager(workspace);
      if (!manager || typeof manager.ensureReady !== "function" || typeof manager.dispose !== "function") throw new TypeError("workspace runtime manager is incompatible");
      entry.manager = manager;
      return manager;
    }).catch((error) => {
      if (this.#entries.get(workspace.id) === entry) this.#entries.delete(workspace.id);
      throw error;
    });
    this.#entries.set(workspace.id, entry);
    return entry.promise;
  }

  async dispose(workspaceId) {
    const entry = this.#entries.get(workspaceId);
    if (!entry) return;
    this.#entries.delete(workspaceId);
    const manager = await entry.promise;
    await manager.dispose();
  }

  async disposeAll() {
    const ids = [...this.#entries.keys()];
    const results = await Promise.allSettled(ids.map((id) => this.dispose(id)));
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }
}
