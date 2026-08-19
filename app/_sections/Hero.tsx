import { ArrowRight, ArrowDownRight } from "./icons";

export function Hero() {
  return (
    <section className="hero" id="top">
      <span className="corner-mark corner-tl" aria-hidden="true" />
      <span className="corner-mark corner-br" aria-hidden="true" />

      <div className="hero-copy">
        <p className="eyebrow">AI × ROBOTICS × MAKERS</p>
        <h1>把想法，训练成现实。</h1>
        <p className="hero-intro">
          面向人工智能与机器人方向的学生科技社团。一起学习、动手、参赛，把第一行代码做成真正能跑的项目。
        </p>

        <div className="hero-actions">
          <a className="button button-ghost" href="#projects">
            探索项目 <ArrowRight className="button-icon" />
          </a>
          <a className="button button-primary" href="#join">
            加入 SNN <ArrowDownRight className="button-icon" />
          </a>
        </div>
        <p className="hero-microcopy">无论你写过几行代码，都能在这里开始。</p>
      </div>

      <div className="hero-visual" aria-label="工业机器人机械臂主视觉">
        <div className="blueprint blueprint-a" aria-hidden="true">
          <span />
          <span />
        </div>
        <img
          className="robot-arm"
          src="/assets/snn-robot-arm.png"
          alt="银色工业机器人机械臂"
          width={1586}
          height={992}
        />
      </div>

      <div className="hero-proof" aria-label="社团特点">
        <span>PROJECT-DRIVEN</span>
        <span>OPEN TO BEGINNERS</span>
        <span>BUILD IN PUBLIC</span>
      </div>
    </section>
  );
}
