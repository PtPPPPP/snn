import { activities } from "./data";

export function ActivitiesSection() {
  return (
    <section className="section section-activities" id="activities">
      <div className="section-kicker section-kicker-light">
        <span>03 /</span>
        <span>LEARN. BUILD. SHARE.</span>
      </div>
      <div className="activities-heading">
        <h2>一起，把问题做深。</h2>
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
  );
}
