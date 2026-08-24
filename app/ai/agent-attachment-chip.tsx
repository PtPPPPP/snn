"use client";

import type { AgentFile } from "../../lib/agent-client";
import styles from "./ai-chat.module.css";

function kindLabel(kind: string) {
  const k = kind.toLowerCase();
  if (k === "pdf") return "PDF";
  if (k === "docx") return "DOCX";
  if (k === "xlsx") return "XLSX";
  if (k === "text" || k === "md" || k === "txt" || k === "csv" || k === "json") return k.toUpperCase();
  return kind.toUpperCase();
}

function kindIcon(kind: string) {
  const k = kind.toLowerCase();
  if (k === "pdf") return "📄";
  if (k === "docx") return "📝";
  if (k === "xlsx") return "📊";
  return "📎";
}

export function AgentAttachmentChip({
  file,
  onRemove,
  removable = true,
}: {
  file: AgentFile;
  onRemove?: () => void;
  removable?: boolean;
}) {
  return (
    <span className={styles.agentChip} data-testid="attachment-chip">
      <span aria-hidden="true">{kindIcon(file.kind)}</span>
      <span className={styles.agentChipName}>{file.originalName}</span>
      <span className={styles.agentChipKind}>{kindLabel(file.kind)}</span>
      {typeof file.size === "number" ? <span className={styles.agentChipSize}>{formatSize(file.size)}</span> : null}
      {removable && onRemove ? (
        <button
          type="button"
          className={styles.agentChipRemove}
          aria-label={`移除附件 ${file.originalName}`}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AgentAttachmentChips({
  files,
  onRemove,
}: {
  files: AgentFile[];
  onRemove: (fileId: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className={styles.agentChips} role="list" aria-label="已选附件">
      {files.map((f) => (
        <span key={f.fileId} role="listitem">
          <AgentAttachmentChip file={f} onRemove={() => onRemove(f.fileId)} />
        </span>
      ))}
    </div>
  );
}
