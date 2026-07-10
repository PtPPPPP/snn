const projects = [
  {
    index: "01",
    title: "Intent2Prompt",
    summary:
      "把模糊想法转译为清晰、可执行的结构化提示词，让 AI 协作从表达意图开始。",
    tags: ["PROMPT ENGINEERING", "LLM", "AI TOOL"],
    status: "GitHub Repo",
    href: "https://github.com/PtPPPPP/intent2prompt",
  },
  {
    index: "02",
    title: "低空无人机哨兵",
    summary:
      "面向低空场景的无人机智能感知与安全监测项目，探索从识别到预警的完整链路。",
    tags: ["DRONE", "COMPUTER VISION", "LOW ALTITUDE"],
    status: "GitHub Repo",
    href: "https://github.com/PtPPPPP/low-altitude-drone-sentinel",
  },
  {
    index: "03",
    title: "具身智能训练平台",
    summary:
      "围绕机器人学习与仿真训练，搭建可实验、可复现、可持续扩展的具身智能平台。",
    tags: ["EMBODIED AI", "ROBOTICS", "SIMULATION"],
    status: "GitHub Repo",
    href: "https://github.com/PtPPPPP/embodied-training-platform",
  },
];

const activities = [
  {
    code: "LEARN / 01",
    title: "技术小课",
    detail: "成员轮流分享 AI、机器人与工程工具，20 分钟讲清一个可复用方法。",
  },
  {
    code: "BUILD / 02",
    title: "项目冲刺",
    detail: "以 2–4 周为周期组队交付，从需求、Demo 到复盘，留下公开作品。",
  },
  {
    code: "CONNECT / 03",
    title: "开放交流",
    detail: "邀请老师、学长与行业伙伴交流，让学习路径连接比赛、科研与职业方向。",
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="SNN 首页">
          <img
            className="brand-logo"
            src="/snn-logo-fixed.png"
            alt="SNN 社团 Logo"
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-name">
            Smart Neural
            <br />
            Network
          </span>
        </a>

        <nav className="main-nav" aria-label="主导航">
          <a href="#about">关于我们</a>
          <a href="#activities">活动</a>
          <a href="#projects">项目</a>
          <a className="nav-join" href="#join">
            加入 SNN <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="coordinate coordinate-top">X:064 / Y:108</div>
        <div className="hero-copy">
          <p className="eyebrow">AI × ROBOTICS × MAKERS</p>
          <h1>
            把想法，
            <br />
            训练成现实。
          </h1>
          <p className="hero-intro">
            面向人工智能与机器人方向的学生科技社团。
            <br />
            一起学习、动手、参赛，把第一行代码做成真正能跑的项目。
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href="#projects">
              探索项目 <span aria-hidden="true">→</span>
            </a>
            <a className="button button-secondary" href="#join">
              加入 SNN <span aria-hidden="true">↘</span>
            </a>
          </div>
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
            src="/snn-robot-arm.png"
            alt="银色工业机器人机械臂"
          />
          <div className="code-note" aria-hidden="true">
            <span>def forward_kinematics(q):</span>
            <span>&nbsp;&nbsp;T = eye(4)</span>
            <span>&nbsp;&nbsp;return T</span>
          </div>
        </div>

        <div className="hero-proof" aria-label="社团特点">
          <span className="system-ok">＋ SYS_OK</span>
          <span>PROJECT-DRIVEN</span>
          <span>OPEN TO BEGINNERS</span>
          <span>BUILD IN PUBLIC</span>
        </div>
      </section>

      <section className="section section-about" id="about">
        <div className="section-kicker">
          <span>01</span>
          <span>ABOUT / 定位</span>
        </div>
        <div className="about-grid">
          <h2>
            学得会，
            <br />
            做得出，
            <br />
            讲得清。
          </h2>
          <div className="about-copy">
            <p className="about-lead">
              SNN 不是只听分享的兴趣群，也不是只服务少数高手的比赛队。
              我们用真实项目，把分散的知识变成可以运行、展示和继续迭代的作品。
            </p>
            <div className="principles">
              <article>
                <span>INPUT</span>
                <h3>对新手开放</h3>
                <p>从工具和基础任务开始，有清晰入口，也有进阶空间。</p>
              </article>
              <article>
                <span>PROCESS</span>
                <h3>以项目驱动</h3>
                <p>围绕问题组队协作，在交付中补齐代码、硬件与表达能力。</p>
              </article>
              <article>
                <span>OUTPUT</span>
                <h3>让成果可见</h3>
                <p>保留文档、Demo 与复盘，让每次实践沉淀为个人作品。</p>
              </article>
            </div>
          </div>
        </div>
      </section>

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
              <p>{project.summary}</p>
              <span className="project-status">{project.status}</span>
              <span className="project-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="section section-activities" id="activities">
        <div className="section-kicker section-kicker-light">
          <span>03</span>
          <span>ACTIVITIES / 活动机制</span>
        </div>
        <div className="activities-heading">
          <h2>
            每次活动，
            <br />
            都向作品前进一步。
          </h2>
          <p>
            从短分享获得方法，在项目冲刺里完成实践，再通过开放交流连接更大的真实场景。
          </p>
        </div>
        <div className="activity-grid">
          {activities.map((activity) => (
            <article key={activity.code}>
              <span>{activity.code}</span>
              <h3>{activity.title}</h3>
              <p>{activity.detail}</p>
              <div className="activity-line" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="section section-join" id="join">
        <div className="join-main">
          <p className="eyebrow">JOIN THE NETWORK / 04</p>
          <h2>
            不必等准备好，
            <br />
            从一个角色开始。
          </h2>
          <p className="join-intro">
            无论你刚写出第一个程序，还是已经在做机器人、算法或产品项目，SNN
            都欢迎愿意学习、愿意协作、愿意交付的你。
          </p>
          <div className="join-status" aria-label="公众号状态">
            <span className="pulse" aria-hidden="true" />
            SNN 社团公众号已上线
          </div>
          <p className="join-placeholder">
            扫描二维码关注公众号，获取活动预告、项目进展与最新招募信息。
          </p>
        </div>
        <div className="wechat-card" id="join-steps">
          <div className="wechat-card-head">
            <span>WECHAT / 公众号</span>
            <span>SCAN TO FOLLOW ↘</span>
          </div>
          <div className="wechat-qr-wrap">
            <img src="/snn-wechat.jpg" alt="SNN 社团公众号二维码" />
            <span className="corner corner-a" aria-hidden="true" />
            <span className="corner corner-b" aria-hidden="true" />
          </div>
          <div className="wechat-card-foot">
            <strong>SNN 社团</strong>
            <span>活动 · 项目 · 招募</span>
          </div>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top" aria-label="返回首页顶部">
          <img
            className="brand-logo"
            src="/snn-logo-fixed.png"
            alt="SNN 社团 Logo"
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-name">SMART NEURAL NETWORK</span>
        </a>
        <p>AI × ROBOTICS × MAKERS</p>
        <a href="#top">BACK TO TOP ↑</a>
      </footer>
    </main>
  );
}
