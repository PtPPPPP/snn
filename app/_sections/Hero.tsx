import { ArrowRight, ArrowDownRight, PlusIcon } from "./icons";

const stats = [
  { value: "12", unit: "", label: "DEMOS", note: "累计 Demo" },
  { value: "06", unit: "", label: "AXIS", note: "轴臂协作" },
  { value: "03", unit: "", label: "AWARDS", note: "比赛获奖" },
];

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="coordinate coordinate-top">X:064 / Y:108</div>
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

      <div className="hero-visual" aria-label="工业机器人机械臂与工程标注">
        <div className="blueprint blueprint-a" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="blueprint-label" aria-hidden="true">
          MODEL: SNN_ARM_V2
          <br />
          AXIS: 06
          <br />
          STATUS: ACTIVE
        </div>
        <div className="measure measure-x" aria-hidden="true">
          1024.36
        </div>
        <div className="measure measure-y" aria-hidden="true">
          248.72
        </div>
        <img
          className="robot-arm"
          src="/assets/snn-robot-arm.png"
          alt="银色工业机器人机械臂"
          width={1586}
          height={992}
        />
        <div className="hero-stats" aria-label="社团成绩数据">
          {stats.map((stat) => (
            <div className="hero-stat" key={stat.label}>
              <span className="hero-stat-value">{stat.value}</span>
              <span className="hero-stat-meta">
                <span className="hero-stat-label">{stat.label}</span>
                <span className="hero-stat-note">{stat.note}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="code-note" aria-hidden="true">
          <span>def forward_kinematics(q):</span>
          <span>&nbsp;&nbsp;T = eye(4)</span>
          <span>&nbsp;&nbsp;return T</span>
        </div>
      </div>

      <div className="hero-proof" aria-label="社团特点">
        <span className="system-ok">
          <PlusIcon className="hero-proof-plus" />
          SYS_OK
        </span>
        <span>PROJECT-DRIVEN</span>
        <span>OPEN TO BEGINNERS</span>
        <span>BUILD IN PUBLIC</span>
      </div>
    </section>
  );
}
