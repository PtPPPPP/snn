import type { Metadata } from "next";
import AiChat from "./ai-chat";

export const metadata: Metadata = {
  title: "SNN AI｜Smart Neural Network",
  description: "SNN AI Chat 界面测试版本。",
};

export default function AiPage() {
  return <AiChat />;
}
