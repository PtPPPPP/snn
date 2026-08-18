"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AiClientError, getAiStatus, streamChatMessage } from "../../lib/ai-client";
import type { AiChatMessage } from "../../lib/ai-client";
import {
  createConversation,
  deleteConversation as deleteConv,
  generateTitle,
  getActiveConversationId,
  getConversation,
  listConversations,
  saveConversation,
  setActiveConversationId,
  type Conversation,
} from "../../lib/ai-conversation-store";
import {
  EMPTY_STATE,
  NODE_STATES,
  SIDEBAR,
  STATUS_DETAILS,
  STATUS_LABELS,
  THINKING_MODE,
  UNAVAILABLE_REPLY,
} from "../../lib/ai-copy";
import ChatInput from "./chat-input";
import ChatMessage, { type ChatMessageModel } from "./chat-message";
import styles from "./ai-chat.module.css";

type AiNodeState = "checking" | "offline" | "online";
const THINKING_STORAGE_KEY = "snn-ai-thinking-mode";

function toUiMessages(messages: AiChatMessage[]): ChatMessageModel[] {
  return messages.map((m, i) => ({
    id: `${m.role}-${i}-${m.content.length}`,
    role: m.role,
    content: m.content,
  }));
}

function toStoredMessages(messages: ChatMessageModel[]): AiChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "昨天";
  if (day < 30) return `${day} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

function createUiMessage(role: ChatMessageModel["role"], content: string): ChatMessageModel {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

export default function AiChat() {
  const [messages, setMessages] = useState<ChatMessageModel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [aiNodeState, setAiNodeState] = useState<AiNodeState>("checking");
  const [modelName, setModelName] = useState<string | null>(null);
  const [streamNotice, setStreamNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [thinkingMode, setThinkingMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(THINKING_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isThinkingRequest, setIsThinkingRequest] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldFollowStreamRef = useRef(true);
  const activeIdRef = useRef<string | null>(null);
  const requestConversationIdRef = useRef<string | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const thinkingStartedAtRef = useRef<number | null>(null);
  const messagesRefLatest = useRef<ChatMessageModel[]>([]);

  useEffect(() => {
    messagesRefLatest.current = messages;
  }, [messages]);

  // Load conversations on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listConversations();
      if (cancelled) return;
      setConversations(list);
      const storedActiveId = getActiveConversationId();
      const target =
        (storedActiveId && list.find((c) => c.id === storedActiveId)) ||
        list[0] ||
        null;
      if (target) {
        setActiveId(target.id);
        activeIdRef.current = target.id;
        setActiveConversationId(target.id);
        setMessages(toUiMessages(target.messages));
      } else {
        const fresh = createConversation();
        setActiveId(fresh.id);
        activeIdRef.current = fresh.id;
        setMessages([]);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = messagesRef.current;
    if (container && shouldFollowStreamRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isResponding]);

  useEffect(() => {
    return () => streamControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void getAiStatus().then((status) => {
      if (!isCurrent) return;
      setAiNodeState(status.online ? "online" : "offline");
      setModelName(status.model);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  function persistCurrentMessages(convId: string, uiMessages: ChatMessageModel[]) {
    const stored = toStoredMessages(uiMessages.filter((m) => m.content.trim() !== ""));
    saveConversation({
      id: convId,
      title: conversations.find((c) => c.id === convId)?.title ?? "新对话",
      createdAt: conversations.find((c) => c.id === convId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      messages: stored,
      version: 1,
    }).then(() => refreshConversationList());
  }

  function refreshConversationList() {
    listConversations().then(setConversations);
  }

  function switchConversation(id: string) {
    if (id === activeIdRef.current) return;
    // Abort current stream and save partial
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    requestConversationIdRef.current = null;
    const currentId = activeIdRef.current;
    if (currentId) {
      persistCurrentMessages(currentId, messagesRefLatest.current);
    }
    getConversation(id).then((conv) => {
      if (!conv) return;
      setActiveId(id);
      activeIdRef.current = id;
      setActiveConversationId(id);
      setMessages(toUiMessages(conv.messages));
      setIsResponding(false);
      setIsThinkingRequest(false);
      setStreamNotice(null);
      thinkingStartedAtRef.current = null;
      setSidebarOpen(false);
    });
  }

  function startNewConversation() {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    requestConversationIdRef.current = null;
    const currentId = activeIdRef.current;
    if (currentId) {
      persistCurrentMessages(currentId, messagesRefLatest.current);
    }
    const fresh = createConversation();
    setActiveId(fresh.id);
    activeIdRef.current = fresh.id;
    setActiveConversationId(fresh.id);
    setMessages([]);
    setIsResponding(false);
    setIsThinkingRequest(false);
    setStreamNotice(null);
    thinkingStartedAtRef.current = null;
    setSidebarOpen(false);
  }

  function stopGeneration() {
    streamControllerRef.current?.abort();
  }

  function handleMessagesScroll() {
    const container = messagesRef.current;
    if (!container) return;
    shouldFollowStreamRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  }

  function handleThinkingChange(enabled: boolean) {
    setThinkingMode(enabled);
    try {
      window.localStorage.setItem(THINKING_STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }

  function sendMessage(content: string) {
    const convId = activeIdRef.current;
    if (!convId) return;

    const activeThinking = thinkingMode;
    const userMessage = createUiMessage("user", content);
    const assistantMessage = createUiMessage("assistant", "");
    const requestMessages = [...messages, userMessage];
    const nextMessages = [...requestMessages, assistantMessage];
    const requestVersion = (requestConversationIdRef.current ?? "") + "|" + Date.now();
    const controller = new AbortController();

    requestConversationIdRef.current = convId;
    streamControllerRef.current = controller;
    thinkingStartedAtRef.current = null;
    shouldFollowStreamRef.current = true;
    setMessages(nextMessages);
    setIsResponding(true);
    setIsThinkingRequest(activeThinking);
    setStreamNotice(null);

    // Save user message immediately + auto title on first message
    const isFirstMessage = messages.length === 0;
    const conv = conversations.find((c) => c.id === convId);
    const updatedConv: Conversation = {
      id: convId,
      title: isFirstMessage ? generateTitle(content) : conv?.title ?? "新对话",
      createdAt: conv?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      messages: toStoredMessages(requestMessages),
      version: 1,
    };
    saveConversation(updatedConv).then(refreshConversationList);

    const sentConvId = convId;

    void streamChatMessage({
      messages: requestMessages.map(({ role, content: mc }) => ({ role, content: mc })),
      thinking: activeThinking,
      signal: controller.signal,
      onReasoningStart: () => {
        if (requestConversationIdRef.current !== sentConvId || !activeThinking) return;
        thinkingStartedAtRef.current = performance.now();
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantMessage.id ? { ...m, isThinking: true } : m,
          ),
        );
      },
      onDelta: (text) => {
        if (requestConversationIdRef.current !== sentConvId) return;
        const startedAt = thinkingStartedAtRef.current;
        const thinkingSeconds =
          startedAt === null ? undefined : (performance.now() - startedAt) / 1000;
        thinkingStartedAtRef.current = null;
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: m.content + text,
                  isThinking: false,
                  ...(thinkingSeconds === undefined ? {} : { thinkingSeconds }),
                }
              : m,
          ),
        );
      },
      onDone: (metadata) => {
        const thinkingSeconds =
          metadata.reasoningObserved && typeof metadata.thinkingMs === "number"
            ? metadata.thinkingMs / 1000
            : undefined;
        thinkingStartedAtRef.current = null;
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, isThinking: false, ...(thinkingSeconds === undefined ? {} : { thinkingSeconds }) }
              : m,
          ),
        );
      },
      onError: (message) => {
        if (requestConversationIdRef.current === sentConvId) {
          setStreamNotice(message);
        }
      },
    })
      .catch((error) => {
        if (requestConversationIdRef.current !== sentConvId) return;
        if (error instanceof AiClientError && error.code === "aborted") {
          setStreamNotice(activeThinking ? THINKING_MODE.stopped : "生成已停止。");
          return;
        }
        setAiNodeState("offline");
        setModelName(null);
        setStreamNotice((cur) => cur ?? UNAVAILABLE_REPLY);
      })
      .finally(() => {
        if (requestConversationIdRef.current === sentConvId) {
          setIsResponding(false);
          setIsThinkingRequest(false);
          streamControllerRef.current = null;
          thinkingStartedAtRef.current = null;
          setMessages((cur) =>
            cur.map((m) =>
              m.id === assistantMessage.id ? { ...m, isThinking: false } : m,
            ),
          );
          // Persist final state of this conversation
          persistCurrentMessages(sentConvId, messagesRefLatest.current);
          requestConversationIdRef.current = null;
        }
      });
  }

  function handleDelete(id: string) {
    setConfirmDeleteId(id);
  }

  function confirmDelete() {
    const id = confirmDeleteId;
    if (!id) return;
    setConfirmDeleteId(null);
    deleteConv(id).then(async () => {
      const list = await listConversations();
      setConversations(list);
      if (id === activeIdRef.current) {
        if (list.length > 0) {
          switchConversation(list[0].id);
        } else {
          const fresh = createConversation();
          setActiveId(fresh.id);
          activeIdRef.current = fresh.id;
          setActiveConversationId(fresh.id);
          setMessages([]);
        }
      }
    });
  }

  const statusLabel =
    aiNodeState === "checking" ? STATUS_LABELS.checking
      : aiNodeState === "online" ? STATUS_LABELS.online : STATUS_LABELS.offline;
  const statusDetail =
    aiNodeState === "checking" ? STATUS_DETAILS.checking
      : aiNodeState === "online" ? modelName ?? STATUS_DETAILS.ready : STATUS_DETAILS.offline;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="返回 SNN 首页">
          <img src="/assets/snn-logo-fixed.png" alt="SNN 社团 Logo" width={1254} height={1254} />
          <span>SNN AI<small>SMART NEURAL NETWORK</small></span>
        </Link>
        <div className={styles.headerRight}>
          <button
            className={styles.sidebarToggle}
            type="button"
            aria-label="打开历史对话"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <Link className={styles.backLink} href="/">返回官网 <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <section className={`${styles.chatShell} ${sidebarOpen ? styles.chatShellShifted : ""}`} aria-label="SNN AI Chat">
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div>
              <p className={styles.sectionCode}>{SIDEBAR.sectionCode}</p>
              <h1>{SIDEBAR.title}</h1>
              <p className={styles.description}>{SIDEBAR.description}</p>
            </div>
            <button className={styles.sidebarClose} type="button" aria-label="关闭历史" onClick={() => setSidebarOpen(false)}>✕</button>
          </div>
          <div className={styles.statusCard} aria-label="AI 服务状态">
            <span className={`${styles.statusDot} ${aiNodeState === "online" ? styles.statusOnline : aiNodeState === "checking" ? styles.statusChecking : styles.statusOffline}`} aria-hidden="true" />
            <div><strong>{statusLabel}</strong><span>{statusDetail}</span></div>
          </div>
          <button className={styles.newChatButton} type="button" onClick={startNewConversation}>
            <span>＋</span> 新建对话
          </button>
          <div className={styles.historyLabel}>最近对话</div>
          <nav className={styles.historyList} aria-label="历史对话">
            {conversations.length === 0 ? (
              <p className={styles.historyEmpty}>暂无历史对话</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`${styles.historyItem} ${conv.id === activeId ? styles.historyItemActive : ""}`}
                  aria-current={conv.id === activeId ? "true" : undefined}
                >
                  <button
                    className={styles.historyItemMain}
                    type="button"
                    onClick={() => switchConversation(conv.id)}
                  >
                    <span className={styles.historyItemTitle}>{conv.title}</span>
                    <span className={styles.historyItemTime}>{formatRelativeTime(conv.updatedAt)}</span>
                  </button>
                  <button
                    className={styles.historyItemDelete}
                    type="button"
                    aria-label="删除对话"
                    onClick={() => handleDelete(conv.id)}
                  >⋯</button>
                </div>
              ))
            )}
          </nav>
        </aside>

        {sidebarOpen ? <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} aria-hidden="true" /> : null}

        <div className={styles.chatPanel}>
          <div className={styles.panelHeader}>
            <span>CHAT / HTTP READY</span>
            <span>{aiNodeState === "online" ? NODE_STATES.ready : NODE_STATES.offline}</span>
          </div>
          <div className={styles.messages} ref={messagesRef} onScroll={handleMessagesScroll} aria-live="polite">
            {!loaded ? null : messages.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyMark}>{EMPTY_STATE.mark}</span>
                <h2>{EMPTY_STATE.title}</h2>
                <p>{EMPTY_STATE.description}</p>
              </div>
            ) : (
              messages.map((message) => <ChatMessage key={message.id} message={message} />)
            )}
            {isResponding && !isThinkingRequest ? (
              <div className={styles.typing}><span>SNN AI 正在准备回复</span><i /><i /><i /></div>
            ) : null}
            {streamNotice ? <p className={styles.streamNotice}>{streamNotice}</p> : null}
          </div>
          <ChatInput
            isStreaming={isResponding}
            thinking={thinkingMode}
            onSend={sendMessage}
            onStop={stopGeneration}
            onThinkingChange={handleThinkingChange}
          />
        </div>
      </section>

      {confirmDeleteId ? (
        <div className={styles.modalBackdrop} onClick={() => setConfirmDeleteId(null)} role="dialog" aria-modal="true">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>确定删除这个对话吗？</p>
            <p className={styles.modalDesc}>此操作无法恢复。</p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} type="button" onClick={() => setConfirmDeleteId(null)}>取消</button>
              <button className={styles.modalConfirm} type="button" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
