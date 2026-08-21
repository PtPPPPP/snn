import { SnnHeroArt } from "./SnnHeroArt";

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-visual" aria-label="SNN hero visual"><SnnHeroArt className="hero-art" /></div>
      <div className="hero-fade" aria-hidden="true" />
      <div className="hero-bottom">
        <div className="hero-copy">
          <p className="eyebrow"><span aria-hidden="true">●</span> Smart Neural Network</p>
          <h1>Build with AI.<br />Create What&apos;s Next.</h1>
          <div className="hero-actions">
            <a className="button button-primary" href="#projects">Explore Projects</a>
            <a className="button button-ghost" href="/ai/">Open SNN AI</a>
          </div>
        </div>
        <div className="hero-tags" aria-label="SNN focus"><span>Agents</span><span>Projects</span><span>Embodied AI</span></div>
      </div>
    </section>
  );
}
