import { projects } from "./data";
import { ArrowUpRight } from "./icons";

export function ProjectsSection() {
  return (
    <section className="section section-projects" id="projects">
      <div className="section-kicker">
        <span>02</span>
        <span>PROJECTS / 共创项目</span>
      </div>
      <div className="projects-heading">
        <h2>从第一行代码，到第一个现场。</h2>
        <p>
          项目不按专业设限。你可以从算法、控制、硬件、产品或视觉表达中的任一位置加入。
        </p>
      </div>
      <div className="project-list">
        {projects.map((project) => (
          <a
            className="project-row"
            href={project.href}
            key={project.index}
            target="_blank"
            rel="noreferrer"
            aria-label={`在 GitHub 查看 ${project.title}`}
          >
            <span className="project-index">P/{project.index}</span>
            <div className="project-title-wrap">
              <h3>{project.title}</h3>
              <div className="project-tags">
                {project.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <p className="project-summary">{project.summary}</p>
            <div className="project-meta">
              <span className="project-status">{project.status}</span>
              <span className="project-arrow" aria-hidden="true">
                <ArrowUpRight className="project-arrow-icon" />
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
