import { createSnnAgentEvent } from "./contract.mjs";

/**
 * Translate one official DSH notification into zero or one stable SNN event.
 * Tool lifecycle events belong to ToolExecutionBridge. Unknown DSH events are
 * diagnosed internally but never reach the public SNN event contract.
 *
 * @param {{ method?: unknown, params?: unknown }} notification
 * @param {{ runId: string, sessionId: string, now?: () => string }} context
 * @param {{ onDiagnostic?: (diagnostic: Readonly<Record<string, unknown>>) => void }=} options
 * @returns {Readonly<Record<string, unknown>> | null}
 */
export function adaptDshNotification(notification, context, { onDiagnostic = () => {} } = {}) {
  if (notification?.method !== "session.event" || !isRecord(notification.params)) {
    if (typeof notification?.method === "string" && !KNOWN_NOTIFICATION_METHODS.has(notification.method)) {
      diagnose(onDiagnostic, "DSH_NOTIFICATION_UNKNOWN", context);
    }
    return null;
  }
  if (notification.params.sessionId !== context.sessionId) return null;
  return adaptSessionEvent(notification.params.event, context, onDiagnostic);
}

const KNOWN_NOTIFICATION_METHODS = new Set(["session.status", "subagent.started", "subagent.finished", "tool.execution.started"]);
const IGNORED_SESSION_EVENTS = new Set([
  "approval/decided",
  "agent/inbox/spliced",
  "request/context",
  "request/header",
  "session/end-seed",
  "step/end",
  "step/start",
  "tool/call",
  "tool/result",
  "turn/start",
  "user/message",
]);

/** @param {unknown} nativeEvent @param {{ runId: string, sessionId: string, now?: () => string }} context @param {(diagnostic: Readonly<Record<string, unknown>>) => void} onDiagnostic */
function adaptSessionEvent(nativeEvent, context, onDiagnostic) {
  if (!isRecord(nativeEvent) || typeof nativeEvent.type !== "string" || !isRecord(nativeEvent.data)) {
    diagnose(onDiagnostic, "DSH_SESSION_EVENT_INVALID", context);
    return null;
  }
  const base = {
    runId: context.runId,
    sessionId: context.sessionId,
    timestamp: (context.now ?? (() => new Date().toISOString()))(),
  };
  const data = nativeEvent.data;

  switch (nativeEvent.type) {
    case "assistant/chunk":
      return adaptAssistantChunk(data.chunk, base);
    case "assistant/message":
      return createSnnAgentEvent({
        ...base,
        type: "message.completed",
        payload: { content: isRecord(data.message) && Array.isArray(data.message.content) ? data.message.content : [] },
      });
    case "approval/asked":
      if (typeof data.toolName !== "string") return null;
      return createSnnAgentEvent({
        ...base,
        type: "approval.required",
        ...(typeof data.callId === "string" ? { toolCallId: data.callId } : {}),
        payload: {
          toolName: data.toolName,
          ...(typeof data.reason === "string" ? { reason: data.reason } : {}),
        },
      });
    case "turn/end":
      return adaptTurnEnd(data.reason, base);
    default:
      if (!IGNORED_SESSION_EVENTS.has(nativeEvent.type)) {
        diagnose(onDiagnostic, "DSH_SESSION_EVENT_UNKNOWN", { ...context, dshEventType: nativeEvent.type });
      }
      return null;
  }
}

/** @param {unknown} chunk @param {Record<string, string>} base */
function adaptAssistantChunk(chunk, base) {
  if (!isRecord(chunk) || typeof chunk.type !== "string") return null;
  switch (chunk.type) {
    case "block-start":
      if (chunk.blockType === "reasoning") return createSnnAgentEvent({ ...base, type: "reasoning.started" });
      if (chunk.blockType === "text") return createSnnAgentEvent({ ...base, type: "message.started" });
      return null;
    case "reasoning-delta":
      return typeof chunk.text === "string"
        ? createSnnAgentEvent({ ...base, type: "reasoning.delta", payload: { text: chunk.text } })
        : null;
    case "text-delta":
      return typeof chunk.text === "string"
        ? createSnnAgentEvent({ ...base, type: "message.delta", payload: { text: chunk.text } })
        : null;
    case "block-end":
      return isRecord(chunk.block) && chunk.block.type === "reasoning"
        ? createSnnAgentEvent({ ...base, type: "reasoning.completed" })
        : null;
    default:
      return null;
  }
}

/** @param {unknown} reason @param {Record<string, string>} base */
function adaptTurnEnd(reason, base) {
  if (!isRecord(reason) || typeof reason.kind !== "string") {
    return createSnnAgentEvent({ ...base, type: "run.failed", error: { code: "DSH_INVALID_TURN_END", message: "DSH turn ended without a valid reason" } });
  }
  if (reason.kind === "completed" || reason.kind === "max-tokens") {
    return createSnnAgentEvent({ ...base, type: "run.completed", payload: { outcome: reason.kind } });
  }
  if (reason.kind === "aborted") {
    return createSnnAgentEvent({ ...base, type: "run.cancelled" });
  }
  return createSnnAgentEvent({
    ...base,
    type: "run.failed",
    error: normalizeError(reason.error, `DSH_TURN_${reason.kind.toUpperCase().replaceAll("-", "_")}`),
  });
}

/** @param {unknown} value @param {string} fallbackCode */
function normalizeError(value, fallbackCode) {
  if (!isRecord(value)) return { code: fallbackCode, message: fallbackCode };
  return {
    code: typeof value.code === "string" ? value.code : fallbackCode,
    message: typeof value.message === "string"
      ? value.message
      : typeof value.name === "string" ? value.name : fallbackCode,
  };
}

/** @param {(diagnostic: Readonly<Record<string, unknown>>) => void} onDiagnostic @param {string} code @param {Record<string, unknown>} details */
function diagnose(onDiagnostic, code, details) {
  try {
    onDiagnostic(Object.freeze({ code, ...details }));
  } catch {
    // Diagnostics are observational and must not break the runtime.
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
