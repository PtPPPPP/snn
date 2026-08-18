export function AboutSection() {
  return (
    <section className="section section-about" id="about">
      <div className="section-kicker">
        <span>01</span>
        <span>ABOUT / 定位</span>
      </div>
      <div className="about-grid">
        <h2>学得会，做得出，讲得清。</h2>
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
  );
}
