import styles from "./ai-chat.module.css";

export type ChatRole = "assistant" | "user";

export type ChatMessageModel = {
  id: string;
  role: ChatRole;
  content: string;
  isThinking?: boolean;
  thinkingSeconds?: number;
};

type ChatMessageProps = {
  message: ChatMessageModel;
};

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <article
      className={`${styles.messageRow} ${
        isUser ? styles.userMessageRow : styles.assistantMessageRow
      }`}
    >
      <span className={styles.messageLabel}>{isUser ? "YOU" : "SNN AI"}</span>
      {!isUser && message.isThinking ? (
        <span className={styles.thinkingLine}>思考中…</span>
      ) : null}
      {!isUser && message.thinkingSeconds !== undefined ? (
        <span className={styles.thinkingLine}>
          已思考 {message.thinkingSeconds.toFixed(1)} 秒
        </span>
      ) : null}
      <p className={`${styles.messageBubble} ${isUser ? styles.userBubble : ""}`}>
        {message.content}
      </p>
    </article>
  );
}
