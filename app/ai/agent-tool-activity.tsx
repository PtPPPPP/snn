"use client";

import type { ToolActivity } from "./use-agent";
import styles from "./ai-chat.module.css";

export default function AgentToolActivity({ items }: { items: ToolActivity[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.toolActivity} role="status" aria-label="工具活动">
      <span className={styles.toolActivityTitle}>工具活动</span>
      <ul className={styles.toolActivityList}>
        {items.map((t) => (
          <li key={t.id} className={styles.toolActivityItem}>
            <span className={styles.toolActivityName}>{t.name}</span>
            <span className={`${styles.toolActivityStatus} ${t.status === "failed" ? styles.toolFailed : t.status === "completed" ? styles.toolCompleted : styles.toolStarted}`}>
              {t.status === "started" ? "正在读取…" : t.status === "completed" ? "✓" : "✕"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
