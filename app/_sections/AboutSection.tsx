export function AboutSection() {
  return (
    <section className="section section-about" id="about">
      <div className="section-kicker">
        <span>01</span>
        <span>ABOUT</span>
      </div>
      <div className="about-grid">
        <h2>Learn it. Build it. Explain it.</h2>
        <div className="about-copy">
          <p className="about-lead">
            SNN is neither a lecture-only club nor an elite-only team.
            Through real projects, we turn scattered knowledge into runnable,
            demonstrable, and evolving work.
          </p>
          <div className="principles">
            <article>
              <span>INPUT</span>
              <h3>Open to beginners</h3>
              <p>Start with tools and entry tasks — clear entry points with room to grow.</p>
            </article>
            <article>
              <span>PROCESS</span>
              <h3>Project-driven</h3>
              <p>Collaborate around real problems and build code, hardware, and communication through delivery.</p>
            </article>
            <article>
              <span>OUTPUT</span>
              <h3>Make work visible</h3>
              <p>Keep docs, demos, and retrospectives so every practice becomes a portfolio piece.</p>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
