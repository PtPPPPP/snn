export type AgentSession = {
  sessionId: string;
  createdAt?: string;
  lastAccessAt?: string;
};

export type AgentFile = {
  fileId: string;
  originalName: string;
  size: number;
  kind: string;
  contentType?: string;
};

export type AgentRunState = "idle" | "starting" | "streaming" | "cancelling" | "completed" | "failed" | "cancelled";

export class AgentClientError extends Error {
  constructor(
    readonly code: "aborted" | "http" | "network" | "response" | "auth" | "limit" | "not_found" | "invalid",
    readonly status?: number,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "AgentClientError";
  }
}

declare global {
  interface Window {
    __SNN_AGENT_API_BASE_URL__?: string;
  }
}

const DEFAULT_AGENT_API_BASE_URL = "/api/agent";
const STATUS_TIMEOUT_MS = 4000;

function getAgentApiBaseUrl(): string {
  const fromWindow = typeof window !== "undefined" ? window.__SNN_AGENT_API_BASE_URL__?.trim() : undefined;
  const base = fromWindow && fromWindow.length > 0 ? fromWindow : DEFAULT_AGENT_API_BASE_URL;
  return base.replace(/\/+$/, "");
}

async function agentFetch(path: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = timeoutMs ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
  const signal = init.signal ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any?.([controller.signal, init.signal]) ?? controller.signal : controller.signal;
  try {
    const res = await fetch(`${getAgentApiBaseUrl()}${path}`, {
      ...init,
      credentials: "include",
      signal,
    });
    return res;
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") throw new AgentClientError("aborted");
    throw new AgentClientError("network");
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

function throwForStatus(res: Response, body?: unknown): never {
  const code = (body as { error?: { code?: string } })?.error?.code;
  if (res.status === 401 || res.status === 403) throw new AgentClientError("auth", res.status, code);
  if (res.status === 404) throw new AgentClientError("not_found", 404, code);
  if (res.status === 429) throw new AgentClientError("limit", 429, code);
  if (res.status >= 400 && res.status < 500) throw new AgentClientError("invalid", res.status, code);
  throw new AgentClientError("http", res.status, code);
}

export async function getAgentStatus(): Promise<{ online: boolean; agent: boolean }> {
  try {
    const base = getAgentApiBaseUrl().replace(/\/agent$/, "/ai");
    const res = await fetch(`${base}/status`, { method: "GET", credentials: "include", signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    if (!res.ok) return { online: false, agent: false };
    const data = (await res.json()) as { online: boolean; capabilities?: { agent?: boolean } };
    return { online: Boolean(data.online), agent: Boolean(data.capabilities?.agent) };
  } catch {
    return { online: false, agent: false };
  }
}

export async function createAgentSession(): Promise<AgentSession> {
  const res = await agentFetch("/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throwForStatus(res, body);
  }
  const data = (await res.json()) as AgentSession;
  if (!data.sessionId) throw new AgentClientError("response");
  return data;
}

export async function listAgentSessions(): Promise<AgentSession[]> {
  const res = await agentFetch("/sessions", { method: "GET" });
  if (!res.ok) {
    if (res.status === 401) throw new AgentClientError("auth", 401);
    const body = await res.json().catch(() => ({}));
    throwForStatus(res, body);
  }
  const data = (await res.json()) as { sessions: AgentSession[] };
  return Array.isArray(data.sessions) ? data.sessions : [];
}

export async function deleteAgentSession(sessionId: string): Promise<void> {
  const res = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throwForStatus(res, body);
  }
}

export async function listAgentFiles(sessionId: string): Promise<AgentFile[]> {
  const res = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}/files`, { method: "GET" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throwForStatus(res, body);
  }
  const data = (await res.json()) as { files: AgentFile[] };
  return Array.isArray(data.files) ? data.files : [];
}

export async function uploadAgentFile(sessionId: string, file: File): Promise<AgentFile> {
  const res = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}/files`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-snn-file-name": file.name, "x-snn-file-content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throwForStatus(res, body);
  }
  const data = (await res.json()) as { file: AgentFile };
  if (!data.file?.fileId) throw new AgentClientError("response");
  return data.file;
}

export async function deleteAgentFile(sessionId: string, fileId: string): Promise<void> {
  const res = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throwForStatus(res, body);
  }
}

// SSE handling for Agent run
function takeSseEvents(buffer: string) {
  const events: string[] = [];
  let remaining = buffer;
  while (true) {
    const boundary = remaining.search(/\r?\n\r?\n/);
    if (boundary < 0) return { events, remaining };
    const match = remaining.slice(boundary).match(/^\r?\n\r?\n/);
    events.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary + (match?.[0].length ?? 2));
  }
}
function parseSseEvent(block: string) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const sep = line.indexOf(":");
    const field = sep < 0 ? line : line.slice(0, sep);
    const value = sep < 0 ? "" : line.slice(sep + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const data = dataLines.join("\n");
  try {
    return { event, payload: JSON.parse(data) as Record<string, unknown> };
  } catch {
    return null;
  }
}

export type AgentStreamHandlers = {
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onTool: (ev: { type: string; name?: string; status: string }) => void;
  onDone: (terminal: string) => void;
  onError: (msg: string) => void;
};

export async function streamAgentRun(
  sessionId: string,
  message: string,
  attachments: string[],
  handlers: AgentStreamHandlers,
): Promise<{ runId: string }> {
  const res = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, ...(attachments.length > 0 ? { attachments } : {}) }),
    signal: handlers.signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: { message?: string } })?.error?.message || "Agent run failed";
    if (res.status === 404) throw new AgentClientError("not_found", 404, msg);
    if (res.status === 429) throw new AgentClientError("limit", 429, msg);
    if (res.status === 409) throw new AgentClientError("invalid", 409, msg);
    handlers.onError(msg);
    throwForStatus(res, body);
  }

  if (!res.body) throw new AgentClientError("response");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let runId: string | null = null;
  let terminal: string | null = null;

  const handleBlock = (block: string) => {
    const parsed = parseSseEvent(block);
    if (!parsed) return;
    const p = parsed.payload as Record<string, unknown>;
    if (!runId && typeof p.runId === "string") runId = p.runId;
    if (parsed.event === "run.started" && typeof p.runId === "string") runId = p.runId;
    else if (parsed.event === "message.delta" && typeof (p.payload as { text?: unknown })?.text === "string") {
      handlers.onDelta((p.payload as { text: string }).text);
    } else if (parsed.event === "tool.started" || parsed.event === "tool.completed" || parsed.event === "tool.failed") {
      const name = (p.payload as { name?: string })?.name;
      handlers.onTool({ type: parsed.event, name, status: parsed.event === "tool.failed" ? "failed" : parsed.event === "tool.completed" ? "completed" : "started" });
    } else if (parsed.event === "run.completed" || parsed.event === "run.failed" || parsed.event === "run.cancelled") {
      terminal = parsed.event;
      handlers.onDone(terminal);
    } else if (parsed.event === "run.failed") {
      handlers.onError("Agent run failed");
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = takeSseEvents(buffer);
      buffer = remaining;
      events.forEach(handleBlock);
      if (terminal) break;
    }
    buffer += decoder.decode();
    const { events } = takeSseEvents(buffer);
    events.forEach(handleBlock);
    if (!terminal) throw new AgentClientError("response");
    return { runId: runId ?? "" };
  } catch (error) {
    if (handlers.signal.aborted || (error as DOMException)?.name === "AbortError") throw new AgentClientError("aborted");
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function cancelAgentRun(sessionId: string, runId: string): Promise<void> {
  const res = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!res.ok && res.status !== 202) {
    const body = await res.json().catch(() => ({}));
    throwForStatus(res, body);
  }
}
