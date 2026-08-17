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
};

declare global {
  interface Window {
    __SNN_AI_API_BASE_URL__?: string;
  }
}

const DEFAULT_AI_API_BASE_URL = "/api/ai";
const STATUS_TIMEOUT_MS = 4_000;
const CHAT_TIMEOUT_MS = 30_000;

export class AiClientError extends Error {
  constructor(readonly code: "http" | "network" | "response" | "timeout") {
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
}: SendChatMessageOptions): Promise<AiChatResponse> {
  const response = await requestJson<AiChatResponse>(
    "/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    },
    CHAT_TIMEOUT_MS,
  );

  if (!response.reply?.trim()) {
    throw new AiClientError("response");
  }

  return response;
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
