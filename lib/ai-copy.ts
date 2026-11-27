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
  sectionCode: "CONVERSATIONS",
  title: "SNN AI",
  description: "和同学一起思考、探索、构建。",
} as const;

export const THINKING_MODE = {
  label: "深度思考",
  enabled: "深度思考已开启",
  thinking: "思考中…",
  stopped: "思考已停止。",
} as const;

export const CLUB_PRESETS = [
  {
    code: "CODE / DEBUG",
    title: "代码审查与故障排查",
    summary: "定位报错根因，给出最小修复方案与验证步骤",
    prompt: "帮我排查一段代码或架构问题（请在此粘贴代码或报错信息）：\n1. 先分析根本原因；\n2. 给出最小改动修复方案；\n3. 说明如何验证。",
    thinking: true,
  },
  {
    code: "RESEARCH / PAPER",
    title: "论文与算法精读",
    summary: "用直观几何或物理例子拆解核心公式与假设",
    prompt: "帮我拆解这篇论文或算法（请在此补充题目或核心段落）：\n1. 它解决的核心问题与物理/几何直觉；\n2. 关键公式与符号含义；\n3. 适用边界与局限。",
    thinking: true,
  },
  {
    code: "ROBOTICS / CONTROL",
    title: "机器人与控制实验",
    summary: "分析状态机、传感器数据流、奖励函数或控制回路",
    prompt: "围绕机器人 / 强化学习控制实验（如 ROS 2、无人机或火箭着陆），帮我分析以下状态与控制策略问题：",
    thinking: false,
  },
  {
    code: "CLUB / PROJECT",
    title: "社团项目立项共创",
    summary: "把初步想法梳理成 2–4 周可交付的最小可行 Demo",
    prompt: "我想在 SNN 发起一个 2–4 周的社团共创项目，初步想法是：",
    thinking: false,
  },
] as const;
