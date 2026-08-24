import { randomUUID } from "node:crypto";
import { createDshToolPolicy } from "./tool-policy.mjs";

const SESSION_ID_PATTERN = /^snn-agent-[a-z0-9-]{8,80}$/;
const RUN_ID_PATTERN = /^snn-run-[a-z0-9-]{8,80}$/;

/** Ephemeral owner of Internal API session/run identities. */
export class AgentSessionController {
  #manager;
  #active = new Map();
  #toolMetadata;
  #maxMessageLength;
  #capabilityResolver;
  #workspace;
  #skillId;

  constructor({ manager, toolMetadata = [], maxMessageLength = 16_384, capabilityResolver, workspace, skillId = "workspace-reader" }) {
    if (!manager || typeof manager.ensureReady !== "function") throw new TypeError("manager is required");
    if (!Number.isInteger(maxMessageLength) || maxMessageLength <= 0) throw new TypeError("maxMessageLength must be a positive integer");
    this.#manager = manager;
    this.#toolMetadata = toolMetadata;
    this.#maxMessageLength = maxMessageLength;
    this.#capabilityResolver = capabilityResolver;
    this.#workspace = workspace;
    this.#skillId = skillId;
  }

  async createSession() {
    const runtime = await this.#manager.ensureReady();
    const sessionId = `snn-agent-${randomUUID()}`;
    await runtime.createSession({ sessionId, toolPolicy: this.#policy() });
    return { sessionId, status: "created" };
  }
  async resumeSession(sessionId) {
    assertSessionId(sessionId);
    const runtime = await this.#manager.ensureReady();
    await runtime.resumeSession({ sessionId, toolPolicy: this.#policy() });
    return { sessionId, status: "resumed" };
  }
  async startRun(sessionId, message) {
    assertSessionId(sessionId);
    if (typeof message !== "string" || message.length === 0 || message.length > this.#maxMessageLength) throw httpError(400, "INVALID_MESSAGE", "message must be a non-empty string within the allowed length");
    if (this.#active.has(sessionId)) throw httpError(409, "AGENT_RUN_CONFLICT", "session already has an active run");
    const runtime = await this.#manager.ensureReady();
    const run = runtime.sendMessage({ sessionId, content: this.#content(message) });
    this.#active.set(sessionId, run.runId);
    return run;
  }
  async cancel(sessionId, runId) {
    assertSessionId(sessionId);
    if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) throw httpError(400, "INVALID_RUN_ID", "runId format is invalid");
    if (this.#active.get(sessionId) !== runId) throw httpError(409, "STALE_AGENT_RUN", "run is not active for this session");
    const runtime = await this.#manager.ensureReady();
    return runtime.abort({ sessionId, runId });
  }
  finish(sessionId, runId) { if (this.#active.get(sessionId) === runId) this.#active.delete(sessionId); }
  activeRunId(sessionId) { return this.#active.get(sessionId); }
  async cancelAll() {
    await Promise.all([...this.#active.entries()].map(async ([sessionId, runId]) => {
      try { await this.cancel(sessionId, runId); } catch { /* The stream still publishes its true outcome. */ }
    }));
  }
  #policy() {
    if (this.#capabilityResolver) return this.#capabilityResolver.resolve({ workspace: this.#workspace, skillId: this.#skillId }).dshToolPolicy;
    return createDshToolPolicy(this.#toolMetadata);
  }
  #content(message) {
    if (!this.#capabilityResolver) return message;
    const capability = this.#capabilityResolver.resolve({ workspace: this.#workspace, skillId: this.#skillId });
    return [{
      type: "text",
      text: `[SNN Skill: ${capability.skill.id}]\n${capability.skill.instructions}\n\nUser request:\n${message}`,
    }];
  }
}

export function httpError(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function assertSessionId(sessionId) { if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) throw httpError(400, "INVALID_SESSION_ID", "sessionId format is invalid"); }
