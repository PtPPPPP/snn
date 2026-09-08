import Link from "next/link";

const experiments = [
  { number: "01", title: "回收挑战", description: "亲手控制油门，挑战 AI 驾驶员。", href: "/play/rocket" },
  { number: "02", title: "怎样推理", description: "看高度与速度怎样变成下一步决策。", href: "/play/rocket/explain" },
  { number: "03", title: "怎样学习", description: "从一次反馈，理解网络权重的改变。", href: "/play/rocket/train" },
];

export function LearningLabSection() {
  return (
    <aside className="hero-lab" id="learning-lab" aria-labelledby="learning-lab-title">
      <div className="lab-header">
        <h2 id="learning-lab-title">学习实验室</h2>
        <span>从体验，到理解</span>
      </div>
      <div className="lab-visual">
          <svg viewBox="0 0 540 310" role="img" aria-label="火箭降落与神经网络控制示意">
            <g stroke="var(--border-subtle)" fill="none">{[50,110,170,230].map(y=><path key={y} d={`M28 ${y}H512`}/>)}</g>
            <g fill="var(--text-muted)" fontSize="10" fontFamily="monospace"><text x="28" y="42">OBSERVATION</text><text x="344" y="42">POLICY / 7 → 128 → 128 → 1</text><text x="28" y="284">LANDING ZONE</text></g>
            <path d="M160 70V193M116 240H204M132 246H188" stroke="var(--border-active)" strokeDasharray="3 7" fill="none"/>
            <g stroke="var(--text-primary)" strokeWidth="1.6" fill="var(--surface-1)">
              <path d="M147 178V107L153 88H167L173 107V178Z"/><path d="M147 122H173M147 166L128 194H118M173 166L192 194H202M153 178V185H167V178" fill="none"/>
            </g>
            <path d="M153 190L160 218L167 190" stroke="var(--accent)" fill="none" strokeWidth="1.5"/>
            <g stroke="var(--border-active)" fill="none">{[116,153,190].flatMap(y=>[98,135,172,209].map(z=><path key={`${y}-${z}`} d={`M335 ${y}L397 ${z}L465 153`}/>) )}</g>
            <g fill="var(--surface-2)" stroke="var(--accent)">{[116,153,190].map(y=><circle key={y} cx="335" cy={y} r="5"/>)}{[98,135,172,209].map(y=><circle key={y} cx="397" cy={y} r="5"/>)}<circle cx="465" cy="153" r="10"/></g>
            <path d="M303 153H258V137H193" stroke="var(--accent)" fill="none" strokeDasharray="4 5"/>
            <text x="350" y="258" fill="var(--text-muted)" fontSize="11">状态 → 网络 → 油门</text>
          </svg>
      </div>
      <nav className="lab-links" aria-label="首页实验入口">
        {experiments.map(experiment => (
          <Link href={experiment.href} key={experiment.number}>
            <small>{experiment.number}</small>
            <div><h3>{experiment.title}</h3><p>{experiment.description}</p></div>
            <span aria-hidden="true">↗</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
