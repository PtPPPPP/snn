"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import styles from "./ai-chat.module.css";

type ChatInputProps = {
  disabled: boolean;
  onSend: (content: string) => void;
};

export default function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [value, setValue] = useState("");

  function submit() {
    const content = value.trim();
    if (!content || disabled) {
      return;
    }

    onSend(content);
    setValue("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          disabled={disabled}
        />
        <button className={styles.sendButton} type="submit" disabled={disabled || !value.trim()}>
          {disabled ? "思考中" : "发送"} <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p className={styles.composerHint}>Enter 发送 · Shift + Enter 换行</p>
    </form>
  );
}
