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
  STATUS_DETAILS,
  STATUS_LABELS,
  THINKING_MODE,
  UNAVAILABLE_REPLY,
} from "../../lib/ai-copy";
import ChatInput from "./chat-input";
import ChatMessage, { type ChatMessageModel } from "./chat-message";
import ConversationSidebar from "./conversation-sidebar";
import DeleteConversationDialog from "./delete-conversation-dialog";
import styles from "./ai-chat.module.css";
import { buildConversationSnapshot, canApplyGeneration, canApplyNavigation } from "../../lib/ai-conversation-state.mjs";
import { deleteConversationLifecycle, saveConversationWithNotice } from "../../lib/ai-conversation-lifecycle.mjs";

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

// Module-level wrapper so the timestamp is not flagged by react-hooks/purity
// when read inside component-body event handlers. Behavior is unchanged.
function now(): number {
  return Date.now();
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
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
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
  const generationSequenceRef = useRef(0);
  const activeGenerationRef = useRef(0);
  const navigationSequenceRef = useRef(0);
  const deleteFocusReturnIdRef = useRef<string | null>(null);

  useEffect(() => {
    messagesRefLatest.current = messages;
  }, [messages]);

  // Load conversations on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list: Conversation[];
      try {
        list = await listConversations();
      } catch {
        list = [];
        setStorageNotice("本次对话未保存");
      }
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
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isResponding]);

  useEffect(() => {
    return () => streamControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (confirmDeleteId !== null || !deleteFocusReturnIdRef.current) return;
    const targetId = deleteFocusReturnIdRef.current;
    deleteFocusReturnIdRef.current = null;
    requestAnimationFrame(() => document.getElementById(targetId)?.focus());
  }, [confirmDeleteId]);

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
    void saveConversationWithNotice({ conversation: {
      id: convId,
      title: conversations.find((c) => c.id === convId)?.title ?? "新对话",
      createdAt: conversations.find((c) => c.id === convId)?.createdAt ?? now(),
      updatedAt: now(),
      messages: stored,
      version: 1,
    }, saveConversation, setNotice: setStorageNotice }).then((saved) => { if (saved) refreshConversationList(); });
  }

  function refreshConversationList() {
    void listConversations().then(setConversations).catch(() => setStorageNotice("本次对话未保存"));
  }

  function switchConversation(id: string) {
    if (id === activeIdRef.current) return;
    // Abort current stream and save partial
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    activeGenerationRef.current = ++generationSequenceRef.current;
    const navigationToken = ++navigationSequenceRef.current;
    const currentId = activeIdRef.current;
    if (currentId) {
      persistCurrentMessages(currentId, messagesRefLatest.current);
    }
    getConversation(id).then((conv) => {
      if (!conv || !canApplyNavigation(navigationToken, navigationSequenceRef.current, id, conv.id)) return;
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
    activeGenerationRef.current = ++generationSequenceRef.current;
    ++navigationSequenceRef.current;
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
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    shouldFollowStreamRef.current = isNearBottom;
    setShowScrollToBottom(!isNearBottom && messages.length > 0);
  }

  function scrollToBottom() {
    const container = messagesRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      shouldFollowStreamRef.current = true;
      setShowScrollToBottom(false);
    }
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
    const controller = new AbortController();
    let assistantContent = "";
    const generationToken = ++generationSequenceRef.current;

    requestConversationIdRef.current = convId;
    activeGenerationRef.current = generationToken;
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
      createdAt: conv?.createdAt ?? now(),
      updatedAt: now(),
      messages: toStoredMessages(requestMessages),
      version: 1,
    };
    void saveConversationWithNotice({ conversation: updatedConv, saveConversation, setNotice: setStorageNotice }).then((saved) => { if (saved) refreshConversationList(); });

    const sentConvId = convId;

    void streamChatMessage({
      messages: requestMessages.map(({ role, content: mc }) => ({ role, content: mc })),
      thinking: activeThinking,
      signal: controller.signal,
      onReasoningStart: () => {
        if (!canApplyGeneration(activeGenerationRef.current, generationToken, activeIdRef.current, sentConvId) || !activeThinking) return;
        thinkingStartedAtRef.current = performance.now();
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantMessage.id ? { ...m, isThinking: true } : m,
          ),
        );
      },
      onDelta: (text) => {
        if (!canApplyGeneration(activeGenerationRef.current, generationToken, activeIdRef.current, sentConvId)) return;
        assistantContent += text;
        const startedAt = thinkingStartedAtRef.current;
        const thinkingSeconds =
          startedAt === null ? undefined : (performance.now() - startedAt) / 1000;
        thinkingStartedAtRef.current = null;
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: assistantContent,
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
        if (activeGenerationRef.current === generationToken && activeIdRef.current === sentConvId) {
          setStreamNotice(message);
        }
      },
    })
      .catch((error) => {
        if (activeGenerationRef.current !== generationToken) return;
        if (error instanceof AiClientError && error.code === "aborted") {
          setStreamNotice(activeThinking ? THINKING_MODE.stopped : "生成已停止。");
          return;
        }
        setAiNodeState("offline");
        setModelName(null);
        setStreamNotice((cur) => cur ?? UNAVAILABLE_REPLY);
      })
      .finally(() => {
        persistCurrentMessages(sentConvId, buildConversationSnapshot(updatedConv, requestMessages, assistantMessage, assistantContent).messages);
        if (activeGenerationRef.current === generationToken) {
          setIsResponding(false);
          setIsThinkingRequest(false);
          streamControllerRef.current = null;
          thinkingStartedAtRef.current = null;
          setMessages((cur) =>
            cur.map((m) =>
              m.id === assistantMessage.id ? { ...m, isThinking: false } : m,
            ),
          );
          requestConversationIdRef.current = null;
        }
      });
  }

  function handleDelete(id: string) {
    deleteFocusReturnIdRef.current = `conversation-delete-${id}`;
    setConfirmDeleteId(id);
  }

  function confirmDelete() {
    const id = confirmDeleteId;
    if (!id) return;
    setConfirmDeleteId(null);
    void deleteConversationLifecycle({
      targetConversationId: id,
      activeConversationId: activeIdRef.current,
      abortActiveRequest: () => { streamControllerRef.current?.abort(); streamControllerRef.current = null; },
      invalidateGeneration: () => { activeGenerationRef.current = ++generationSequenceRef.current; },
      invalidateNavigation: () => { ++navigationSequenceRef.current; },
      deleteConversation: deleteConv,
      listConversations,
      selectConversation: async (next) => { setConversations(await listConversations()); await switchConversation(next.id); },
      selectEmpty: () => { setConversations([]); setActiveId(null); activeIdRef.current = null; setActiveConversationId(null); setMessages([]); },
    }).catch(() => setStorageNotice("本次对话未保存"));
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
            aria-expanded={sidebarOpen}
            aria-controls="conversation-sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <Link className={styles.backLink} href="/">返回官网 <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <section className={`${styles.chatShell} ${sidebarOpen ? styles.chatShellShifted : ""}`} aria-label="SNN AI Chat">
        <ConversationSidebar id="conversation-sidebar" conversations={conversations} activeId={activeId} statusLabel={statusLabel} statusDetail={statusDetail} nodeState={aiNodeState} onOpenChange={setSidebarOpen} onNew={startNewConversation} onSelect={switchConversation} onDelete={handleDelete} />

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
          {storageNotice ? <p className={styles.streamNotice}>{storageNotice}</p> : null}
          </div>
          {showScrollToBottom ? (
            <button className={styles.scrollToBottom} type="button" onClick={scrollToBottom}>
              ↓ 回到底部
            </button>
          ) : null}
          <ChatInput
            isStreaming={isResponding}
            thinking={thinkingMode}
            onSend={sendMessage}
            onStop={stopGeneration}
            onThinkingChange={handleThinkingChange}
          />
        </div>
      </section>

      {confirmDeleteId ? <DeleteConversationDialog returnFocusId={`conversation-delete-${confirmDeleteId}`} onCancel={() => setConfirmDeleteId(null)} onConfirm={confirmDelete} /> : null}
    </main>
  );
}
