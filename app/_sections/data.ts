export type Project = {
  index: string;
  title: string;
  summary: string;
  tags: string[];
  status: string;
  href: string;
};

export const projects: Project[] = [
  {
    index: "01",
    title: "Intent2Prompt",
    summary:
      "把模糊想法转译为清晰、可执行的结构化提示词，让 AI 协作从表达意图开始。",
    tags: ["PROMPT ENGINEERING", "LLM", "AI TOOL"],
    status: "GitHub Repo",
    href: "https://github.com/PtPPPPP/intent2prompt",
  },
  {
    index: "02",
    title: "低空无人机哨兵",
    summary:
      "面向低空场景的无人机智能感知与安全监测项目，探索从识别到预警的完整链路。",
    tags: ["DRONE", "COMPUTER VISION", "LOW ALTITUDE"],
    status: "GitHub Repo",
    href: "https://github.com/PtPPPPP/low-altitude-drone-sentinel",
  },
  {
    index: "03",
    title: "具身智能训练平台",
    summary:
      "围绕机器人学习与仿真训练，搭建可实验、可复现、可持续扩展的具身智能平台。",
    tags: ["EMBODIED AI", "ROBOTICS", "SIMULATION"],
    status: "GitHub Repo",
    href: "https://github.com/PtPPPPP/embodied-training-platform",
  },
];

export type Activity = {
  code: string;
  title: string;
  detail: string;
};

export const activities: Activity[] = [
  {
    code: "LEARN / 01",
    title: "技术小课",
    detail: "成员轮流分享 AI、机器人与工程工具，20 分钟讲清一个可复用方法。",
  },
  {
    code: "BUILD / 02",
    title: "项目冲刺",
    detail: "以 2–4 周为周期组队交付，从需求、Demo 到复盘，留下公开作品。",
  },
  {
    code: "CONNECT / 03",
    title: "开放交流",
    detail: "邀请老师、学长与行业伙伴交流，让学习路径连接比赛、科研与职业方向。",
  },
];
