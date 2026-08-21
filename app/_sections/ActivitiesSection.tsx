import { activities } from "./data";

export function ActivitiesSection() {
  return (
    <section className="section section-activities" id="activities">
      <div className="section-kicker section-kicker-light">
        <span>03</span>
        <span>ACTIVITIES</span>
      </div>
      <div className="activities-heading">
        <h2>Every session moves the work forward.</h2>
        <p>
          Learn methods in brief shares, build in sprints, and connect to broader
          real-world contexts through open exchange.
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
