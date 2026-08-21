"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <form
      className={styles.composer}
      onSubmit={handleSubmit}
      onClick={(e) => {
        if (e.target === e.currentTarget) textareaRef.current?.focus();
      }}
    >
      <textarea
        ref={textareaRef}
        className={styles.composerInput}
        id="ai-message"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        maxLength={12000}
        disabled={isStreaming}
        aria-label="输入消息"
      />
      <div className={styles.composerControls}>
        <button
          className={`${styles.thinkingToggle} ${thinking ? styles.thinkingToggleActive : ""}`}
          type="button"
          aria-pressed={thinking}
          disabled={isStreaming}
          onClick={() => onThinkingChange(!thinking)}
        >
          <span aria-hidden="true">{thinking ? "◆" : "◇"}</span> 深度思考
        </button>
        <button
          className={styles.sendButton}
          type="submit"
          disabled={!isStreaming && !value.trim()}
          aria-label={isStreaming ? "停止生成" : "发送"}
          title={isStreaming ? "停止生成" : "发送"}
        >
          <span aria-hidden="true">{isStreaming ? "■" : "↑"}</span>
        </button>
      </div>
    </form>
  );
}
