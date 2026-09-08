import { projects } from "./data";
import { ArrowUpRight } from "./icons";

export function ProjectsSection() {
  return (
    <section className="section section-projects" id="projects">
      <div className="section-kicker"><span>02 /</span><span>BUILT AT SNN</span></div>
      <div className="projects-heading"><h2>想法，进入真实世界。</h2><p>从软件到物理系统。保留过程，开放成果，让每次实验都有下一步。</p></div>
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
