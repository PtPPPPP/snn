import Link from "next/link";
import { projects } from "./data";
import { ArrowUpRight } from "./icons";

export function ProjectsSection() {
  return (
    <section className="section section-projects" id="projects">
      <div className="section-kicker"><span>02 /</span><span>BUILT AT SNN</span></div>
      <div className="projects-heading"><h2>想法，进入真实世界。</h2><p>从软件到物理系统。保留过程，开放成果，让每次实验都有下一步。</p></div>
      <article className="featured-project">
        <div className="featured-copy">
          <span className="eyebrow">FEATURED / 交互实验</span>
          <h3>让智能，<br />落到地面。</h3>
          <p>亲手控制火箭回收，再走进神经网络，观察一次决策与一次权重更新。</p>
          <div className="featured-tags"><span>强化学习</span><span>PPO</span><span>浏览器实时推理</span></div>
          <Link className="button button-ghost" href="/play/rocket">开始回收挑战 <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="featured-visual">
          <div className="featured-visual-heading"><span>ROCKET LANDING / CONTROL LAB</span><span>01—03</span></div>
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
          <p>控制原理示意 · 进入实验查看真实计算</p>
        </div>
        <nav className="experiment-links" aria-label="首页实验入口">
          <Link href="/play/rocket"><small>01</small><span>回收挑战</span><span aria-hidden="true">↗</span></Link>
          <Link href="/play/rocket/explain"><small>02</small><span>怎样推理</span><span aria-hidden="true">↗</span></Link>
          <Link href="/play/rocket/train"><small>03</small><span>怎样学习</span><span aria-hidden="true">↗</span></Link>
        </nav>
      </article>
      <div className="project-list">
        {projects.map(project => (
          <a className="project-row" href={project.href} key={project.index} target="_blank" rel="noreferrer" aria-label={`在 GitHub 查看 ${project.title}`}>
            <span className="project-index">P/{project.index}</span>
            <div className="project-title-wrap"><h3>{project.title}</h3><div className="project-tags">{project.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div>
            <p className="project-summary">{project.summary}</p>
            <span className="project-meta"><span className="project-status">{project.status}</span><ArrowUpRight className="project-arrow-icon" /></span>
          </a>
        ))}
      </div>
    </section>
  );
}
