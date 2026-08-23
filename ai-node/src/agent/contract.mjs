/** Stable event names owned by SNN AI. */
export const SNN_AGENT_EVENT_TYPES = Object.freeze([
  "run.started",
  "reasoning.started",
  "reasoning.delta",
  "reasoning.completed",
  "message.started",
  "message.delta",
  "message.completed",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "approval.required",
  "run.completed",
  "run.failed",
  "run.cancelled",
]);

const EVENT_TYPE_SET = new Set(SNN_AGENT_EVENT_TYPES);

/** Stable runtime surface used by SNN AI Node consumers. */
export class SnnAgentRuntime {
  constructor() {
    if (new.target === SnnAgentRuntime) throw new TypeError("SnnAgentRuntime is abstract");
  }

  createSession() { throw new Error("createSession() is not implemented"); }
  resumeSession() { throw new Error("resumeSession() is not implemented"); }
  sendMessage() { throw new Error("sendMessage() is not implemented"); }
  abort() { throw new Error("abort() is not implemented"); }
  dispose() { throw new Error("dispose() is not implemented"); }
}

/**
 * Create one immutable SNN Agent event.
 *
 * @param {object} input
 * @param {string} input.type
 * @param {string} input.runId
 * @param {string} input.sessionId
 * @param {string} input.timestamp
 * @param {string=} input.toolCallId
 * @param {Record<string, unknown>=} input.payload
 * @param {{ code: string, message: string }=} input.error
 * @returns {Readonly<Record<string, unknown>>}
 */
export function createSnnAgentEvent(input) {
  if (!EVENT_TYPE_SET.has(input.type)) {
    throw new TypeError(`Unknown SNN Agent event type: ${String(input.type)}`);
  }
  requireNonEmptyString(input.runId, "runId");
  requireNonEmptyString(input.sessionId, "sessionId");
  requireNonEmptyString(input.timestamp, "timestamp");
  if (input.toolCallId !== undefined) requireNonEmptyString(input.toolCallId, "toolCallId");
  if (input.error !== undefined) {
    requireNonEmptyString(input.error.code, "error.code");
    requireNonEmptyString(input.error.message, "error.message");
  }

  return Object.freeze({
    type: input.type,
    runId: input.runId,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    ...(input.toolCallId === undefined ? {} : { toolCallId: input.toolCallId }),
    ...(input.payload === undefined ? {} : { payload: Object.freeze({ ...input.payload }) }),
    ...(input.error === undefined ? {} : { error: Object.freeze({ ...input.error }) }),
  });
}

/** A missing official DSH SDK operation that needs an upstream extension point. */
export class DshExtensionRequiredError extends Error {
  /** @param {string} operation @param {string} extensionPoint */
  constructor(operation, extensionPoint) {
    super(`DSH_EXTENSION_REQUIRED: ${operation}; extension point: ${extensionPoint}`);
    this.name = "DshExtensionRequiredError";
    this.code = "DSH_EXTENSION_REQUIRED";
    this.operation = operation;
    this.extensionPoint = extensionPoint;
  }
}

/** A requested session is not owned by the current DSH runtime process. */
export class AgentSessionNotFoundError extends Error {
  /** @param {string} sessionId */
  constructor(sessionId) {
    super(`Agent session is not available in the current runtime: ${sessionId}`);
    this.name = "AgentSessionNotFoundError";
    this.code = "AGENT_SESSION_NOT_FOUND";
  }
}

/** @param {unknown} value @param {string} name */
function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}
