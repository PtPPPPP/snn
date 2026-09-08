export function AboutSection() {
  return (
    <section className="section section-about" id="about">
      <div className="section-kicker">
        <span>01 /</span>
        <span>THE OPEN LAB</span>
      </div>
      <div className="about-grid">
        <h2>好奇心是起点。<br />作品是回答。</h2>
        <div className="about-copy">
          <p className="about-lead">
            SNN 是由学生共建的 AI 实验室与技术社区。
            我们把学习放进真实项目：一起理解原理、编写代码，让智能走出屏幕，成为可运行的系统。
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
