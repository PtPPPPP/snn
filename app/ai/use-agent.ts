"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentClientError,
  AGENT_UPLOAD_MAX_BYTES,
  cancelAgentRun,
  createAgentSession,
  deleteAgentFile,
  deleteAgentSession,
  getAgentStatus,
  listAgentFiles,
  listAgentSessions,
  streamAgentRun,
  uploadAgentFile,
  type AgentFile,
  type AgentRuntimeReadiness,
  type AgentSession,
} from "../../lib/agent-client";

export type AgentAttachment = AgentFile;

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AgentAttachment[];
  isThinking?: boolean;
  thinkingSeconds?: number;
};

export type AgentRunState = "idle" | "starting" | "streaming" | "cancelling" | "completed" | "failed" | "cancelled";

export type ToolActivity = {
  id: string;
  name: string;
  status: "started" | "completed" | "failed";
  timestamp: string;
};

export type WorkspaceChange = {
  id: string;
  fileId: string;
  name: string;
  type: "created" | "modified" | "deleted";
  at: number;
};

const MAX_ATTACHMENTS = 8;
const MAX_WORKSPACE_CHANGES = 20;
const MAX_WORKSPACE_ACTIVITY = 20;
const LOCAL_ACTIVE_KEY = "snn-agent-active-session";

function uploadErrorMessage(error: AgentClientError): string {
  if (error.detail === "AGENT_ATTACHMENT_LIMIT") return `最多只能附加 ${MAX_ATTACHMENTS} 个文件`;
  if (error.code === "network" || error.code === "http") return "文件上传失败，请重试。";
  if (error.code === "limit") return "当前 Agent 资源已达到限制，请稍后再试。";
  switch (error.detail) {
    case "AGENT_FILE_TOO_LARGE":
    case "REQUEST_TOO_LARGE":
      return `文件大小超过限制（单文件最大 ${Math.round(AGENT_UPLOAD_MAX_BYTES / (1024 * 1024))}MB）。`;
    case "AGENT_WORKSPACE_QUOTA_EXCEEDED":
      return "当前会话文件容量已达到限制。";
    case "AGENT_SESSION_NOT_FOUND":
      return "当前 Agent 会话已失效，请重新创建。";
    case "INVALID_CONTENT_TYPE":
    case "AGENT_ATTACHMENT_UNSUPPORTED":
      return "当前不支持这种文件类型。";
    case "AGENT_FILE_CONFLICT":
      return "已有同名文件，请修改文件名后重试。";
    case "AGENT_FILE_INVALID":
      return "文件名无效，请修改后重试。";
    case "AGENT_FILE_REQUIRED":
      return "未能读取所选文件，请重新选择后重试。";
    default:
      return "文件上传失败，请重试。";
  }
}

function nowId(role: string) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAgent() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try { return localStorage.getItem(LOCAL_ACTIVE_KEY); } catch { return null; }
  });
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState(false);
  const [recentChanges, setRecentChanges] = useState<WorkspaceChange[]>([]);
  const [workspaceActivity, setWorkspaceActivity] = useState<ToolActivity[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<AgentFile[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [runState, setRunState] = useState<AgentRunState>("idle");
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<Record<string, "uploading" | "ready" | "error">>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isAgentAvailable, setIsAgentAvailable] = useState<boolean | null>(null);
  const [agentReadiness, setAgentReadiness] = useState<AgentRuntimeReadiness | null>(null);
  const [loaded, setLoaded] = useState(false);

  const activeSessionIdRef = useRef<string | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const messagesRef = useRef<AgentMessage[]>([]);
  const generationRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const filesRevisionRef = useRef(0);
  const pendingAttachmentsRef = useRef<AgentFile[]>([]);
  const uploadsInFlightBySessionRef = useRef<Record<string, number>>({});
  const uploadSequenceRef = useRef(0);
  // Authoritative manifest snapshots per session, used to derive Recent
  // Changes from before/after file lists instead of guessing from chat text.
  const workspaceSnapshotRef = useRef<Map<string, Map<string, { updatedAt: number; name: string }>>>(new Map());
  const changesBySessionRef = useRef<Map<string, WorkspaceChange[]>>(new Map());
  const activityBySessionRef = useRef<Map<string, ToolActivity[]>>(new Map());

  useEffect(() => { activeSessionIdRef.current = activeSessionId; try { if (activeSessionId) localStorage.setItem(LOCAL_ACTIVE_KEY, activeSessionId); else localStorage.removeItem(LOCAL_ACTIVE_KEY); } catch {} }, [activeSessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const replacePendingAttachments = useCallback((next: AgentFile[] | ((current: AgentFile[]) => AgentFile[])) => {
    const resolved = typeof next === "function" ? next(pendingAttachmentsRef.current) : next;
    pendingAttachmentsRef.current = resolved;
    setPendingAttachments(resolved);
  }, []);

  const refreshSessions = useCallback(async () => {
    const sessionIdAtRequest = activeSessionIdRef.current;
    try {
      const list = await listAgentSessions();
      setSessions(list.sort((a, b) => (b.lastAccessAt ?? "").localeCompare(a.lastAccessAt ?? "")));
      // if active session no longer exists, clear
      if (sessionIdAtRequest && activeSessionIdRef.current === sessionIdAtRequest && !list.find((s) => s.sessionId === sessionIdAtRequest)) {
        sessionGenerationRef.current += 1;
        activeSessionIdRef.current = null;
        filesRevisionRef.current += 1;
        setActiveSessionId(null);
        setMessages([]);
        setFiles([]);
        replacePendingAttachments([]);
      } else if (!activeSessionIdRef.current && list.length > 0) {
        // do not auto-select, let user choose
      }
      setLoaded(true);
    } catch (e) {
      if ((e as AgentClientError).code === "auth") setSessions([]);
      setLoaded(true);
    }
  }, [replacePendingAttachments]);

  const recordWorkspaceChanges = useCallback((sessionId: string, entries: WorkspaceChange[]) => {
    if (entries.length === 0) return;
    const existing = changesBySessionRef.current.get(sessionId) ?? [];
    const next = [...entries, ...existing].slice(0, MAX_WORKSPACE_CHANGES);
    changesBySessionRef.current.set(sessionId, next);
    if (activeSessionIdRef.current === sessionId) setRecentChanges(next);
  }, []);

  const recordWorkspaceActivity = useCallback((sessionId: string, ev: { name: string; status: "started" | "completed" | "failed"; toolCallId?: string }) => {
    const existing = activityBySessionRef.current.get(sessionId) ?? [];
    let next: ToolActivity[];
    const timestamp = new Date().toISOString();
    if (ev.status === "started") {
      if (ev.toolCallId && existing.some((item) => item.id === ev.toolCallId)) return;
      next = [...existing, { id: ev.toolCallId ?? `${ev.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: ev.name, status: "started", timestamp }];
    } else if (ev.toolCallId) {
      const index = existing.findIndex((item) => item.id === ev.toolCallId);
      next = index === -1
        ? [...existing, { id: ev.toolCallId, name: ev.name, status: ev.status, timestamp }]
        : existing.map((item) => (item.id === ev.toolCallId ? { ...item, status: ev.status } : item));
    } else {
      // No toolCallId in the event: pair by tool name, matching the first
      // still-running call so completion does not duplicate the entry.
      const index = existing.findIndex((item) => item.name === ev.name && item.status === "started");
      next = index === -1
        ? [...existing, { id: `${ev.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: ev.name, status: ev.status, timestamp }]
        : existing.map((item, i) => (i === index ? { ...item, status: ev.status } : item));
    }
    next = next.slice(-MAX_WORKSPACE_ACTIVITY);
    activityBySessionRef.current.set(sessionId, next);
    if (activeSessionIdRef.current === sessionId) setWorkspaceActivity(next);
  }, []);

  const refreshFiles = useCallback(async (sessionId: string) => {
    const sessionGeneration = sessionGenerationRef.current;
    const filesRevision = filesRevisionRef.current;
    if (activeSessionIdRef.current === sessionId) {
      setFilesLoading(true);
      setFilesError(false);
    }
    try {
      const list = await listAgentFiles(sessionId);
      if (
        activeSessionIdRef.current === sessionId &&
        sessionGenerationRef.current === sessionGeneration &&
        filesRevisionRef.current === filesRevision
      ) {
        setFiles(list);
        setFilesLoading(false);
      }
      // Diff against the previous authoritative manifest snapshot. The first
      // snapshot of a session only seeds state, so resuming a history session
      // does not replay its whole past as fresh changes.
      const previous = workspaceSnapshotRef.current.get(sessionId);
      const nextSnapshot = new Map(list.map((file) => [file.fileId, { updatedAt: file.updatedAt ?? 0, name: file.originalName }]));
      workspaceSnapshotRef.current.set(sessionId, nextSnapshot);
      if (previous) {
        const entries: WorkspaceChange[] = [];
        for (const file of list) {
          const seen = previous.get(file.fileId);
          if (!seen) entries.push({ id: `${file.fileId}-${file.updatedAt ?? 0}-created`, fileId: file.fileId, name: file.originalName, type: "created", at: Date.now() });
          else if (seen.updatedAt !== (file.updatedAt ?? 0)) entries.push({ id: `${file.fileId}-${file.updatedAt ?? 0}-modified`, fileId: file.fileId, name: file.originalName, type: "modified", at: Date.now() });
        }
        for (const [fileId, seen] of previous) {
          if (!nextSnapshot.has(fileId)) entries.push({ id: `${fileId}-deleted-${Date.now()}`, fileId, name: seen.name, type: "deleted", at: Date.now() });
        }
        recordWorkspaceChanges(sessionId, entries);
      }
    } catch {
      if (activeSessionIdRef.current === sessionId && sessionGenerationRef.current === sessionGeneration) {
        setFiles([]);
        setFilesLoading(false);
        setFilesError(true);
      }
    }
  }, [recordWorkspaceChanges]);

  const checkAvailability = useCallback(async () => {
    const status = await getAgentStatus();
    setIsAgentAvailable(status.agent);
    setAgentReadiness(status.readiness ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- check availability is external
    void checkAvailability();
  }, [checkAvailability]);

  useEffect(() => {
    if (isAgentAvailable || agentReadiness?.configured !== true || agentReadiness.state === "failed") return;
    const timer = window.setInterval(() => { void checkAvailability(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [agentReadiness, checkAvailability, isAgentAvailable]);

  useEffect(() => {
    if (isAgentAvailable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessions are external BFF state
      void refreshSessions();
    } else if (isAgentAvailable === false) {
      setLoaded(true);
    }
  }, [isAgentAvailable, refreshSessions]);

  useEffect(() => {
    if (isAgentAvailable && activeSessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- files owned by session
      void refreshFiles(activeSessionId);
    } else {
      setFiles([]);
    }
  }, [isAgentAvailable, activeSessionId, refreshFiles]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (activeSessionIdRef.current) return activeSessionIdRef.current;
    const created = await createAgentSession();
    const sid = created.sessionId;
    setSessions((prev) => [{ sessionId: sid, createdAt: new Date().toISOString(), lastAccessAt: new Date().toISOString() }, ...prev]);
    activeSessionIdRef.current = sid;
    sessionGenerationRef.current += 1;
    setActiveSessionId(sid);
    // title will be derived from first message locally
    return sid;
  }, []);

  const selectSession = useCallback((id: string) => {
    if (id === activeSessionIdRef.current) return;
    runAbortRef.current?.abort();
    generationRef.current += 1;
    sessionGenerationRef.current += 1;
    activeSessionIdRef.current = id;
    filesRevisionRef.current += 1;
    setActiveSessionId(id);
    setMessages([]);
    // Stale-state guard: never let the previous session's files flash as the
    // authoritative list of the newly selected session.
    setFiles([]);
    replacePendingAttachments([]);
    setToolActivity([]);
    setRecentChanges(changesBySessionRef.current.get(id) ?? []);
    setWorkspaceActivity(activityBySessionRef.current.get(id) ?? []);
    setError(null);
    setRunState("idle");
    setUploadState({});
    void refreshFiles(id);
  }, [refreshFiles, replacePendingAttachments]);

  const startNewSession = useCallback(() => {
    runAbortRef.current?.abort();
    generationRef.current += 1;
    sessionGenerationRef.current += 1;
    activeSessionIdRef.current = null;
    filesRevisionRef.current += 1;
    setActiveSessionId(null);
    setMessages([]);
    setFiles([]);
    replacePendingAttachments([]);
    setToolActivity([]);
    setRecentChanges([]);
    setWorkspaceActivity([]);
    setError(null);
    setRunState("idle");
    setUploadState({});
  }, [replacePendingAttachments]);

  const deleteSession = useCallback(async (id: string) => {
    await deleteAgentSession(id);
    setSessions((prev) => prev.filter((s) => s.sessionId !== id));
    workspaceSnapshotRef.current.delete(id);
    changesBySessionRef.current.delete(id);
    activityBySessionRef.current.delete(id);
    if (activeSessionIdRef.current === id) {
      generationRef.current += 1;
      sessionGenerationRef.current += 1;
      activeSessionIdRef.current = null;
      filesRevisionRef.current += 1;
      setActiveSessionId(null);
      setMessages([]);
      setFiles([]);
      replacePendingAttachments([]);
      setRunState("idle");
      setToolActivity([]);
      setRecentChanges([]);
      setWorkspaceActivity([]);
      setUploadState({});
    }
  }, [replacePendingAttachments]);

  const uploadFile = useCallback(async (file: File) => {
    const tempId = `upload-${++uploadSequenceRef.current}`;
    let sid: string | null = null;
    let sessionGeneration = sessionGenerationRef.current;
    let uploadReserved = false;
    // Fail fast client-side: oversized files must never start a doomed
    // transfer over a slow link; the server stays authoritative.
    if (file.size > AGENT_UPLOAD_MAX_BYTES) {
      const err = new AgentClientError("invalid", 413, "AGENT_FILE_TOO_LARGE");
      setError(uploadErrorMessage(err));
      throw err;
    }
    try {
      sid = await ensureSession();
      sessionGeneration = sessionGenerationRef.current;
      const inFlight = uploadsInFlightBySessionRef.current[sid] ?? 0;
      if (pendingAttachmentsRef.current.length + inFlight >= MAX_ATTACHMENTS) {
        setError(`最多只能附加 ${MAX_ATTACHMENTS} 个文件`);
        throw new AgentClientError("limit", 400, "AGENT_ATTACHMENT_LIMIT");
      }
      uploadsInFlightBySessionRef.current[sid] = inFlight + 1;
      uploadReserved = true;
      if (activeSessionIdRef.current === sid) {
        setUploadState((prev) => ({ ...prev, [tempId]: "uploading" }));
        setError(null);
      }
      const uploaded = await uploadAgentFile(sid, file, (percent) => {
        if (activeSessionIdRef.current !== sid || sessionGenerationRef.current !== sessionGeneration) return;
        setUploadProgress((prev) => {
          const current = prev[tempId] ?? -1;
          // Skip non-advancing noise: progress events can fire very
          // often on fast links and must not stall the upload loop.
          if (percent <= current) return prev;
          return { ...prev, [tempId]: percent };
        });
      });
      if (activeSessionIdRef.current === sid && sessionGenerationRef.current === sessionGeneration) {
        filesRevisionRef.current += 1;
        setFiles((prev) => prev.some((item) => item.fileId === uploaded.fileId) ? prev : [...prev, uploaded]);
        // Seed the snapshot for user uploads so they are not replayed as
        // agent-created changes on the next authoritative refresh.
        const snapshot = workspaceSnapshotRef.current.get(sid) ?? new Map();
        snapshot.set(uploaded.fileId, { updatedAt: uploaded.updatedAt ?? 0, name: uploaded.originalName });
        workspaceSnapshotRef.current.set(sid, snapshot);
        replacePendingAttachments((prev) => {
          if (prev.length >= MAX_ATTACHMENTS || prev.some((item) => item.fileId === uploaded.fileId)) return prev;
          return [...prev, uploaded];
        });
        setUploadState((prev) => ({ ...prev, [tempId]: "ready" }));
      }
      return uploaded;
    } catch (e) {
      if (sid && activeSessionIdRef.current === sid && sessionGenerationRef.current === sessionGeneration) {
        setUploadState((prev) => ({ ...prev, [tempId]: "error" }));
      }
      const err = e as AgentClientError;
      if (!sid || (activeSessionIdRef.current === sid && sessionGenerationRef.current === sessionGeneration)) {
        setError(uploadErrorMessage(err));
      }
      throw e;
    } finally {
      if (sid && uploadReserved) {
        uploadsInFlightBySessionRef.current[sid] = Math.max(0, (uploadsInFlightBySessionRef.current[sid] ?? 1) - 1);
      }
      setUploadProgress((prev) => {
        if (!(tempId in prev)) return prev;
        const next = { ...prev };
        delete next[tempId];
        return next;
      });
      if (sid && activeSessionIdRef.current === sid && sessionGenerationRef.current === sessionGeneration) {
        setTimeout(() => {
          if (activeSessionIdRef.current !== sid || sessionGenerationRef.current !== sessionGeneration) return;
          setUploadState((prev) => {
            const next = { ...prev };
            delete next[tempId];
            return next;
          });
        }, 3000);
      }
    }
  }, [ensureSession, replacePendingAttachments]);

  const removePending = useCallback((fileId: string) => {
    replacePendingAttachments((prev) => prev.filter((file) => file.fileId !== fileId));
  }, [replacePendingAttachments]);

  const attachExisting = useCallback((file: AgentFile) => {
    replacePendingAttachments((prev) => {
      if (prev.find((p) => p.fileId === file.fileId)) return prev;
      const uploadsInFlight = activeSessionIdRef.current ? (uploadsInFlightBySessionRef.current[activeSessionIdRef.current] ?? 0) : 0;
      if (prev.length + uploadsInFlight >= MAX_ATTACHMENTS) {
        setError(`最多只能附加 ${MAX_ATTACHMENTS} 个文件`);
        return prev;
      }
      return [...prev, file];
    });
  }, [replacePendingAttachments]);

  const deleteFile = useCallback(async (fileId: string) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    await deleteAgentFile(sid, fileId);
    if (activeSessionIdRef.current !== sid) return;
    filesRevisionRef.current += 1;
    setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
    // User-initiated deletion is applied to the snapshot directly; Recent
    // Changes only reports agent-driven manifest mutations.
    workspaceSnapshotRef.current.get(sid)?.delete(fileId);
    replacePendingAttachments((prev) => prev.filter((file) => file.fileId !== fileId));
  }, [replacePendingAttachments]);

  const sendMessage = useCallback(async (content: string) => {
    const attachmentsSnapshot = pendingAttachmentsRef.current;
    if (!content.trim() && attachmentsSnapshot.length === 0) return;
    if (runState === "streaming" || runState === "starting") return;
    const sid = await ensureSession();
    const attachments = attachmentsSnapshot.map((file) => file.fileId);
    const userMsg: AgentMessage = { id: nowId("user"), role: "user", content: content.trim(), attachments: [...attachmentsSnapshot] };
    const assistantMsg: AgentMessage = { id: nowId("assistant"), role: "assistant", content: "" };
    const nextMessages = [...messagesRef.current, userMsg, assistantMsg];
    setMessages(nextMessages);
    replacePendingAttachments([]);
    setToolActivity([]);
    setError(null);
    setRunState("starting");
    const controller = new AbortController();
    runAbortRef.current = controller;
    const gen = ++generationRef.current;
    let assistantContent = "";

    try {
      await streamAgentRun(sid, content.trim(), attachments, {
        signal: controller.signal,
        onDelta: (text) => {
          if (generationRef.current !== gen) return;
          assistantContent += text;
          setMessages((cur) => cur.map((m) => m.id === assistantMsg.id ? { ...m, content: assistantContent } : m));
          setRunState("streaming");
        },
        onTool: (ev) => {
          if (generationRef.current !== gen) return;
          const name = ev.name ?? "workspace.open";
          // Never display raw args/output, only safe name/status
          setToolActivity((prev) => {
            const existing = prev.find((t) => t.name === name && t.status === "started");
            if (ev.status === "started" && !existing) return [...prev, { id: `${name}-${Date.now()}`, name, status: "started", timestamp: new Date().toISOString() }];
            if (ev.status === "completed" || ev.status === "failed") {
              return prev.map((t) => t.name === name && t.status === "started" ? { ...t, status: ev.status as "completed" | "failed" } : t);
            }
            return prev;
          });
          // Session-scoped activity for the Workspace panel, keyed by the real
          // toolCallId so parallel calls of the same tool stay distinct.
          const activityStatus: "started" | "completed" | "failed" = ev.status === "completed" ? "completed" : ev.status === "failed" ? "failed" : "started";
          recordWorkspaceActivity(sid, { name, status: activityStatus, toolCallId: ev.toolCallId });
        },
        onDone: (terminal) => {
          if (generationRef.current !== gen) return;
          if (terminal === "run.completed") setRunState("completed");
          else if (terminal === "run.cancelled") setRunState("cancelled");
          else setRunState("failed");
        },
        onError: (msg) => {
          if (generationRef.current !== gen) return;
          setError(msg);
        },
      }).then((res) => { currentRunIdRef.current = res.runId; });
      // Wait for stream to complete, runState already set via onDone
      if (generationRef.current === gen && activeSessionIdRef.current === sid) {
        setRunState((prev) => (prev === "streaming" || prev === "starting" ? "completed" : prev));
      }
    } catch (e) {
      if (generationRef.current !== gen || activeSessionIdRef.current !== sid) return;
      const err = e as AgentClientError;
      if (err.code === "aborted") {
        setRunState("cancelled");
      } else {
        if (err.code === "not_found") setError("会话已过期，请新建对话。");
        else if (err.code === "limit") setError("当前 Agent 资源已达到限制，请稍后再试。");
        else if (err.code === "invalid") setError("请求无效，请检查附件。");
        else setError(err.detail || "Agent 运行失败，请重试。");
        setRunState("failed");
        // if session expired, refresh list
        if (err.code === "not_found") void refreshSessions();
      }
    } finally {
      if (generationRef.current === gen && activeSessionIdRef.current === sid) {
        runAbortRef.current = null;
        currentRunIdRef.current = null;
        setTimeout(() => {
          if (generationRef.current === gen && activeSessionIdRef.current === sid) setRunState("idle");
        }, 1500);
        // refresh files list as session lastAccess updated
        void refreshFiles(sid);
        void refreshSessions();
      }
    }
  }, [runState, ensureSession, refreshFiles, refreshSessions, replacePendingAttachments, recordWorkspaceActivity]);

  const cancelRun = useCallback(async () => {
    if (runState !== "streaming" && runState !== "starting") return;
    setRunState("cancelling");
    runAbortRef.current?.abort();
    const sid = activeSessionIdRef.current;
    const runId = currentRunIdRef.current;
    if (sid && runId) {
      try { await cancelAgentRun(sid, runId); } catch {}
    }
    // BFF will propagate disconnect → real cancel; we set UI to cancelled
    setRunState("cancelled");
    const generation = generationRef.current;
    setTimeout(() => {
      if (generationRef.current === generation && activeSessionIdRef.current === sid) setRunState("idle");
    }, 1000);
  }, [runState]);

  // Handle browser disconnect / switch: abort on unmount or session switch is already via runAbortRef

  return {
    sessions,
    activeSessionId,
    files,
    filesLoading,
    filesError,
    recentChanges,
    workspaceActivity,
    pendingAttachments,
    messages,
    runState,
    toolActivity,
    error,
    uploadState,
    uploadProgress,
    isAgentAvailable,
    agentReadiness,
    loaded,
    selectSession,
    startNewSession,
    deleteSession,
    uploadFile,
    removePending,
    attachExisting,
    deleteFile,
    sendMessage,
    cancelRun,
    refreshSessions,
    refreshFiles,
    ensureSession,
    setError,
  };
}
