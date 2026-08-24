"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentClientError,
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

const MAX_ATTACHMENTS = 8;
const LOCAL_ACTIVE_KEY = "snn-agent-active-session";

function nowId(role: string) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAgent() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try { return localStorage.getItem(LOCAL_ACTIVE_KEY); } catch { return null; }
  });
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<AgentFile[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [runState, setRunState] = useState<AgentRunState>("idle");
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<Record<string, "uploading" | "ready" | "error">>({});
  const [isAgentAvailable, setIsAgentAvailable] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);

  const activeSessionIdRef = useRef<string | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const messagesRef = useRef<AgentMessage[]>([]);
  const generationRef = useRef(0);

  useEffect(() => { activeSessionIdRef.current = activeSessionId; try { if (activeSessionId) localStorage.setItem(LOCAL_ACTIVE_KEY, activeSessionId); else localStorage.removeItem(LOCAL_ACTIVE_KEY); } catch {} }, [activeSessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listAgentSessions();
      setSessions(list.sort((a, b) => (b.lastAccessAt ?? "").localeCompare(a.lastAccessAt ?? "")));
      // if active session no longer exists, clear
      if (activeSessionIdRef.current && !list.find((s) => s.sessionId === activeSessionIdRef.current)) {
        setActiveSessionId(null);
        setMessages([]);
        setFiles([]);
        setPendingAttachments([]);
      } else if (!activeSessionIdRef.current && list.length > 0) {
        // do not auto-select, let user choose
      }
      setLoaded(true);
    } catch (e) {
      if ((e as AgentClientError).code === "auth") setSessions([]);
      setLoaded(true);
    }
  }, []);

  const refreshFiles = useCallback(async (sessionId: string) => {
    try {
      const list = await listAgentFiles(sessionId);
      setFiles(list);
    } catch {
      setFiles([]);
    }
  }, []);

  const checkAvailability = useCallback(async () => {
    const status = await getAgentStatus();
    setIsAgentAvailable(status.agent);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- check availability is external
    void checkAvailability();
  }, [checkAvailability]);

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
    setActiveSessionId(sid);
    // title will be derived from first message locally
    return sid;
  }, []);

  const selectSession = useCallback((id: string) => {
    if (id === activeSessionIdRef.current) return;
    runAbortRef.current?.abort();
    setActiveSessionId(id);
    setMessages([]);
    setPendingAttachments([]);
    setToolActivity([]);
    setError(null);
    setRunState("idle");
    void refreshFiles(id);
  }, [refreshFiles]);

  const startNewSession = useCallback(() => {
    runAbortRef.current?.abort();
    setActiveSessionId(null);
    setMessages([]);
    setFiles([]);
    setPendingAttachments([]);
    setToolActivity([]);
    setError(null);
    setRunState("idle");
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await deleteAgentSession(id);
    setSessions((prev) => prev.filter((s) => s.sessionId !== id));
    if (activeSessionIdRef.current === id) {
      setActiveSessionId(null);
      setMessages([]);
      setFiles([]);
      setPendingAttachments([]);
      setRunState("idle");
      setToolActivity([]);
    }
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const sid = await ensureSession();
    const tempId = `upload-${file.name}-${Date.now()}`;
    setUploadState((prev) => ({ ...prev, [tempId]: "uploading" }));
    setError(null);
    try {
      if (pendingAttachments.length >= MAX_ATTACHMENTS) throw new AgentClientError("invalid", 400, "Too many attachments");
      const uploaded = await uploadAgentFile(sid, file);
      setFiles((prev) => [...prev, uploaded]);
      setPendingAttachments((prev) => {
        if (prev.length >= MAX_ATTACHMENTS) return prev;
        // avoid duplicate fileId
        if (prev.find((p) => p.fileId === uploaded.fileId)) return prev;
        return [...prev, uploaded];
      });
      setUploadState((prev) => ({ ...prev, [tempId]: "ready" }));
      return uploaded;
    } catch (e) {
      setUploadState((prev) => ({ ...prev, [tempId]: "error" }));
      const err = e as AgentClientError;
      if (err.code === "limit") setError("当前 Agent 资源已达到限制，请稍后再试。");
      else if (err.code === "invalid" && err.detail?.includes("too large")) setError("文件过大，请选择更小的文件。");
      else if (err.code === "invalid") setError("文件不支持或名称无效。");
      else setError(err.detail || "上传失败，请重试。");
      throw e;
    } finally {
      setTimeout(() => setUploadState((prev) => { const n = { ...prev }; delete n[tempId]; return n; }), 3000);
    }
  }, [ensureSession, pendingAttachments.length]);

  const removePending = useCallback((fileId: string) => {
    setPendingAttachments((prev) => prev.filter((f) => f.fileId !== fileId));
  }, []);

  const attachExisting = useCallback((file: AgentFile) => {
    setPendingAttachments((prev) => {
      if (prev.find((p) => p.fileId === file.fileId)) return prev;
      if (prev.length >= MAX_ATTACHMENTS) {
        setError(`最多只能附加 ${MAX_ATTACHMENTS} 个文件`);
        return prev;
      }
      return [...prev, file];
    });
  }, []);

  const deleteFile = useCallback(async (fileId: string) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    await deleteAgentFile(sid, fileId);
    setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
    setPendingAttachments((prev) => prev.filter((f) => f.fileId !== fileId));
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() && pendingAttachments.length === 0) return;
    if (runState === "streaming" || runState === "starting") return;
    const sid = await ensureSession();
    const attachments = pendingAttachments.map((f) => f.fileId);
    const userMsg: AgentMessage = { id: nowId("user"), role: "user", content: content.trim(), attachments: [...pendingAttachments] };
    const assistantMsg: AgentMessage = { id: nowId("assistant"), role: "assistant", content: "" };
    const nextMessages = [...messagesRef.current, userMsg, assistantMsg];
    setMessages(nextMessages);
    setPendingAttachments([]);
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
      setRunState((prev) => (prev === "streaming" || prev === "starting" ? "completed" : prev));
    } catch (e) {
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
      if (generationRef.current === gen) {
        runAbortRef.current = null;
        currentRunIdRef.current = null;
        setTimeout(() => setRunState("idle"), 1500);
        // refresh files list as session lastAccess updated
        void refreshFiles(sid);
        void refreshSessions();
      }
    }
  }, [pendingAttachments, runState, ensureSession, refreshFiles, refreshSessions]);

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
    setTimeout(() => setRunState("idle"), 1000);
  }, [runState]);

  // Handle browser disconnect / switch: abort on unmount or session switch is already via runAbortRef

  return {
    sessions,
    activeSessionId,
    files,
    pendingAttachments,
    messages,
    runState,
    toolActivity,
    error,
    uploadState,
    isAgentAvailable,
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
