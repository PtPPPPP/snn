"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import styles from "./ai-chat.module.css";

type ChatInputProps = {
  isStreaming: boolean;
  thinking: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  onThinkingChange: (enabled: boolean) => void;
};

export default function ChatInput({
  isStreaming,
  thinking,
  onSend,
  onStop,
  onThinkingChange,
}: ChatInputProps) {
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
    if (event.nativeEvent.isComposing || event.isComposing) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <div className={styles.composerToolbar}>
        <label className={styles.composerLabel} htmlFor="ai-message">
          MESSAGE / 输入消息
        </label>
        <button
          className={`${styles.thinkingToggle} ${thinking ? styles.thinkingToggleActive : ""}`}
          type="button"
          aria-pressed={thinking}
          disabled={isStreaming}
          onClick={() => onThinkingChange(!thinking)}
        >
          <span aria-hidden="true">◇</span> 深度思考
        </button>
      </div>
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
