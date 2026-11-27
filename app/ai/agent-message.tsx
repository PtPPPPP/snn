"use client";
import MarkdownContent from "../_components/markdown-content.mjs";

import { findHarnessPreset } from "../../shared/snn-harness-catalog.mjs";
import type { AgentMessage, ToolActivity } from "./use-agent";
import { AgentAttachmentChip } from "./agent-attachment-chip";
import AgentToolActivity from "./agent-tool-activity";
import styles from "./ai-chat.module.css";

export default function AgentMessage({
  message,
  toolActivity,
  onOpenArtifact,
}: {
  message: AgentMessage;
  toolActivity?: ToolActivity[];
  onOpenArtifact?: (fileId: string) => void;
}) {
  const isUser = message.role === "user";
  const effectiveTools = toolActivity && toolActivity.length > 0 ? toolActivity : message.toolCalls ?? [];
  const preset = message.presetId ? findHarnessPreset(message.presetId) : null;

  return (
    <article
      className={`${styles.messageRow} ${isUser ? styles.userMessageRow : styles.assistantMessageRow}`}
      data-testid={isUser ? "agent-user-message" : "agent-assistant-message"}
    >
      <span className={styles.messageLabel}>
        {isUser ? "YOU" : preset ? `SNN HARNESS · ${preset.badge}` : "SNN AI"}
      </span>
      {isUser && message.attachments && message.attachments.length > 0 ? (
        <div className={styles.agentMessageAttachments} role="list" aria-label="本条消息附件">
          {message.attachments.map((f) => (
            <span key={f.fileId} role="listitem">
              <AgentAttachmentChip file={f} removable={false} />
            </span>
          ))}
        </div>
      ) : null}
      {!isUser && (message.reasoningText || message.isThinking) ? (
        <details className={styles.reasoningCard} open={Boolean(message.isThinking)}>
          <summary className={styles.reasoningSummary}>
            <span className={styles.reasoningBadge}>REASONING</span>
            <span>
              {message.isThinking
                ? "正在推理与规划工具调用…"
                : message.thinkingSeconds !== undefined
                  ? `已完成思考（${message.thinkingSeconds.toFixed(1)} 秒）`
                  : "思考过程"}
            </span>
          </summary>
          {message.reasoningText ? (
            <pre className={styles.reasoningContent}>{message.reasoningText}</pre>
          ) : null}
        </details>
      ) : null}
      {!isUser && effectiveTools.length > 0 ? <AgentToolActivity items={effectiveTools} /> : null}
      <div className={`${styles.messageBubble} ${isUser ? styles.userBubble : ""}`}>
        {isUser ? message.content : <MarkdownContent text={message.content} />}
      </div>
      {!isUser && message.artifacts && message.artifacts.length > 0 ? (
        <div className={styles.artifactCardList} role="group" aria-label="本轮生成或修改的工作区文件">
          {message.artifacts.map((art) => (
            <button
              key={art.id}
              type="button"
              className={styles.artifactShortcutCard}
              onClick={() => onOpenArtifact?.(art.fileId)}
              aria-label={`在工作区预览 ${art.name}`}
            >
              <span
                className={`${styles.workspaceChangeBadge} ${
                  art.type === "created" ? styles.changeCreated : styles.changeModified
                }`}
              >
                {art.type === "created" ? "生成文件" : "修改文件"}
              </span>
              <span className={styles.artifactShortcutName}>{art.name}</span>
              <span className={styles.artifactShortcutAction}>在工作区预览 →</span>
            </button>
          ))}
        </div>
      ) : null}
      {!isUser && message.isThinking && !message.reasoningText ? <span className={styles.thinkingLine}>思考中…</span> : null}
      {!isUser && message.thinkingSeconds !== undefined && !message.reasoningText ? (
        <span className={styles.thinkingLine}>已思考 {message.thinkingSeconds.toFixed(1)} 秒</span>
      ) : null}
    </article>
  );
}
