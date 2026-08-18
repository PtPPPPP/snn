// AI 聊天界面共享文案。
// 供 React 版(app/ai/ai-chat.tsx)、DOM 版(app/ai/ftp-chat.ts)、
// 以及静态导出模板(scripts/export-static.mjs)复用，避免三处不同步。

export const STATUS_LABELS = {
  checking: "Checking AI Node...",
  online: "SNN AI · Online",
  offline: "SNN AI · Offline",
} as const;

export const STATUS_DETAILS = {
  checking: "正在检查本地 AI 节点",
  ready: "AI 节点已就绪",
  offline: "本地模型尚未连接",
} as const;

export const NODE_STATES = {
  ready: "NODE READY",
  offline: "NODE OFFLINE",
} as const;

export const UNAVAILABLE_REPLY = "SNN AI 节点当前未连接，请稍后再试。";

export const EMPTY_STATE = {
  mark: "SNN / AI",
  title: "从一个问题开始。",
  description:
    "这里将连接 SNN 本地 AI 节点。节点离线时，页面会保留消息并提示服务暂不可用。",
} as const;

export const SIDEBAR = {
  sectionCode: "NODE / 01",
  title: "SNN AI",
  description: "由 SNN 本地 AI 节点提供推理服务。",
} as const;
