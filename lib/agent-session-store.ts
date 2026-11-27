import { createPerConversationQueue } from "./ai-conversation-queue.mjs";
import { generateTitle } from "./ai-conversation-store";

export type StoredAgentAttachment = {
  fileId: string;
  originalName: string;
  size: number;
  kind: string;
  contentType?: string;
  downloadUrl?: string;
  updatedAt?: number;
};

export type StoredAgentToolCall = {
  id: string;
  name: string;
  displayName?: string;
  category?: string;
  risk?: string;
  status: "started" | "completed" | "failed";
  timestamp: string;
  durationMs?: number;
};

export type StoredAgentArtifact = {
  id: string;
  fileId: string;
  name: string;
  type: "created" | "modified" | "deleted";
  at: number;
};

export type StoredAgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: StoredAgentAttachment[];
  reasoningText?: string;
  thinkingSeconds?: number;
  toolCalls?: StoredAgentToolCall[];
  artifacts?: StoredAgentArtifact[];
  presetId?: string;
  skillId?: string;
};

export type StoredAgentSessionHistory = {
  sessionId: string;
  title: string;
  updatedAt: number;
  messages: StoredAgentMessage[];
  presetId?: string;
  skillId?: string;
  version: 1;
};

const STORAGE_PREFIX = "snn-agent-session-history:";
const enqueueSession = createPerConversationQueue();

export interface AgentHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(override?: AgentHistoryStorage | null): AgentHistoryStorage | null {
  if (override !== undefined) return override;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function agentHistoryKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

export function defaultAgentTitle(sessionId: string): string {
  return `Agent ${sessionId.slice(-6)}`;
}

export function deriveAgentSessionTitle(
  sessionId: string,
  messages: ReadonlyArray<{ role: "user" | "assistant"; content: string; attachments?: ReadonlyArray<{ originalName: string }> }>,
  existingTitle?: string,
): string {
  const defaultTitle = defaultAgentTitle(sessionId);
  if (existingTitle && existingTitle !== defaultTitle && existingTitle !== "新对话") {
    return existingTitle;
  }
  const firstUser = messages.find((m) => m.role === "user" && (m.content.trim().length > 0 || (m.attachments && m.attachments.length > 0)));
  if (!firstUser) return existingTitle || defaultTitle;
  const text = firstUser.content.trim() || firstUser.attachments?.[0]?.originalName || "";
  if (!text) return defaultTitle;
  const generated = generateTitle(text);
  return generated === "新对话" ? defaultTitle : generated;
}

export function loadAgentSessionHistory(
  sessionId: string,
  storageOverride?: AgentHistoryStorage | null,
): StoredAgentSessionHistory | null {
  const store = getStorage(storageOverride);
  if (!store || !sessionId) return null;
  try {
    const raw = store.getItem(agentHistoryKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAgentSessionHistory>;
    if (!parsed || typeof parsed !== "object" || parsed.sessionId !== sessionId || !Array.isArray(parsed.messages)) {
      return null;
    }
    const messages: StoredAgentMessage[] = parsed.messages
      .filter(
        (m): m is StoredAgentMessage =>
          Boolean(m) &&
          typeof m === "object" &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          (m.content.trim().length > 0 || (Array.isArray(m.attachments) && m.attachments.length > 0)),
      )
      .map((m, index) => ({
        id: typeof m.id === "string" && m.id ? m.id : `${m.role}-${index}-${m.content.length}`,
        role: m.role,
        content: m.content,
        ...(typeof m.reasoningText === "string" && m.reasoningText.length > 0 ? { reasoningText: m.reasoningText } : {}),
        ...(typeof m.thinkingSeconds === "number" ? { thinkingSeconds: m.thinkingSeconds } : {}),
        ...(typeof m.presetId === "string" ? { presetId: m.presetId } : {}),
        ...(typeof m.skillId === "string" ? { skillId: m.skillId } : {}),
        ...(Array.isArray(m.toolCalls) && m.toolCalls.length > 0 ? { toolCalls: m.toolCalls } : {}),
        ...(Array.isArray(m.artifacts) && m.artifacts.length > 0 ? { artifacts: m.artifacts } : {}),
        ...(Array.isArray(m.attachments) && m.attachments.length > 0
          ? {
              attachments: m.attachments
                .filter((a) => Boolean(a) && typeof a.fileId === "string" && typeof a.originalName === "string")
                .map((a) => ({
                  fileId: a.fileId,
                  originalName: a.originalName,
                  size: typeof a.size === "number" ? a.size : 0,
                  kind: typeof a.kind === "string" ? a.kind : "text",
                  ...(typeof a.contentType === "string" ? { contentType: a.contentType } : {}),
                  ...(typeof a.downloadUrl === "string" ? { downloadUrl: a.downloadUrl } : {}),
                  ...(typeof a.updatedAt === "number" ? { updatedAt: a.updatedAt } : {}),
                })),
            }
          : {}),
      }));
    const title =
      typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : deriveAgentSessionTitle(sessionId, messages);
    const updatedAt = typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now();
    return {
      sessionId,
      title,
      updatedAt,
      messages,
      version: 1,
    };
  } catch {
    return null;
  }
}

export function saveAgentSessionHistory(
  sessionId: string,
  messages: ReadonlyArray<StoredAgentMessage>,
  existingTitle?: string,
  storageOverride?: AgentHistoryStorage | null,
): Promise<StoredAgentSessionHistory | null> {
  return enqueueSession(sessionId, async () => {
    const store = getStorage(storageOverride);
    if (!store || !sessionId) return null;
    const cleanMessages = messages.filter(
      (m) => m.content.trim().length > 0 || (Array.isArray(m.attachments) && m.attachments.length > 0),
    );
    const title = deriveAgentSessionTitle(sessionId, cleanMessages, existingTitle);
    const snapshot: StoredAgentSessionHistory = {
      sessionId,
      title,
      updatedAt: Date.now(),
      messages: cleanMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ...(m.reasoningText ? { reasoningText: m.reasoningText } : {}),
        ...(typeof m.thinkingSeconds === "number" ? { thinkingSeconds: m.thinkingSeconds } : {}),
        ...(m.presetId ? { presetId: m.presetId } : {}),
        ...(m.skillId ? { skillId: m.skillId } : {}),
        ...(m.toolCalls && m.toolCalls.length > 0 ? { toolCalls: m.toolCalls.map((t) => ({ ...t })) } : {}),
        ...(m.artifacts && m.artifacts.length > 0 ? { artifacts: m.artifacts.map((a) => ({ ...a })) } : {}),
        ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments.map((a) => ({ ...a })) } : {}),
      })),
      version: 1,
    };
    try {
      store.setItem(agentHistoryKey(sessionId), JSON.stringify(snapshot));
      return snapshot;
    } catch {
      return null;
    }
  });
}

export function deleteAgentSessionHistory(
  sessionId: string,
  storageOverride?: AgentHistoryStorage | null,
): Promise<void> {
  return enqueueSession(sessionId, async () => {
    const store = getStorage(storageOverride);
    if (!store || !sessionId) return;
    try {
      store.removeItem(agentHistoryKey(sessionId));
    } catch {}
  });
}
