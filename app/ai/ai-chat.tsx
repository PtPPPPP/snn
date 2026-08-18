"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AiClientError, getAiStatus, streamChatMessage } from "../../lib/ai-client";
import {
  EMPTY_STATE,
  NODE_STATES,
  SIDEBAR,
  STATUS_DETAILS,
  STATUS_LABELS,
  UNAVAILABLE_REPLY,
} from "../../lib/ai-copy";
import ChatInput from "./chat-input";
import ChatMessage, { ChatMessageModel } from "./chat-message";
import styles from "./ai-chat.module.css";

type AiNodeState = "checking" | "offline" | "online";

function createMessage(role: ChatMessageModel["role"], content: string): ChatMessageModel {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

export default function AiChat() {
  const [messages, setMessages] = useState<ChatMessageModel[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [aiNodeState, setAiNodeState] = useState<AiNodeState>("checking");
  const [modelName, setModelName] = useState<string | null>(null);
  const [streamNotice, setStreamNotice] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldFollowStreamRef = useRef(true);
  const requestVersionRef = useRef(0);
  const streamControllerRef = useRef<AbortController | null>(null);

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
      if (!isCurrent) {
        return;
      }

      setAiNodeState(status.online ? "online" : "offline");
      setModelName(status.model);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  function startNewConversation() {
    streamControllerRef.current?.abort();
    requestVersionRef.current += 1;
    setMessages([]);
    setIsResponding(false);
    setStreamNotice(null);
  }

  function stopGeneration() {
    streamControllerRef.current?.abort();
  }

  function handleMessagesScroll() {
    const container = messagesRef.current;
    if (!container) {
      return;
    }

    shouldFollowStreamRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  }

  function sendMessage(content: string) {
    const assistantMessage = createMessage("assistant", "");
    const requestMessages = [...messages, createMessage("user", content)];
    const nextMessages = [...requestMessages, assistantMessage];
    const requestVersion = requestVersionRef.current + 1;
    const controller = new AbortController();

    requestVersionRef.current = requestVersion;
    streamControllerRef.current = controller;
    shouldFollowStreamRef.current = true;
    setMessages(nextMessages);
    setIsResponding(true);
    setStreamNotice(null);

    void streamChatMessage({
      messages: requestMessages.map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      })),
      signal: controller.signal,
      onDelta: (text) => {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: `${message.content}${text}` }
              : message,
          ),
        );
      },
      onDone: () => {},
      onError: (message) => {
        if (requestVersionRef.current === requestVersion) {
          setStreamNotice(message);
        }
      },
    })
      .catch((error) => {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        if (error instanceof AiClientError && error.code === "aborted") {
          setStreamNotice("生成已停止。");
          return;
        }

        setAiNodeState("offline");
        setModelName(null);
        setStreamNotice((currentNotice) => currentNotice ?? UNAVAILABLE_REPLY);
      })
      .finally(() => {
        if (requestVersionRef.current === requestVersion) {
          setIsResponding(false);
          streamControllerRef.current = null;
        }
      });
  }

  const statusLabel =
    aiNodeState === "checking"
      ? STATUS_LABELS.checking
      : aiNodeState === "online"
        ? STATUS_LABELS.online
        : STATUS_LABELS.offline;
  const statusDetail =
    aiNodeState === "checking"
      ? STATUS_DETAILS.checking
      : aiNodeState === "online"
        ? modelName ?? STATUS_DETAILS.ready
        : STATUS_DETAILS.offline;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="返回 SNN 首页">
          <img
            src="/assets/snn-logo-fixed.png"
            alt="SNN 社团 Logo"
            width={1254}
            height={1254}
          />
          <span>
            SNN AI
            <small>SMART NEURAL NETWORK</small>
          </span>
        </Link>
        <Link className={styles.backLink} href="/">
          返回官网 <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <section className={styles.chatShell} aria-label="SNN AI Chat">
        <aside className={styles.sidebar}>
          <div>
            <p className={styles.sectionCode}>{SIDEBAR.sectionCode}</p>
            <h1>{SIDEBAR.title}</h1>
            <p className={styles.description}>{SIDEBAR.description}</p>
          </div>
          <div className={styles.statusCard} aria-label="AI 服务状态">
            <span
              className={`${styles.statusDot} ${
                aiNodeState === "online"
                  ? styles.statusOnline
                  : aiNodeState === "checking"
                    ? styles.statusChecking
                    : styles.statusOffline
              }`}
              aria-hidden="true"
            />
            <div>
              <strong>{statusLabel}</strong>
              <span>{statusDetail}</span>
            </div>
          </div>
          <button className={styles.newChatButton} type="button" onClick={startNewConversation}>
            <span>＋</span> 新建对话
          </button>
        </aside>

        <div className={styles.chatPanel}>
          <div className={styles.panelHeader}>
            <span>CHAT / HTTP READY</span>
            <span>{aiNodeState === "online" ? NODE_STATES.ready : NODE_STATES.offline}</span>
          </div>
          <div
            className={styles.messages}
            ref={messagesRef}
            onScroll={handleMessagesScroll}
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyMark}>{EMPTY_STATE.mark}</span>
                <h2>{EMPTY_STATE.title}</h2>
                <p>{EMPTY_STATE.description}</p>
              </div>
            ) : (
              messages.map((message) => <ChatMessage key={message.id} message={message} />)
            )}
            {isResponding ? (
              <div className={styles.typing}>
                <span>SNN AI 正在准备回复</span>
                <i />
                <i />
                <i />
              </div>
            ) : null}
            {streamNotice ? <p className={styles.streamNotice}>{streamNotice}</p> : null}
          </div>
          <ChatInput isStreaming={isResponding} onSend={sendMessage} onStop={stopGeneration} />
        </div>
      </section>
    </main>
  );
}
