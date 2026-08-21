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
      "Translates vague intent into clear, executable structured prompts — starting AI collaboration from expression.",
    tags: ["PROMPT ENGINEERING", "LLM", "AI TOOL"],
    status: "GitHub Repo",
    href: "https://github.com/PtPPPPP/intent2prompt",
  },
  {
    index: "02",
    title: "Low-Altitude Sentinel",
    summary:
      "Intelligent sensing and safety monitoring for low-altitude scenarios — from perception to early warning, end-to-end.",
    tags: ["DRONE", "COMPUTER VISION", "LOW ALTITUDE"],
    status: "GitHub Repo",
    href: "https://github.com/PtPPPPP/low-altitude-drone-sentinel",
  },
  {
    index: "03",
    title: "Embodied Training Platform",
    summary:
      "A reproducible, extensible platform for robot learning and simulation — built to experiment, repeat, and scale.",
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
    title: "Micro-Lessons",
    detail: "Members share AI, robotics, and tooling — 20 minutes to teach one reusable method.",
  },
  {
    code: "BUILD / 02",
    title: "Build Sprints",
    detail: "Teams deliver in 2–4 week cycles: from requirements to demo to review, leaving public artifacts.",
  },
  {
    code: "CONNECT / 03",
    title: "Open Exchange",
    detail: "Invite faculty, seniors, and industry partners to link learning to competition, research, and career.",
  },
];
