"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import type { AgentFile } from "../../lib/agent-client";
import { AgentAttachmentChips } from "./agent-attachment-chip";
import styles from "./ai-chat.module.css";

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M10 16V4M5.5 8.5 10 4l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="4.375" y="4.375" width="11.25" height="11.25" rx="1.875" fill="currentColor" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const ACCEPT = ".txt,.md,.markdown,.json,.csv,.log,.xml,.yml,.yaml,.html,.htm,.ts,.tsx,.js,.mjs,.cjs,.py,.java,.c,.h,.cpp,.go,.rs,.rb,.sh,.sql,.ini,.toml,.pdf,.docx,.xlsx";

export default function AgentComposer({
  isStreaming,
  pendingAttachments,
  uploadState,
  onSend,
  onStop,
  onUpload,
  onRemovePending,
}: {
  isStreaming: boolean;
  pendingAttachments: AgentFile[];
  uploadState: Record<string, string>;
  onSend: (content: string, attachments: AgentFile[]) => void;
  onStop: () => void;
  onUpload: (file: File) => Promise<unknown>;
  onRemovePending: (fileId: string) => void;
}) {
  const [value, setValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isUploading = Object.values(uploadState).some((s) => s === "uploading");

  function submit() {
    const content = value.trim();
    if ((!content && pendingAttachments.length === 0) || isStreaming) return;
    // enforce server final authority but give early hint
    if (pendingAttachments.length > 8) return;
    if (!content && pendingAttachments.length === 0) return;
    // require non-empty message per backend contract first version
    if (!content) return;
    onSend(content, pendingAttachments);
    setValue("");
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isStreaming) {
      onStop();
      return;
    }
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing || (e as unknown as { isComposing?: boolean }).isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      // client early hint, server is final
      if (pendingAttachments.length >= 8) break;
      try {
        await onUpload(file);
      } catch {
        // error is shown via hook's error state
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form className={styles.composer} data-chat-composer data-testid="agent-composer" onSubmit={handleSubmit} onClick={(e) => { if (e.target === e.currentTarget) textareaRef.current?.focus(); }}>
      {pendingAttachments.length > 0 ? <AgentAttachmentChips files={pendingAttachments} onRemove={onRemovePending} /> : null}
      {isUploading ? <span className={styles.agentUploadHint} role="status">正在上传…</span> : null}
      <textarea
        ref={textareaRef}
        className={styles.composerInput}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        maxLength={12000}
        disabled={isStreaming}
        aria-label="输入 Agent 消息"
        placeholder="输入消息，附加文件后发送…"
        data-testid="agent-input"
      />
      <div className={styles.composerControls}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className={styles.agentFileInputHidden}
          aria-label="选择附件"
          data-testid="agent-file-input"
          onChange={(e) => void handleFiles(e.target.files)}
          disabled={isStreaming}
        />
        <button
          type="button"
          className={styles.agentUploadButton}
          aria-label="添加附件"
          title="添加附件"
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming}
          data-testid="agent-upload-button"
        >
          <PlusIcon />
        </button>
        <span className={styles.agentUploadHintInline} aria-hidden="true">
          {pendingAttachments.length > 0 ? `${pendingAttachments.length}/8` : null}
        </span>
        <button
          className={`${styles.sendButton} ${isStreaming ? styles.sendButtonStop : ""}`}
          type="submit"
          disabled={!isStreaming && !value.trim()}
          aria-label={isStreaming ? "停止生成" : "发送"}
          title={isStreaming ? "停止生成" : "发送"}
          data-testid="agent-send-button"
        >
          {isStreaming ? <StopIcon /> : <SendIcon />}
        </button>
      </div>
    </form>
  );
}
