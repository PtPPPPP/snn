import Link from "next/link";
import ChatMessage from "../ai/chat-message";
import chat from "../ai/ai-chat.module.css";
import { BRAND_LOGO } from "../../lib/site";

/** Editorial example, rendered with the real message styles; never a live response. */
export function ProductPreview() {
  return (
    <figure className="product-preview" aria-label="SNN AI 对话界面示例">
      <figcaption className="preview-top"><span>SNN AI <i>/</i> 项目工作台</span><span className="preview-badge">界面示例</span></figcaption>
      <div className="preview-body">
        <aside className="preview-sidebar">
          <div className="preview-brand"><img src={BRAND_LOGO.src} width="28" height="28" alt="" /><span>SNN AI</span></div>
          <span className="preview-new">＋ 新建对话</span>
          <small>最近对话</small>
          <span className="preview-selected">理解火箭回收策略</span>
          <span>梳理项目思路</span>
          <span>从想法到第一个 Demo</span>
          <div className="preview-sidebar-foot">YOUR IDEAS. YOUR WORKSPACE.</div>
        </aside>
        <div className="preview-conversation">
          <div className="preview-context"><span>理解火箭回收策略</span><span>CHAT</span></div>
          <div className="preview-messages">
            <ChatMessage message={{ id: "preview-question", role: "user", content: "火箭怎样学会平稳着陆？" }} />
            <ChatMessage message={{ id: "preview-answer", role: "assistant", content: "先观察，再决策。\n网络接收高度、速度和燃料，输出下一步油门。每次飞行的反馈，让它重新调整决策。", thinkingSeconds: 2.4 }} />
            <div className="preview-flow"><span><small>01 / OBSERVE</small>读取状态</span><span><small>02 / DECIDE</small>调整油门</span><span><small>03 / LEARN</small>更新权重</span></div>
          </div>
          <Link href="/ai/" className={`${chat.composer} preview-composer`} aria-label="打开 SNN AI 开始对话">
            <span>带着你的问题，继续探索…</span>
            <div><span>◇ 深度思考</span><span className="preview-send" aria-hidden="true">↑</span></div>
          </Link>
        </div>
      </div>
    </figure>
  );
}
