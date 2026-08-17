import styles from "./ai-chat.module.css";

export type ChatRole = "assistant" | "user";

export type ChatMessageModel = {
  id: string;
  role: ChatRole;
  content: string;
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
      <p className={`${styles.messageBubble} ${isUser ? styles.userBubble : ""}`}>
        {message.content}
      </p>
    </article>
  );
}
