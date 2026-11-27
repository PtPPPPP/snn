"use client";

import { findHarnessTool } from "../../shared/snn-harness-catalog.mjs";
import type { ToolActivity } from "./use-agent";
import styles from "./ai-chat.module.css";

export default function AgentToolActivity({ items }: { items: ToolActivity[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.toolActivity} role="status" aria-label="工具活动">
      <div className={styles.toolActivityHeader}>
        <span className={styles.toolActivityTitle}>AGENT LOOP · TOOL CALLS</span>
        <span className={styles.toolActivityCount}>{items.length} 步</span>
      </div>
      <div className={styles.toolActivityList}>
        {items.map((t, index) => {
          const meta = findHarnessTool(t.name);
          const title = meta?.title ?? t.displayName ?? toolLabel(t.name);
          const category = (meta?.category ?? t.category ?? "read").toUpperCase();
          const summary = meta?.summary ?? "在受控工作区边界内执行工具调用。";
          return (
            <details key={t.id} className={styles.toolCallCard}>
              <summary className={styles.toolActivityItem}>
                <span className={styles.toolStepIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.toolCategoryBadge} data-category={category.toLowerCase()}>
                  {category}
                </span>
                <span className={styles.toolActivityName}>{title}</span>
                {typeof t.durationMs === "number" ? (
                  <span className={styles.toolDuration}>{t.durationMs}ms</span>
                ) : null}
                <span
                  className={`${styles.toolActivityStatus} ${
                    t.status === "failed"
                      ? styles.toolFailed
                      : t.status === "completed"
                        ? styles.toolCompleted
                        : styles.toolStarted
                  }`}
                >
                  {t.status === "started" ? "正在读取…" : t.status === "completed" ? "✓" : "✕"}
                </span>
              </summary>
              <div className={styles.toolCallDetail}>
                <div className={styles.toolCallMetaRow}>
                  <span>工具 ID：<code>{t.name}</code></span>
                  <span>状态：{t.status === "started" ? "执行中" : t.status === "completed" ? "已完成" : "执行失败"}</span>
                </div>
                <p className={styles.toolCallSummary}>{summary}</p>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function toolLabel(name: string) {
  if (name === "read" || name === "workspace.read") return "读取 Workspace 文件";
  if (name === "write") return "创建 Workspace 文件";
  if (name === "edit") return "编辑 Workspace 文件";
  if (name === "workspace.diff") return "计算 Workspace Diff";
  if (name === "snn.sim.rocket") return "火箭回收物理仿真";
  if (name === "snn.lab.network") return "神经网络计算实验";
  return name;
}
