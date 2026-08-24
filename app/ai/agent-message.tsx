"use client";

import type { AgentMessage } from "./use-agent";
import { AgentAttachmentChip } from "./agent-attachment-chip";
import AgentToolActivity from "./agent-tool-activity";
import type { ToolActivity } from "./use-agent";
import styles from "./ai-chat.module.css";

export default function AgentMessage({
  message,
  toolActivity,
}: {
  message: AgentMessage;
  toolActivity?: ToolActivity[];
}) {
  const isUser = message.role === "user";
  return (
    <article className={`${styles.messageRow} ${isUser ? styles.userMessageRow : styles.assistantMessageRow}`} data-testid={isUser ? "agent-user-message" : "agent-assistant-message"}>
      <span className={styles.messageLabel}>{isUser ? "YOU" : "SNN AI"}</span>
      {isUser && message.attachments && message.attachments.length > 0 ? (
        <div className={styles.agentMessageAttachments} role="list" aria-label="本条消息附件">
          {message.attachments.map((f) => (
            <span key={f.fileId} role="listitem">
              <AgentAttachmentChip file={f} removable={false} />
            </span>
          ))}
        </div>
      ) : null}
      {!isUser && toolActivity && toolActivity.length > 0 ? <AgentToolActivity items={toolActivity} /> : null}
      <p className={`${styles.messageBubble} ${isUser ? styles.userBubble : ""}`}>{message.content}</p>
      {!isUser && message.isThinking ? <span className={styles.thinkingLine}>思考中…</span> : null}
      {!isUser && message.thinkingSeconds !== undefined ? <span className={styles.thinkingLine}>已思考 {message.thinkingSeconds.toFixed(1)} 秒</span> : null}
    </article>
  );
}
