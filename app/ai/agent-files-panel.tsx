"use client";

import { useState } from "react";
import {
  AgentClientError,
  getAgentFileUrl,
  isDirectEditableFileName,
  isPreviewableAgentFile,
  previewAgentFile,
  updateAgentFileContent,
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

// Editor lifecycle: one nullable object scoped to (sessionId, fileId). The
// status field keeps the modes mutually exclusive (editing/saving/conflict);
// the editor deliberately survives workspace-list changes so a file deleted
// mid-edit surfaces a 404 on save instead of silently dropping user input.
type EditState = {
  fileId: string;
  name: string;
  sessionId: string;
  content: string;
  originalContent: string;
  baseSha256: string;
  status: "editing" | "saving" | "conflict" | "deleted" | "error";
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
  const [edit, setEdit] = useState<EditState | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Preview is only valid for the session it was opened in and while the file
  // still exists in the authoritative manifest. Deriving it (rather than
  // resetting via effects) keeps session isolation and deletion handling
  // declarative: switching sessions or deleting the file hides the preview.
  const activePreview =
    preview && preview.sessionId === sessionId && files.some((f) => f.fileId === preview.file.fileId)
      ? preview
      : null;
  // The editor is session-scoped but independent of the live manifest: it
  // survives a concurrent deletion so the save attempt can report 404.
  const activeEdit = edit && edit.sessionId === sessionId ? edit : null;
  const editDirty = activeEdit !== null && activeEdit.content !== activeEdit.originalContent;
  // Orphaned editor from a previous session: never saveable, discard is
  // explicit so unsaved work is never silently dropped.
  const orphanedEdit = edit && edit.sessionId !== sessionId ? edit : null;

  async function openPreview(file: AgentFile) {
    if (!sessionId) return;
    setEdit(null);
    setConfirmDiscard(false);
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

  function startEdit() {
    if (!activePreview?.data?.sha256 || !sessionId) return;
    setEdit({
      fileId: activePreview.file.fileId,
      name: activePreview.file.originalName,
      sessionId,
      content: activePreview.data.content,
      originalContent: activePreview.data.content,
      baseSha256: activePreview.data.sha256,
      status: "editing",
    });
    setConfirmDiscard(false);
  }

  function requestExitEdit() {
    if (editDirty) {
      setConfirmDiscard(true);
      return;
    }
    setEdit(null);
    setConfirmDiscard(false);
  }

  async function saveEdit() {
    if (!activeEdit || !sessionId) return;
    if (activeEdit.status !== "editing" || activeEdit.content === activeEdit.originalContent) return;
    setEdit({ ...activeEdit, status: "saving" });
    try {
      const result = await updateAgentFileContent(activeEdit.sessionId, activeEdit.fileId, {
        content: activeEdit.content,
        baseSha256: activeEdit.baseSha256,
      });
      // Authoritative refresh: the manifest now carries the new updatedAt, so
      // Recent Changes derive a real Modified entry instead of a fake one.
      onRetryLoad();
      setPreview((cur) =>
        cur && cur.file.fileId === activeEdit.fileId && cur.sessionId === activeEdit.sessionId
          ? {
              ...cur,
              file: { ...cur.file, size: result.file.size, updatedAt: result.file.updatedAt },
              status: "ready",
              data: { ...(cur.data as AgentFilePreview), content: activeEdit.content, size: result.file.size, sha256: result.sha256 },
            }
          : cur,
      );
      setEdit(null);
      setConfirmDiscard(false);
    } catch (error) {
      const status = error instanceof AgentClientError ? error.status : undefined;
      if (status === 409) {
        setEdit((cur) => (cur ? { ...cur, status: "conflict" } : cur));
      } else if (status === 404) {
        setEdit((cur) => (cur ? { ...cur, status: "deleted" } : cur));
        onRetryLoad();
      } else {
        setEdit((cur) => (cur ? { ...cur, status: "error" } : cur));
      }
    }
  }

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (editDirty && activeEdit.status === "editing") void saveEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      requestExitEdit();
    }
  }

  const downloadHref = activePreview
    ? activePreview.file.downloadUrl ?? (sessionId ? getAgentFileUrl(sessionId, activePreview.file.fileId) : undefined)
    : undefined;
  const canEdit =
    activePreview?.status === "ready" &&
    activePreview.data?.sha256 !== undefined &&
    !activePreview.data.truncated &&
    activePreview.data.content.length <= 256 * 1024 &&
    isDirectEditableFileName(activePreview.file.originalName);

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

      {activeEdit ? (
        <div className={styles.workspacePreview}>
          <div className={styles.workspacePreviewBar}>
            <button type="button" className={styles.workspaceBack} onClick={requestExitEdit} aria-label="返回文件列表">
              ← 文件
            </button>
            <span className={styles.workspacePreviewName} title={activeEdit.name}>
              {activeEdit.name}
              {editDirty ? " ●" : ""}
            </span>
            <button
              type="button"
              className={styles.workspacePreviewDownload}
              onClick={() => void saveEdit()}
              disabled={activeEdit.status === "saving" || !editDirty}
              data-testid="editor-save"
              aria-label={`保存 ${activeEdit.name}`}
            >
              {activeEdit.status === "saving" ? "保存中…" : "保存"}
            </button>
          </div>
          {activeEdit.status === "conflict" ? (
            <div className={styles.workspaceEditorNotice} role="alert">
              <p>文件已被其他操作修改，未覆盖最新版本。</p>
              <button
                type="button"
                className={styles.workspaceRetry}
                onClick={() => {
                  const file = files.find((f) => f.fileId === activeEdit.fileId);
                  setEdit(null);
                  setConfirmDiscard(false);
                  if (file) void openPreview(file);
                }}
              >
                加载最新版本
              </button>
            </div>
          ) : null}
          {activeEdit.status === "deleted" ? (
            <div className={styles.workspaceEditorNotice} role="alert">
              <p>文件已不存在，无法保存。</p>
              <button type="button" className={styles.workspaceRetry} onClick={() => { setEdit(null); setConfirmDiscard(false); }}>
                知道了
              </button>
            </div>
          ) : null}
          {activeEdit.status === "error" ? (
            <p className={styles.workspaceEditorNotice} role="alert">
              保存失败，请重试。
            </p>
          ) : null}
          {confirmDiscard ? (
            <div className={styles.workspaceEditorNotice} role="alertdialog" aria-label="未保存的修改">
              <p>有未保存的修改，确定放弃吗？</p>
              <div className={styles.workspaceEditorNoticeActions}>
                <button type="button" className={styles.workspaceRetry} onClick={() => { setEdit(null); setConfirmDiscard(false); }}>
                  放弃修改
                </button>
                <button type="button" className={styles.agentFilesPreview} onClick={() => setConfirmDiscard(false)}>
                  继续编辑
                </button>
              </div>
            </div>
          ) : null}
          <textarea
            className={styles.workspaceEditor}
            value={activeEdit.content}
            onChange={(event) => setEdit((cur) => (cur ? { ...cur, content: event.target.value, status: cur.status === "saving" ? "saving" : "editing" } : cur))}
            onKeyDown={onEditorKeyDown}
            disabled={activeEdit.status === "saving"}
            spellCheck={false}
            aria-label={`编辑 ${activeEdit.name}`}
            data-testid="workspace-editor"
          />
        </div>
      ) : activePreview ? (
        <div className={styles.workspacePreview}>
          <div className={styles.workspacePreviewBar}>
            <button type="button" className={styles.workspaceBack} onClick={() => setPreview(null)} aria-label="返回文件列表">
              ← 文件
            </button>
            {canEdit ? (
              <button type="button" className={styles.agentFilesPreview} onClick={startEdit} aria-label={`编辑 ${activePreview.file.originalName}`} data-testid="editor-open">
                编辑
              </button>
            ) : null}
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
            <p className={styles.workspacePreviewNotice}>文件过大，暂不支持直接编辑，可下载查看。</p>
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
          {orphanedEdit ? (
            <div className={styles.workspaceEditorNotice} role="alert">
              <p>上一个会话有未保存的修改（{orphanedEdit.name}）。</p>
              <button type="button" className={styles.workspaceRetry} onClick={() => { setEdit(null); setConfirmDiscard(false); }}>
                放弃修改
              </button>
            </div>
          ) : null}
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
  if (name === "read" || name === "workspace.read") return "读取文件";
  if (name === "write" || name === "create") return "创建文件";
  if (name === "edit") return "编辑文件";
  if (name === "workspace.open") return "打开文件";
  if (name === "workspace.extract") return "解析文档";
  if (name === "workspace.spreadsheet.inspect") return "读取工作簿";
  if (name === "workspace.spreadsheet.patch") return "修改工作簿";
  if (name === "workspace.fetch") return "抓取网页";
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
