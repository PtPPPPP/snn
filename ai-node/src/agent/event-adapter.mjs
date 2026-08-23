import { createSnnAgentEvent } from "./contract.mjs";

/**
 * Translate one official DSH notification into zero or one stable SNN event.
 * Unknown DSH events are intentionally ignored at this private boundary.
 *
 * @param {{ method?: unknown, params?: unknown }} notification
 * @param {{ runId: string, sessionId: string, now?: () => string }} context
 * @returns {Readonly<Record<string, unknown>> | null}
 */
export function adaptDshNotification(notification, context) {
  if (notification?.method !== "session.event" || !isRecord(notification.params)) return null;
  if (notification.params.sessionId !== context.sessionId) return null;
  return adaptSessionEvent(notification.params.event, context);
}

/** @param {unknown} nativeEvent @param {{ runId: string, sessionId: string, now?: () => string }} context */
function adaptSessionEvent(nativeEvent, context) {
  if (!isRecord(nativeEvent) || typeof nativeEvent.type !== "string" || !isRecord(nativeEvent.data)) return null;
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
    case "tool/call":
      if (typeof data.callId !== "string" || typeof data.name !== "string") return null;
      return createSnnAgentEvent({
        ...base,
        type: "tool.started",
        toolCallId: data.callId,
        payload: { name: data.name, arguments: typeof data.arguments === "string" ? data.arguments : "" },
      });
    case "tool/result":
      if (!isRecord(data.message) || typeof data.message.toolCallId !== "string") return null;
      return createSnnAgentEvent({
        ...base,
        type: data.error === undefined ? "tool.completed" : "tool.failed",
        toolCallId: data.message.toolCallId,
        payload: {
          content: Array.isArray(data.message.content) ? data.message.content : [],
          ...(data.meta === undefined ? {} : { meta: data.meta }),
        },
        ...(data.error === undefined ? {} : { error: normalizeError(data.error, "DSH_TOOL_FAILED") }),
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

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
