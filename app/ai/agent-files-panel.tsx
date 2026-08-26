"use client";

import { useState } from "react";
import {
  AgentClientError,
  getAgentFileUrl,
  isPreviewableAgentFile,
  previewAgentFile,
  type AgentFile,
  type AgentFilePreview,
} from "../../lib/agent-client";
import type { ToolActivity, WorkspaceChange } from "./use-agent";
import styles from "./ai-chat.module.css";

type PreviewState = {
  file: AgentFile;
  sessionId: string;
  status: "loading" | "ready" | "unsupported" | "tooLarge" | "error";
  data?: AgentFilePreview;
};

// One authoritative Workspace presentation: Files, Recent Changes, and Agent
// Activity live in a single session-scoped panel (desktop column / mobile drawer).
export default function AgentWorkspacePanel({
  id,
  open,
  files,
  filesLoading,
  filesError,
  sessionId,
  onAttach,
  onDelete,
  onRetryLoad,
  pendingIds,
  recentChanges,
  activity,
  onClose,
}: {
  id?: string;
  open: boolean;
  files: AgentFile[];
  filesLoading: boolean;
  filesError: boolean;
  sessionId: string | null;
  onAttach: (file: AgentFile) => void;
  onDelete: (fileId: string) => void;
  onRetryLoad: () => void;
  pendingIds: Set<string>;
  recentChanges: WorkspaceChange[];
  activity: ToolActivity[];
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  // Preview is only valid for the session it was opened in and while the file
  // still exists in the authoritative manifest. Deriving it (rather than
  // resetting via effects) keeps session isolation and deletion handling
  // declarative: switching sessions or deleting the file hides the preview.
  const activePreview =
    preview && preview.sessionId === sessionId && files.some((f) => f.fileId === preview.file.fileId)
      ? preview
      : null;

  async function openPreview(file: AgentFile) {
    if (!sessionId) return;
    setPreview({ file, sessionId, status: "loading" });
    try {
      const data = await previewAgentFile(sessionId, file.fileId);
      setPreview((cur) =>
        cur && cur.file.fileId === file.fileId && cur.sessionId === sessionId ? { ...cur, status: "ready", data } : cur,
      );
    } catch (error) {
      const status = error instanceof AgentClientError ? error.status : undefined;
      const next = status === 415 ? "unsupported" : status === 413 ? "tooLarge" : "error";
      setPreview((cur) =>
        cur && cur.file.fileId === file.fileId && cur.sessionId === sessionId ? { ...cur, status: next } : cur,
      );
    }
  }

  const downloadHref = activePreview
    ? activePreview.file.downloadUrl ?? (sessionId ? getAgentFileUrl(sessionId, activePreview.file.fileId) : undefined)
    : undefined;

  return (
    <aside
      id={id}
      className={`${styles.workspacePanel} ${open ? styles.workspacePanelOpen : styles.workspacePanelClosed}`}
      data-testid="workspace-panel"
      aria-label="Agent 工作区"
      aria-hidden={open ? undefined : true}
    >
      <div className={styles.workspaceHeader}>
        <span className={styles.workspaceTitle}>WORKSPACE</span>
        <button type="button" className={styles.workspaceClose} aria-label="关闭工作区" onClick={onClose}>
          ✕
        </button>
      </div>

      {activePreview ? (
        <div className={styles.workspacePreview}>
          <div className={styles.workspacePreviewBar}>
            <button type="button" className={styles.workspaceBack} onClick={() => setPreview(null)} aria-label="返回文件列表">
              ← 文件
            </button>
            {downloadHref ? (
              <a className={styles.workspacePreviewDownload} href={downloadHref} download={activePreview.file.originalName} aria-label={`下载 ${activePreview.file.originalName}`}>
                下载
              </a>
            ) : null}
          </div>
          <div className={styles.workspacePreviewName} title={activePreview.file.originalName}>
            {activePreview.file.originalName}
          </div>
          {activePreview.status === "loading" ? (
            <p className={styles.workspacePreviewNotice}>正在加载预览…</p>
          ) : activePreview.status === "unsupported" ? (
            <p className={styles.workspacePreviewNotice}>此文件类型暂不支持预览，可下载查看。</p>
          ) : activePreview.status === "tooLarge" ? (
            <p className={styles.workspacePreviewNotice}>文件过大，无法直接预览，可下载查看。</p>
          ) : activePreview.status === "error" ? (
            <p className={styles.workspacePreviewNotice} role="alert">无法加载预览，请重试。</p>
          ) : (
            <>
              {activePreview.data?.truncated ? (
                <p className={styles.workspacePreviewTruncated}>文件较大，仅显示前部分内容。</p>
              ) : null}
              {/* Read-only and XSS-safe: content renders as text, never HTML. */}
              <pre className={styles.workspacePreviewContent}>{activePreview.data?.content}</pre>
            </>
          )}
        </div>
      ) : (
        <div className={styles.workspaceBody}>
          <section className={styles.workspaceSection} aria-label="文件">
            <div className={styles.workspaceSectionHeader}>
              <span>Files</span>
              <span className={styles.workspaceSectionCount}>{files.length}</span>
            </div>
            {filesError ? (
              <div className={styles.workspaceError}>
                <p>无法加载工作区文件</p>
                <button type="button" className={styles.workspaceRetry} onClick={onRetryLoad}>
                  重试
                </button>
              </div>
            ) : files.length === 0 && filesLoading ? (
              <p className={styles.workspaceEmpty}>加载中…</p>
            ) : files.length === 0 ? (
              <p className={styles.workspaceEmpty}>暂无文件，上传后即可在此查看与下载。</p>
            ) : (
              <ul className={styles.agentFilesList} data-testid="files-panel" role="list">
                {files.map((f) => (
                  <li key={f.fileId} className={styles.agentFilesItem} role="listitem">
                    <span className={styles.agentFilesName} title={f.originalName}>
                      {f.originalName}
                    </span>
                    <span className={styles.agentFilesMeta}>
                      {typeLabel(f)} · {formatSize(f.size)}
                    </span>
                    <span className={styles.agentFilesActions}>
                      {isPreviewableAgentFile(f) ? (
                        <button type="button" className={styles.agentFilesPreview} onClick={() => void openPreview(f)} aria-label={`预览 ${f.originalName}`}>
                          预览
                        </button>
                      ) : null}
                      <button type="button" className={styles.agentFilesAttach} disabled={pendingIds.has(f.fileId)} onClick={() => onAttach(f)} aria-label={`附加 ${f.originalName}`}>
                        {pendingIds.has(f.fileId) ? "已附加" : "附加"}
                      </button>
                      {f.downloadUrl || sessionId ? (
                        <a className={styles.agentFilesDownload} href={f.downloadUrl ?? getAgentFileUrl(sessionId as string, f.fileId)} download={f.originalName} aria-label={`下载 ${f.originalName}`}>
                          下载
                        </a>
                      ) : null}
                      <button type="button" className={styles.agentFilesDelete} onClick={() => onDelete(f.fileId)} aria-label={`删除文件 ${f.originalName}`}>
                        删除
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.workspaceSection} aria-label="最近变更">
            <div className={styles.workspaceSectionHeader}>
              <span>Recent Changes</span>
              <span className={styles.workspaceSectionCount}>{recentChanges.length}</span>
            </div>
            {recentChanges.length === 0 ? (
              <p className={styles.workspaceEmpty}>暂无变更记录。</p>
            ) : (
              <ul className={styles.workspaceChangeList} data-testid="workspace-changes" role="list">
                {recentChanges.map((c) => (
                  <li key={c.id} className={styles.workspaceChangeItem}>
                    <span
                      className={`${styles.workspaceChangeBadge} ${
                        c.type === "created" ? styles.changeCreated : c.type === "modified" ? styles.changeModified : styles.changeDeleted
                      }`}
                    >
                      {c.type === "created" ? "创建" : c.type === "modified" ? "修改" : "删除"}
                    </span>
                    <span className={styles.workspaceChangeName} title={c.name}>
                      {c.name}
                    </span>
                    <span className={styles.workspaceChangeTime}>{relativeTime(c.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.workspaceSection} aria-label="Agent 活动">
            <div className={styles.workspaceSectionHeader}>
              <span>Agent Activity</span>
              <span className={styles.workspaceSectionCount}>{activity.length}</span>
            </div>
            {activity.length === 0 ? (
              <p className={styles.workspaceEmpty}>暂无工具活动。</p>
            ) : (
              <ul className={styles.workspaceActivityList} data-testid="workspace-activity" role="list">
                {activity.map((t) => (
                  <li key={t.id} className={styles.workspaceActivityItem}>
                    <span className={styles.workspaceActivityName}>{toolLabel(t.name)}</span>
                    <span
                      className={`${styles.toolActivityStatus} ${
                        t.status === "failed" ? styles.toolFailed : t.status === "completed" ? styles.toolCompleted : styles.toolStarted
                      }`}
                    >
                      {t.status === "started" ? "进行中" : t.status === "completed" ? "完成" : "失败"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function typeLabel(file: AgentFile): string {
  const extension = /\.([a-z0-9]+)$/i.exec(file.originalName)?.[1]?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "PDF";
    case "doc":
    case "docx":
      return "DOCX";
    case "xls":
    case "xlsx":
      return "XLSX";
    case "txt":
    case "log":
      return "TXT";
    case "md":
    case "markdown":
      return "MD";
    case "csv":
      return "CSV";
    case "json":
      return "JSON";
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "py":
    case "java":
    case "c":
    case "h":
    case "cpp":
    case "go":
    case "rs":
    case "rb":
    case "sh":
    case "css":
    case "html":
    case "htm":
      return "CODE";
    default:
      return file.kind === "text" ? "TEXT" : "OTHER";
  }
}

function toolLabel(name: string) {
  if (name === "read") return "读取文件";
  if (name === "write" || name === "create") return "创建文件";
  if (name === "edit") return "编辑文件";
  if (name === "workspace.open") return "打开文件";
  if (name === "workspace.extract") return "解析文档";
  return name;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "昨天";
  if (day < 30) return `${day} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}
