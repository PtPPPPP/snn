"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ChatInput from "./chat-input";
import ChatMessage, { ChatMessageModel } from "./chat-message";
import styles from "./ai-chat.module.css";

const mockReply = "SNN AI 后端尚未连接。当前页面为聊天界面测试版本。";

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
  const messageEndRef = useRef<HTMLDivElement>(null);
  const responseTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isResponding]);

  useEffect(() => {
    return () => window.clearTimeout(responseTimerRef.current);
  }, []);

  function startNewConversation() {
    window.clearTimeout(responseTimerRef.current);
    setMessages([]);
    setIsResponding(false);
  }

  function sendMessage(content: string) {
    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage("user", content),
    ]);
    setIsResponding(true);

    responseTimerRef.current = window.setTimeout(() => {
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", mockReply),
      ]);
      setIsResponding(false);
    }, 420);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="返回 SNN 首页">
          <img src="/assets/snn-logo-fixed.png" alt="SNN 社团 Logo" />
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
            <span className={styles.statusDot} aria-hidden="true" />
            <div>
              <strong>SNN AI · Demo</strong>
              <span>本地模型尚未连接</span>
            </div>
          </div>
          <button className={styles.newChatButton} type="button" onClick={startNewConversation}>
            <span>＋</span> 新建对话
          </button>
        </aside>

        <div className={styles.chatPanel}>
          <div className={styles.panelHeader}>
            <span>CHAT / DEMO MODE</span>
            <span>NO MODEL CONNECTED</span>
          </div>
          <div className={styles.messages} aria-live="polite">
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyMark}>SNN / AI</span>
                <h2>从一个问题开始。</h2>
                <p>
                  这里将接入 SNN 本地 AI 节点。现在可以体验对话流程，回复内容为演示文本。
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
