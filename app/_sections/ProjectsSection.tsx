import { projects } from "./data";
import { ArrowUpRight } from "./icons";

export function ProjectsSection() {
  return (
    <section className="section section-projects" id="projects">
      <div className="section-kicker">
        <span>02</span>
        <span>PROJECTS</span>
      </div>
      <div className="projects-heading">
        <h2>From first line of code to first demo.</h2>
        <p>
          Projects are open to any discipline. Contribute from algorithms, control,
          hardware, product, or visual expression.
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
            aria-label={`View ${project.title} on GitHub`}
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
