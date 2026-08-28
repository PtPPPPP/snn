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
  downloadUrl?: string;
  updatedAt?: number;
};

export type AgentFilePreview = {
  fileId: string;
  name: string;
  mime: string;
  size: number;
  truncated: boolean;
  content: string;
};

export type AgentRuntimeReadiness = {
  configured: boolean;
  state: "disabled" | "pending" | "starting" | "ready" | "failed";
  runtimeReady: boolean;
  toolsReady: "unknown";
  modelToolCallingVerified: "unknown";
};

// Client-side mirror of the server preview whitelist (bff.mjs); the server
// remains authoritative and rejects anything outside it.
const PREVIEW_TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "log", "xml", "yml", "yaml", "html", "htm",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "java", "c", "h", "cpp", "go", "rs",
  "rb", "sh", "sql", "ini", "toml", "css",
]);

export function isPreviewableAgentFile(file: AgentFile): boolean {
  if (file.kind !== "text") return false;
  const extension = /\.([a-z0-9]+)$/i.exec(file.originalName)?.[1]?.toLowerCase();
  return extension === undefined || PREVIEW_TEXT_EXTENSIONS.has(extension);
}

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

function throwForStatusCode(status: number, body?: unknown): never {
  const code = (body as { error?: { code?: string } })?.error?.code;
  if (status === 401 || status === 403) throw new AgentClientError("auth", status, code);
  if (status === 404) throw new AgentClientError("not_found", 404, code);
  if (status === 429) throw new AgentClientError("limit", 429, code);
  if (status >= 400 && status < 500) throw new AgentClientError("invalid", status, code);
  throw new AgentClientError("http", status, code);
}

function throwForStatus(res: Response, body?: unknown): never {
  throwForStatusCode(res.status, body);
}

export async function getAgentStatus(): Promise<{ online: boolean; agent: boolean; readiness?: AgentRuntimeReadiness }> {
  try {
    const base = getAgentApiBaseUrl().replace(/\/agent$/, "/ai");
    const res = await fetch(`${base}/status`, { method: "GET", credentials: "include", signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    if (!res.ok) return { online: false, agent: false };
    const data = (await res.json()) as { online: boolean; capabilities?: { agent?: boolean; agentReadiness?: AgentRuntimeReadiness } };
    const readiness = data.capabilities?.agentReadiness;
    return { online: Boolean(data.online), agent: Boolean(data.capabilities?.agent), ...(readiness ? { readiness } : {}) };
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

export function getAgentFileUrl(sessionId: string, fileId: string): string {
  return `${getAgentApiBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`;
}

export async function previewAgentFile(sessionId: string, fileId: string): Promise<AgentFilePreview> {
  const res = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}/preview`, { method: "GET" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throwForStatus(res, body);
  }
  const data = (await res.json()) as AgentFilePreview;
  if (typeof data.content !== "string") throw new AgentClientError("response");
  return data;
}

// Server-enforced per-file upload ceiling (bff.mjs multipart limit and
// FileIngestionService maxUploadBytes). Kept here so the client can fail
// fast before pushing a doomed request over a slow link.
export const AGENT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

// Files above this threshold use the chunked protocol. The public origin
// answers an upload only after its whole body has arrived, so a single
// 13-50 MiB request succeeds only while the user's link to the Cloudflare
// edge sustains high throughput; through the fixed ~100 s edge origin
// timeout, evening-peak links fail with 524/502. 4 MiB chunks land far
// inside that window even on degraded links.
export const AGENT_CHUNKED_UPLOAD_THRESHOLD = 4 * 1024 * 1024;
const CHUNK_RETRYABLE_STATUS = new Set([502, 503, 504, 524]);
const CHUNK_MAX_ATTEMPTS = 3;

async function xhrSend(
  method: string,
  path: string,
  body: Blob | FormData | null,
  onProgress?: (loaded: number) => void,
): Promise<{ status: number; bodyText: string }> {
  // XMLHttpRequest instead of fetch: it is the only browser API that
  // reports upload progress, which matters on slow tunnel links.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${getAgentApiBaseUrl()}${path}`);
    xhr.withCredentials = true;
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded);
      };
    }
    xhr.onload = () => resolve({ status: xhr.status, bodyText: xhr.responseText });
    xhr.onerror = () => reject(new AgentClientError("network"));
    xhr.ontimeout = () => reject(new AgentClientError("network"));
    xhr.send(body);
  });
}

async function putChunkWithRetry(
  sessionId: string,
  uploadId: string,
  index: number,
  blob: Blob,
  onLoaded: (loaded: number) => void,
): Promise<void> {
  let lastError: unknown = new AgentClientError("network");
  for (let attempt = 0; attempt < CHUNK_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    try {
      const result = await xhrSend(
        "PUT",
        `/sessions/${encodeURIComponent(sessionId)}/uploads/${encodeURIComponent(uploadId)}/chunks/${index}`,
        blob,
        onLoaded,
      );
      if (result.status >= 200 && result.status < 300) return;
      const body: unknown = (() => { try { return JSON.parse(result.bodyText); } catch { return {}; } })();
      if (CHUNK_RETRYABLE_STATUS.has(result.status)) {
        lastError = new AgentClientError("http", result.status);
        continue;
      }
      throwForStatusCode(result.status, body);
    } catch (error) {
      if (error instanceof AgentClientError && error.code !== "network") throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function uploadAgentFileChunked(
  sessionId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<AgentFile> {
  const createRes = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ originalName: file.name, contentType: file.type || "application/octet-stream", totalSize: file.size }),
  });
  if (!createRes.ok) {
    throwForStatus(createRes, await createRes.json().catch(() => ({})));
  }
  const created = (await createRes.json()) as { upload?: { uploadId?: string; chunkSize?: number } };
  const uploadId = created.upload?.uploadId;
  const chunkSize = created.upload?.chunkSize;
  if (typeof uploadId !== "string" || typeof chunkSize !== "number" || chunkSize < 1) {
    throw new AgentClientError("response");
  }
  // Abandoned staging is swept server-side by TTL; cancel up front on any
  // client-side failure so a doomed upload does not occupy the open quota.
  try {
    let confirmed = 0;
    for (let index = 0, offset = 0; offset < file.size; index += 1, offset += chunkSize) {
      const blob = file.slice(offset, Math.min(offset + (chunkSize as number), file.size));
      await putChunkWithRetry(sessionId, uploadId, index, blob, (loaded) => {
        onProgress?.(Math.min(99, Math.round(((confirmed + loaded) / file.size) * 100)));
      });
      confirmed += blob.size;
      onProgress?.(Math.min(99, Math.round((confirmed / file.size) * 100)));
    }
    const completeRes = await agentFetch(`/sessions/${encodeURIComponent(sessionId)}/uploads/${encodeURIComponent(uploadId)}/complete`, { method: "POST" });
    if (!completeRes.ok) {
      throwForStatus(completeRes, await completeRes.json().catch(() => ({})));
    }
    const data = (await completeRes.json()) as { file?: AgentFile };
    if (!data.file?.fileId) throw new AgentClientError("response");
    onProgress?.(100);
    return data.file;
  } catch (error) {
    void agentFetch(`/sessions/${encodeURIComponent(sessionId)}/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}

export async function uploadAgentFile(
  sessionId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<AgentFile> {
  if (file.size > AGENT_CHUNKED_UPLOAD_THRESHOLD) {
    return uploadAgentFileChunked(sessionId, file, onProgress);
  }
  const formData = new FormData();
  formData.append("file", file, file.name);
  const result = await xhrSend(
    "POST",
    `/sessions/${encodeURIComponent(sessionId)}/files`,
    formData,
    onProgress ? (loaded) => onProgress(Math.min(100, Math.round((loaded / file.size) * 100))) : undefined,
  );
  const body: unknown = (() => { try { return JSON.parse(result.bodyText); } catch { return {}; } })();
  if (result.status < 200 || result.status >= 300) throwForStatusCode(result.status, body);
  const data = body as { file: AgentFile };
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
  onTool: (ev: { type: string; name?: string; status: string; toolCallId?: string }) => void;
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
      const toolCallId = typeof p.toolCallId === "string" ? p.toolCallId : undefined;
      handlers.onTool({ type: parsed.event, name, status: parsed.event === "tool.failed" ? "failed" : parsed.event === "tool.completed" ? "completed" : "started", toolCallId });
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
