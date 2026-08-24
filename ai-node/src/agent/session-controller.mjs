import { randomUUID } from "node:crypto";
import { createDshToolPolicy } from "./tool-policy.mjs";
import { buildAttachmentContext, normalizeAttachmentRequest } from "./attachments/attachment-context-resolver.mjs";

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
  #workspaceManager;
  #metadataStore;
  #runtimeRegistry;
  #attachmentContextResolver;

  constructor({ manager, toolMetadata = [], maxMessageLength = 16_384, capabilityResolver, workspace, skillId = "workspace-reader", workspaceManager, metadataStore, runtimeRegistry, attachmentContextResolver }) {
    if (!manager || typeof manager.ensureReady !== "function") throw new TypeError("manager is required");
    if (!Number.isInteger(maxMessageLength) || maxMessageLength <= 0) throw new TypeError("maxMessageLength must be a positive integer");
    this.#manager = manager;
    this.#toolMetadata = toolMetadata;
    this.#maxMessageLength = maxMessageLength;
    this.#capabilityResolver = capabilityResolver;
    this.#workspace = workspace;
    this.#skillId = skillId;
    this.#workspaceManager = workspaceManager;
    this.#metadataStore = metadataStore;
    this.#runtimeRegistry = runtimeRegistry;
    this.#attachmentContextResolver = attachmentContextResolver;
  }

  async createSession({ workspaceId } = {}) {
    const sessionId = `snn-agent-${randomUUID()}`;
    const context = await this.#contextForCreate(workspaceId);
    const runtime = await this.#runtimeFor(context.binding).then((manager) => manager.ensureReady());
    if (this.#metadataStore) await this.#metadataStore.create(sessionId, context.binding);
    try { await runtime.createSession({ sessionId, toolPolicy: context.capability.dshToolPolicy }); }
    catch (error) { if (this.#metadataStore) await this.#metadataStore.delete(sessionId); throw error; }
    return { sessionId, status: "created" };
  }
  async resumeSession(sessionId) {
    assertSessionId(sessionId);
    const context = await this.#contextForSession(sessionId);
    const runtime = await this.#runtimeFor(context.binding).then((manager) => manager.ensureReady());
    await runtime.resumeSession({ sessionId, toolPolicy: context.capability.dshToolPolicy });
    return { sessionId, status: "resumed" };
  }
  /**
   * Start one run for a session. `input` is either a plain message string or
   * `{ message, attachments }`; attachment values are file id references that
   * the server alone resolves into safe descriptors before any model request.
   */
  async startRun(sessionId, input) {
    assertSessionId(sessionId);
    const request = typeof input === "string" ? { message: input } : input;
    if (!isRecord(request)) throw httpError(400, "INVALID_MESSAGE", "message must be a non-empty string within the allowed length");
    const { message } = request;
    if (typeof message !== "string" || message.length === 0 || message.length > this.#maxMessageLength) throw httpError(400, "INVALID_MESSAGE", "message must be a non-empty string within the allowed length");
    const fileIds = this.#normalizeAttachments(request.attachments);
    if (this.#active.has(sessionId)) throw httpError(409, "AGENT_RUN_CONFLICT", "session already has an active run");
    const context = await this.#contextForSession(sessionId);
    // Attachment resolution fails closed against the CURRENT workspace manifest
    // before the runtime or model is ever involved.
    const attachmentContext = await this.#resolveAttachmentContext(context.binding.workspaceId, fileIds);
    const manager = await this.#runtimeFor(context.binding);
    const runtime = await manager.ensureReady();
    const run = runtime.sendMessage({ sessionId, content: this.#content(message, context.capability, attachmentContext) });
    this.#active.set(sessionId, { runId: run.runId, manager });
    return run;
  }
  async cancel(sessionId, runId) {
    assertSessionId(sessionId);
    if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) throw httpError(400, "INVALID_RUN_ID", "runId format is invalid");
    const active = this.#active.get(sessionId);
    if (!active || active.runId !== runId) throw httpError(409, "STALE_AGENT_RUN", "run is not active for this session");
    const runtime = await active.manager.ensureReady();
    return runtime.abort({ sessionId, runId });
  }
  finish(sessionId, runId) { if (this.#active.get(sessionId)?.runId === runId) this.#active.delete(sessionId); }
  activeRunId(sessionId) { return this.#active.get(sessionId)?.runId; }
  async cancelAll() {
    await Promise.all([...this.#active.entries()].map(async ([sessionId, active]) => {
      try { await this.cancel(sessionId, active.runId); } catch { /* The stream still publishes its true outcome. */ }
    }));
  }
  async #contextForCreate(workspaceId) {
    const binding = {
      schemaVersion: 1,
      workspaceId: workspaceId ?? this.#workspace?.id,
      skillId: this.#skillId,
    };
    return { binding, capability: await this.#resolve(binding) };
  }
  async #contextForSession(sessionId) {
    if (!this.#metadataStore) return this.#contextForCreate();
    let binding;
    try { binding = await this.#metadataStore.get(sessionId); }
    catch (error) {
      if (error?.code === "AGENT_SESSION_METADATA_NOT_FOUND") throw Object.assign(new Error("Agent session is not available in the current runtime"), { code: "AGENT_SESSION_NOT_FOUND" });
      throw error;
    }
    return { binding, capability: await this.#resolve(binding) };
  }
  async #resolve(binding) {
    if (!this.#capabilityResolver) return { dshToolPolicy: createDshToolPolicy(this.#toolMetadata), skill: undefined };
    try {
      const workspace = this.#workspaceManager ? this.#workspaceManager.resolve(binding.workspaceId) : this.#workspace;
      return this.#capabilityResolver.resolve({ workspace, skillId: binding.skillId });
    } catch (error) {
      throw Object.assign(new Error("Session capability binding is unavailable"), { code: error.code === "SNN_WORKSPACE_NOT_FOUND" ? "AGENT_WORKSPACE_NOT_FOUND" : error.code === "SNN_SKILL_NOT_FOUND" ? "AGENT_SKILL_NOT_FOUND" : "AGENT_SESSION_CAPABILITY_INVALID" });
    }
  }
  async #runtimeFor(binding) {
    if (!this.#runtimeRegistry) return this.#manager;
    const workspace = this.#workspaceManager.resolve(binding.workspaceId);
    return this.#runtimeRegistry.getOrCreate(workspace);
  }
  #normalizeAttachments(raw) {
    if (raw === undefined) return [];
    if (!this.#attachmentContextResolver) throw httpError(400, "INVALID_REQUEST", "attachments are not available for this session");
    return normalizeAttachmentRequest(raw);
  }
  async #resolveAttachmentContext(workspaceId, fileIds) {
    if (fileIds.length === 0) return "";
    const descriptors = await this.#attachmentContextResolver.resolve({ workspaceId, fileIds });
    return buildAttachmentContext(descriptors);
  }
  #content(message, capability, attachmentContext = "") {
    if (!this.#capabilityResolver) return message;
    if (!attachmentContext) {
      // Byte-stable legacy assembly keeps prior turn formats unchanged.
      return [{
        type: "text",
        text: `[SNN Skill: ${capability.skill.id}]\n${capability.skill.instructions}\n\nUser request:\n${message}`,
      }];
    }
    // The server-owned attachment context is a distinct content block so it can
    // never blur into the user message.
    return [
      { type: "text", text: `[SNN Skill: ${capability.skill.id}]\n${capability.skill.instructions}` },
      { type: "text", text: attachmentContext },
      { type: "text", text: `User request:\n${message}` },
    ];
  }
}

export function httpError(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function assertSessionId(sessionId) { if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) throw httpError(400, "INVALID_SESSION_ID", "sessionId format is invalid"); }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
