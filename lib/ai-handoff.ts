import type { AiChatMessage } from "./ai-client";

export const AI_HANDOFF_KEY = "snn-ai-handoff-v1";
export const LEARNING_PROGRESS_KEY = "snn-learning-progress-v1";
const MAX_AGE_MS = 30 * 60 * 1000;

export interface AiHandoffPayload {
  title: string;
  messages: AiChatMessage[];
  draft?: string;
  createdAt: number;
}

function defaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function stageAiHandoff(
  payload: { title: string; messages?: AiChatMessage[]; draft?: string },
  storage: Pick<Storage, "setItem"> | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  const cleanTitle = (payload.title || "学习答疑").trim().slice(0, 80) || "学习答疑";
  const cleanMessages = Array.isArray(payload.messages)
    ? payload.messages
        .filter(
          (m): m is AiChatMessage =>
            Boolean(m) &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0,
        )
        .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 12000) }))
    : [];
  const cleanDraft = typeof payload.draft === "string" ? payload.draft.trim().slice(0, 4000) : "";
  if (cleanMessages.length === 0 && !cleanDraft) return false;
  try {
    const record: AiHandoffPayload = {
      title: cleanTitle,
      messages: cleanMessages,
      ...(cleanDraft ? { draft: cleanDraft } : {}),
      createdAt: Date.now(),
    };
    storage.setItem(AI_HANDOFF_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function consumeAiHandoff(
  storage: Pick<Storage, "getItem" | "removeItem"> | null = defaultStorage(),
  now = Date.now(),
): AiHandoffPayload | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AI_HANDOFF_KEY);
    if (!raw) return null;
    storage.removeItem(AI_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as Partial<AiHandoffPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.createdAt === "number" && Math.abs(now - parsed.createdAt) > MAX_AGE_MS) {
      return null;
    }
    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 80) : "学习答疑";
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.filter(
          (m): m is AiChatMessage =>
            Boolean(m) &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0,
        )
      : [];
    const draft = typeof parsed.draft === "string" && parsed.draft.trim() ? parsed.draft.trim().slice(0, 4000) : undefined;
    if (messages.length === 0 && !draft) return null;
    return {
      title,
      messages,
      ...(draft ? { draft } : {}),
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : now,
    };
  } catch {
    return null;
  }
}

const VALID_LABS = new Set([
  "/learn/neural-networks",
  "/play/rocket",
  "/play/rocket/explain",
  "/play/rocket/train",
]);

export function readVisitedLabs(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LEARNING_PROGRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && VALID_LABS.has(item));
  } catch {
    return [];
  }
}

export function markLabVisited(
  path: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): string[] {
  const normalized = path.replace(/\/$/, "") || "/";
  const matched = normalized.startsWith("/learn/neural-networks")
    ? "/learn/neural-networks"
    : VALID_LABS.has(normalized)
      ? normalized
      : null;
  const current = readVisitedLabs(storage);
  if (!matched || current.includes(matched)) return current;
  const next = [...current, matched];
  if (storage) {
    try {
      storage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}
