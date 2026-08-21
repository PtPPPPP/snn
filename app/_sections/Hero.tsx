import { SnnHeroArt } from "./SnnHeroArt";

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-visual" aria-label="SNN 神经网络主视觉"><SnnHeroArt className="hero-art" /></div>
      <div className="hero-fade" aria-hidden="true" />
      <div className="hero-bottom">
        <div className="hero-copy">
          <p className="eyebrow"><span aria-hidden="true">●</span> 智能神经网络</p>
          <h1>与 AI 共创，<br />构建下一步。</h1>
          <div className="hero-actions">
            <a className="button button-primary" href="#projects">探索项目</a>
            <a className="button button-ghost" href="/ai/">进入 SNN AI</a>
          </div>
        </div>
        <div className="hero-tags" aria-label="SNN 方向"><span>智能体</span><span>项目</span><span>具身智能</span></div>
      </div>
    </section>
  );
}
