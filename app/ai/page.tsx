import type { Metadata } from "next";
import AiChat from "./ai-chat";

export const metadata: Metadata = {
  title: "SNN AI｜Smart Neural Network",
  description: "SNN AI，面向 SNN 项目学习、开发与协作的 AI 工作台。",
};

export default function AiPage() {
  return <AiChat />;
}
