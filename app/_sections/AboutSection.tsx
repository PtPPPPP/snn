export function AboutSection() {
  return (
    <section className="section section-about" id="about">
      <div className="section-kicker">
        <span>01 /</span>
        <span>ABOUT SNN / 关于我们</span>
      </div>
      <div className="about-grid">
        <h2>一起做点有意思的事。</h2>
        <div className="about-copy">
          <p className="about-lead">
            我们一起听分享、学工具、组队做项目，把课堂之外的想法变成真正能运行、能展示的作品。
          </p>
          <div className="principles">
            <article>
              <span>INPUT</span>
              <h3>欢迎新同学</h3>
              <p>不要求一开始就很厉害，从一个小任务和一次分享开始。</p>
            </article>
            <article>
              <span>PROCESS</span>
              <h3>一起做项目</h3>
              <p>围绕真实问题组队，在动手和协作中学会代码、硬件与表达。</p>
            </article>
            <article>
              <span>OUTPUT</span>
              <h3>把过程留下</h3>
              <p>记录文档、Demo 和复盘，让每次尝试都能成为下一次的起点。</p>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
