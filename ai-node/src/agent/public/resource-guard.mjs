/**
 * Server-owned hard caps for public BFF. Fail closed with 429 when exceeded.
 * No distributed queue, no scheduler — just caps.
 */
export class PublicResourceGuard {
  #limits;
  constructor(limits = {}) {
    this.#limits = Object.freeze({
      maxSessionsGlobal: limits.maxSessionsGlobal ?? 100,
      maxSessionsPerOwner: limits.maxSessionsPerOwner ?? 10,
      maxActiveRunsGlobal: limits.maxActiveRunsGlobal ?? 20,
      maxActiveRunsPerOwner: limits.maxActiveRunsPerOwner ?? 3,
      maxActiveWorkspaces: limits.maxActiveWorkspaces ?? 100,
    });
  }

  limits() { return this.#limits; }

  async checkSessionCreate({ globalCount, perOwnerCount }) {
    if (perOwnerCount >= this.#limits.maxSessionsPerOwner) throw tooMany("AGENT_PUBLIC_SESSION_LIMIT_PER_OWNER", "Too many agent sessions for this browser");
    if (globalCount >= this.#limits.maxSessionsGlobal) throw tooMany("AGENT_PUBLIC_SESSION_LIMIT_GLOBAL", "Too many agent sessions");
    if (globalCount >= this.#limits.maxActiveWorkspaces) throw tooMany("AGENT_PUBLIC_WORKSPACE_LIMIT_GLOBAL", "Too many active workspaces");
  }

  async checkRunStart({ globalActiveRuns, perOwnerActiveRuns }) {
    if (perOwnerActiveRuns >= this.#limits.maxActiveRunsPerOwner) throw tooMany("AGENT_PUBLIC_RUN_LIMIT_PER_OWNER", "Too many active runs for this browser");
    if (globalActiveRuns >= this.#limits.maxActiveRunsGlobal) throw tooMany("AGENT_PUBLIC_RUN_LIMIT_GLOBAL", "Too many active runs");
  }
}

function tooMany(code, message) {
  return Object.assign(new Error(message), { status: 429, code });
}
