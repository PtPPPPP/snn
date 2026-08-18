"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getAiStatus, sendChatMessage } from "../../lib/ai-client";
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
  const messageEndRef = useRef<HTMLDivElement>(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isResponding]);

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
    requestVersionRef.current += 1;
    setMessages([]);
    setIsResponding(false);
  }

  function sendMessage(content: string) {
    const nextMessages = [...messages, createMessage("user", content)];
    const requestVersion = requestVersionRef.current + 1;

    requestVersionRef.current = requestVersion;
    setMessages(nextMessages);
    setIsResponding(true);

    void sendChatMessage({
      messages: nextMessages.map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      })),
    })
      .then((response) => {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        setMessages((currentMessages) => [
          ...currentMessages,
          createMessage("assistant", response.reply),
        ]);
      })
      .catch(() => {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        setAiNodeState("offline");
        setModelName(null);
        setMessages((currentMessages) => [
          ...currentMessages,
          createMessage("assistant", UNAVAILABLE_REPLY),
        ]);
      })
      .finally(() => {
        if (requestVersionRef.current === requestVersion) {
          setIsResponding(false);
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
          <div className={styles.messages} aria-live="polite">
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
            <div ref={messageEndRef} />
          </div>
          <ChatInput disabled={isResponding} onSend={sendMessage} />
        </div>
      </section>
    </main>
  );
}
