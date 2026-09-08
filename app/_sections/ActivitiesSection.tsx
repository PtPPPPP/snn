import { activities } from "./data";

export function ActivitiesSection() {
  return (
    <section className="section section-activities" id="activities">
      <div className="section-kicker section-kicker-light">
        <span>03 /</span>
        <span>LEARN. BUILD. SHARE. / 社团日常</span>
      </div>
      <div className="activities-heading">
        <h2>一起学，一起做，一起分享。</h2>
        <p>
          从一场短分享开始，在项目冲刺里动手实践，再把经验分享给下一位同学。
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
  );
}
