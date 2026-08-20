// SNN AI 对话历史本地持久化层（IndexedDB）。
// 供 React 版(app/ai/ai-chat.tsx)与 DOM 静态版(app/ai/ftp-chat.ts)共用。
// 不保存敏感运行数据（API key / reasoning 原始内容 / 服务端日志）。

import type { AiChatMessage } from "./ai-client";
import { createPerConversationQueue } from "./ai-conversation-queue.mjs";

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiChatMessage[];
  version: 1;
};

const DB_NAME = "snn-ai";
const DB_VERSION = 1;
const STORE = "conversations";
const ACTIVE_KEY = "snn-ai-active-conversation-id";
const TITLE_LIMIT = 28;

let dbPromise: Promise<IDBDatabase> | null = null;
const enqueueConversation = createPerConversationQueue();
const deletedConversationIds = new Set<string>();

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      reject(req.error ?? new Error("IndexedDB open failed"));
    };
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const request = run(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

function cloneConversation(conversation: Conversation): Conversation {
  return { ...conversation, messages: conversation.messages.map((message) => ({ ...message })) };
}

export function generateTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.trim().replace(/\s+/g, " ");
  if (!cleaned) return "新对话";
  if (cleaned.length <= TITLE_LIMIT) return cleaned;
  return cleaned.slice(0, TITLE_LIMIT) + "…";
}

export function createConversation(): Conversation {
  const now = Date.now();
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c-${now}-${Math.random().toString(36).slice(2, 10)}`,
    title: "新对话",
    createdAt: now,
    updatedAt: now,
    messages: [],
    version: 1,
  };
}

export function listConversations(): Promise<Conversation[]> {
  return tx<Conversation[]>("readonly", (store) => store.getAll()).then((items) =>
    (items ?? []).sort((a, b) => b.updatedAt - a.updatedAt),
  );
}

export function getConversation(id: string): Promise<Conversation | null> {
  return tx<Conversation | undefined>("readonly", (store) => store.get(id)).then((item) => item ?? null);
}

export function saveConversation(conversation: Conversation): Promise<void> {
  const snapshot = cloneConversation(conversation);
  if (deletedConversationIds.has(snapshot.id)) {
    return Promise.reject(new Error("Conversation has been deleted"));
  }
  return enqueueConversation(snapshot.id, () =>
    tx("readwrite", (store) => store.put(snapshot)).then(() => undefined),
  );
}

export function deleteConversation(id: string): Promise<void> {
  deletedConversationIds.add(id);
  return enqueueConversation(id, () => tx("readwrite", (store) => store.delete(id)).then(() => undefined));
}

export function renameConversation(id: string, title: string): Promise<void> {
  return getConversation(id).then((conv) => {
    if (!conv) return;
    conv.title = title;
    conv.updatedAt = Date.now();
    return saveConversation(conv);
  });
}

export function getActiveConversationId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveConversationId(id: string | null): void {
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // localStorage may be unavailable; in-memory state still works.
  }
}

export function isStoreAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
