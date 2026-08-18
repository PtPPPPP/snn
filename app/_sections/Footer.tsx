import { ArrowUp } from "./icons";
import { projects } from "./data";

export function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <a className="brand footer-brand" href="#top" aria-label="返回首页顶部">
          <img
            className="brand-logo"
            src="/assets/snn-logo-fixed.png"
            alt="SNN 社团 Logo"
            width={1254}
            height={1254}
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-name">SMART NEURAL NETWORK</span>
        </a>
        <p className="footer-tagline">AI × ROBOTICS × MAKERS</p>

        <div className="footer-cols">
          <div className="footer-col">
            <span className="footer-col-title">ABOUT</span>
            <a href="#about">关于我们</a>
            <a href="#activities">活动机制</a>
            <a href="#projects">共创项目</a>
            <a href="#join">加入 SNN</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">PROJECTS</span>
            {projects.map((project) => (
              <a
                key={project.index}
                href={project.href}
                target="_blank"
                rel="noreferrer"
              >
                {project.title}
              </a>
            ))}
          </div>
          <div className="footer-col">
            <span className="footer-col-title">CONTACT</span>
            <a href="mailto:1074897559@qq.com">1074897559@qq.com</a>
            <a
              href="https://github.com/PtPPPPPPPPPP"
              target="_blank"
              rel="noreferrer"
            >
              GitHub @PtPPPPPPPPPP
            </a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 SNN · SMART NEURAL NETWORK</span>
        <a className="back-to-top" href="#top">
          BACK TO TOP <ArrowUp className="back-to-top-icon" />
        </a>
      </div>
    </footer>
  );
}
