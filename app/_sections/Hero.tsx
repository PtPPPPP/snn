import Link from "next/link";
import { LearningLabSection } from "./LearningLabSection";

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="home-eyebrow"><span aria-hidden="true" /> SMART NEURAL NETWORK</p>
        <h1>Build intelligence.<br /><span>Make it real.</span></h1>
        <p className="home-intro">从一个问题，到一个能运行的系统。<br />与 SNN 一起探索 AI、智能体与机器人。</p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/ai/">进入 SNN AI <span aria-hidden="true">↗</span></Link>
          <a className="button button-ghost" href="#projects">探索项目 <span aria-hidden="true">↓</span></a>
        </div>
      </div>
      <LearningLabSection />
      <div className="hero-caption"><span>STUDENT-BUILT. OPEN TO BUILDERS.</span><span>AI / AGENTS / ROBOTICS</span></div>
    </section>
  );
}
