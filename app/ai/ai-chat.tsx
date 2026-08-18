"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getAiStatus, sendChatMessage } from "../../lib/ai-client";
import ChatInput from "./chat-input";
import ChatMessage, { ChatMessageModel } from "./chat-message";
import styles from "./ai-chat.module.css";

const unavailableReply = "SNN AI 节点当前未连接，请稍后再试。";

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
          createMessage("assistant", unavailableReply),
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
      ? "Checking AI Node..."
      : aiNodeState === "online"
        ? "SNN AI · Online"
        : "SNN AI · Offline";
  const statusDetail =
    aiNodeState === "checking"
      ? "正在检查本地 AI 节点"
      : aiNodeState === "online"
        ? modelName ?? "AI 节点已就绪"
        : "本地模型尚未连接";

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
            <p className={styles.sectionCode}>NODE / 01</p>
            <h1>SNN AI</h1>
            <p className={styles.description}>由 SNN 本地 AI 节点提供推理服务。</p>
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
            <span>{aiNodeState === "online" ? "NODE READY" : "NODE OFFLINE"}</span>
          </div>
          <div className={styles.messages} aria-live="polite">
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyMark}>SNN / AI</span>
                <h2>从一个问题开始。</h2>
                <p>
                  这里将连接 SNN 本地 AI 节点。节点离线时，页面会保留消息并提示服务暂不可用。
                </p>
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
