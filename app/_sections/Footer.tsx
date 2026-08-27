import { ArrowUp } from "./icons";
import { projects } from "./data";
import { BRAND_LOGO, BRAND_NAME_EN } from "../../lib/site";

export function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <a className="brand footer-brand" href="#top" aria-label="返回首页顶部">
          <img
            className="brand-logo"
            src={BRAND_LOGO.src}
            alt="SNN 社团 Logo"
            width={BRAND_LOGO.width}
            height={BRAND_LOGO.height}
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-name">{BRAND_NAME_EN}</span>
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
              href="https://github.com/PtPPPPP"
              target="_blank"
              rel="noreferrer"
            >
              GitHub @PtPPPPP
            </a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 SNN · {BRAND_NAME_EN}</span>
        <a className="back-to-top" href="#top">
          BACK TO TOP <ArrowUp className="back-to-top-icon" />
        </a>
      </div>
    </footer>
  );
}
