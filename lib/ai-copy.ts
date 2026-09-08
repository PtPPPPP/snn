// AI 聊天界面共享文案。
// 供 React 版(app/ai/ai-chat.tsx)与测试复用，避免多处不同步。

export const STATUS_LABELS = {
  checking: "Checking AI Node...",
  online: "SNN AI · Online",
  offline: "SNN AI · Offline",
} as const;

export const STATUS_DETAILS = {
  checking: "正在连接服务",
  ready: "可以开始对话",
  offline: "服务暂未连接，历史对话仍可查看",
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
    "理清一个想法，理解一段代码，或探索下一次实验。把问题带进来，一起找到下一步。",
} as const;

export const SIDEBAR = {
  sectionCode: "PERSONAL WORKSPACE",
  title: "SNN AI",
  description: "和同学一起思考、探索、构建。",
} as const;

export const THINKING_MODE = {
  label: "深度思考",
  enabled: "深度思考已开启",
  thinking: "思考中…",
  stopped: "思考已停止。",
} as const;
