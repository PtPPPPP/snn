import Link from "next/link";
import { LearningLabSection } from "./LearningLabSection";

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="home-eyebrow"><span aria-hidden="true" /> SNN / 学生科技社团</p>
        <h1>一起学习，<br /><span>一起把想法做出来。</span></h1>
        <p className="home-intro">从一个问题，到一个能运行的作品。<br />和同学一起探索 AI、机器人与智能系统。</p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/ai/">试试 SNN AI <span aria-hidden="true">↗</span></Link>
          <a className="button button-ghost" href="#join">加入我们 <span aria-hidden="true">↓</span></a>
        </div>
      </div>
      <LearningLabSection />
      <div className="hero-caption"><span>学生共建 · 欢迎新同学</span><span>AI / 机器人 / 项目实践</span></div>
    </section>
  );
}
