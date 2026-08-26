"use client";

import { getAgentFileUrl, type AgentFile } from "../../lib/agent-client";
import styles from "./ai-chat.module.css";

export default function AgentFilesPanel({
  files,
  sessionId,
  onAttach,
  onDelete,
  pendingIds,
}: {
  files: AgentFile[];
  sessionId: string | null;
  onAttach: (file: AgentFile) => void;
  onDelete: (fileId: string) => void;
  pendingIds: Set<string>;
}) {
  return (
    <div className={styles.agentFilesPanel} data-testid="files-panel">
      <div className={styles.agentFilesHeader}>
        <span>文件</span>
        <span className={styles.agentFilesCount}>{files.length}</span>
      </div>
      {files.length === 0 ? (
        <p className={styles.agentFilesEmpty}>暂无文件，上传后可在此管理并附加到下一条消息。</p>
      ) : (
        <ul className={styles.agentFilesList} role="list">
          {files.map((f) => (
            <li key={f.fileId} className={styles.agentFilesItem} role="listitem">
              <span className={styles.agentFilesName} title={f.originalName}>
                {f.originalName}
              </span>
              <span className={styles.agentFilesMeta}>
                {f.kind.toUpperCase()} · {formatSize(f.size)}
              </span>
              <span className={styles.agentFilesActions}>
                <button type="button" className={styles.agentFilesAttach} disabled={pendingIds.has(f.fileId)} onClick={() => onAttach(f)} aria-label={`附加 ${f.originalName}`}>
                  {pendingIds.has(f.fileId) ? "已附加" : "附加"}
                </button>
                {(f.downloadUrl || sessionId) ? <a className={styles.agentFilesDownload} href={f.downloadUrl ?? getAgentFileUrl(sessionId as string, f.fileId)} download={f.originalName} aria-label={`下载 ${f.originalName}`}>下载</a> : null}
                <button type="button" className={styles.agentFilesDelete} onClick={() => onDelete(f.fileId)} aria-label={`删除文件 ${f.originalName}`}>
                  删除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.agentFilesHint}>文本 / 代码可编辑；PDF、DOCX、XLSX 可读取和提取；图片暂不支持解析。</p>
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
