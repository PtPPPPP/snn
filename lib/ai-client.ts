export type AiChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export type AiChatResponse = {
  reply: string;
  model?: string;
  requestId?: string;
};

export type AiStatus = {
  online: boolean;
  model: string | null;
  status: string;
};

type SendChatMessageOptions = {
  messages: AiChatMessage[];
  thinking?: boolean;
};

export type AiStreamDone = {
  model?: string;
  requestId?: string;
  thinking?: boolean;
  reasoningObserved?: boolean;
  thinkingMs?: number;
};

type StreamChatMessageOptions = SendChatMessageOptions & {
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onReasoningStart: () => void;
  onDone: (metadata: AiStreamDone) => void;
  onError: (message: string) => void;
};

declare global {
  interface Window {
    __SNN_AI_API_BASE_URL__?: string;
  }
}

const DEFAULT_AI_API_BASE_URL = "/api/ai";
const STATUS_TIMEOUT_MS = 4_000;
const CHAT_TIMEOUT_MS = 45_000;

export class AiClientError extends Error {
  constructor(
    readonly code: "aborted" | "http" | "network" | "response" | "stream" | "timeout",
  ) {
    super(code);
    this.name = "AiClientError";
  }
}

function configuredBaseUrl(): string | undefined {
  const staticBaseUrl =
    typeof window === "undefined" ? undefined : window.__SNN_AI_API_BASE_URL__;
  const buildBaseUrl =
    typeof process === "undefined"
      ? undefined
      : process.env.NEXT_PUBLIC_SNN_AI_API_BASE_URL;

  return staticBaseUrl ?? buildBaseUrl;
}

export function getAiApiBaseUrl(): string {
  const baseUrl = configuredBaseUrl()?.trim() || DEFAULT_AI_API_BASE_URL;
  return baseUrl.replace(/\/+$/, "");
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getAiApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AiClientError("http");
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new AiClientError("response");
    }
  } catch (error) {
    if (error instanceof AiClientError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AiClientError("timeout");
    }

    throw new AiClientError("network");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function sendChatMessage({
  messages,
  thinking = false,
}: SendChatMessageOptions): Promise<AiChatResponse> {
  const response = await requestJson<AiChatResponse>(
    "/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, thinking }),
    },
    CHAT_TIMEOUT_MS,
  );

  if (!response.reply?.trim()) {
    throw new AiClientError("response");
  }

  return response;
}

function takeSseEvents(buffer: string) {
  const events: string[] = [];
  let remaining = buffer;

  while (true) {
    const boundary = remaining.search(/\r?\n\r?\n/);
    if (boundary < 0) {
      return { events, remaining };
    }

    const match = remaining.slice(boundary).match(/^\r?\n\r?\n/);
    events.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary + (match?.[0].length ?? 2));
  }
}

function parseSseEvent(eventBlock: string) {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of eventBlock.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");

    if (field === "event") {
      event = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const data = dataLines.join("\n");
  if (data === "[DONE]") {
    return { event: "done", payload: {} };
  }

  try {
    return { event, payload: JSON.parse(data) as Record<string, unknown> };
  } catch {
    throw new AiClientError("response");
  }
}

export async function streamChatMessage({
  messages,
  thinking = false,
  signal,
  onDelta,
  onReasoningStart,
  onDone,
  onError,
}: StreamChatMessageOptions): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${getAiApiBaseUrl()}/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, thinking }),
      signal,
    });
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new AiClientError("aborted");
    }
    throw new AiClientError("network");
  }

  if (!response.ok) {
    throw new AiClientError("http");
  }

  if (!response.body) {
    throw new AiClientError("response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  function handleEvent(eventBlock: string) {
    const parsed = parseSseEvent(eventBlock);
    if (!parsed) {
      return;
    }

    if (parsed.event === "delta") {
      const text = parsed.payload.text;
      if (typeof text !== "string") {
        throw new AiClientError("response");
      }
      onDelta(text);
      return;
    }

    if (parsed.event === "reasoning_start") {
      onReasoningStart();
      return;
    }

    if (parsed.event === "done") {
      completed = true;
      onDone({
        ...(typeof parsed.payload.model === "string" ? { model: parsed.payload.model } : {}),
        ...(typeof parsed.payload.requestId === "string"
          ? { requestId: parsed.payload.requestId }
          : {}),
        ...(typeof parsed.payload.thinking === "boolean"
          ? { thinking: parsed.payload.thinking }
          : {}),
        ...(typeof parsed.payload.reasoningObserved === "boolean"
          ? { reasoningObserved: parsed.payload.reasoningObserved }
          : {}),
        ...(typeof parsed.payload.thinkingMs === "number"
          ? { thinkingMs: parsed.payload.thinkingMs }
          : {}),
      });
      return;
    }

    if (parsed.event === "error") {
      const message =
        typeof parsed.payload.error === "string"
          ? parsed.payload.error
          : "SNN AI 节点当前未连接，请稍后再试。";
      onError(message);
      throw new AiClientError("stream");
    }
  }

  try {
    while (!completed) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parsed = takeSseEvents(buffer);
      buffer = parsed.remaining;
      parsed.events.forEach(handleEvent);
    }

    buffer += decoder.decode();
    const finalEvents = takeSseEvents(buffer);
    finalEvents.events.forEach(handleEvent);
    if (finalEvents.remaining.trim()) {
      handleEvent(finalEvents.remaining);
    }

    if (!completed) {
      throw new AiClientError("stream");
    }
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new AiClientError("aborted");
    }
    throw error instanceof AiClientError ? error : new AiClientError("network");
  } finally {
    reader.releaseLock();
  }
}

export async function getAiStatus(): Promise<AiStatus> {
  try {
    const response = await requestJson<AiStatus>("/status", { method: "GET" }, STATUS_TIMEOUT_MS);

    if (typeof response.online !== "boolean" || typeof response.status !== "string") {
      throw new AiClientError("response");
    }

    return {
      online: response.online,
      model: typeof response.model === "string" ? response.model : null,
      status: response.status,
    };
  } catch {
    return { online: false, model: null, status: "offline" };
  }
}
