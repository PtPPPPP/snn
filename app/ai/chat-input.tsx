"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import styles from "./ai-chat.module.css";

type ChatInputProps = {
  isStreaming: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
};

export default function ChatInput({ isStreaming, onSend, onStop }: ChatInputProps) {
  const [value, setValue] = useState("");

  function submit() {
    const content = value.trim();
    if (!content || isStreaming) {
      return;
    }

    onSend(content);
    setValue("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStreaming) {
      onStop();
      return;
    }
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <label className={styles.composerLabel} htmlFor="ai-message">
        MESSAGE / 输入消息
      </label>
      <div className={styles.composerControls}>
        <textarea
          className={styles.composerInput}
          id="ai-message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="向 SNN AI 提问…"
          rows={1}
          maxLength={12000}
          disabled={isStreaming}
        />
        <button
          className={styles.sendButton}
          type="submit"
          disabled={!isStreaming && !value.trim()}
        >
          {isStreaming ? "停止生成" : "发送"} <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p className={styles.composerHint}>Enter 发送 · Shift + Enter 换行</p>
    </form>
  );
}
