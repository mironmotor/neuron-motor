import type { ReportJson } from '../lib/types';

// A4-friendly report layout, shared by the Mini App view and the Puppeteer
// PDF print path (/report/:id?print=true). Print CSS lives in globals.css.
export default function ReportPage({ report }: { report: ReportJson }) {
  return (
    <article className="report-page">
      <h1>{report.title}</h1>
      <div className="subtitle">{report.subtitle}</div>

      {report.sections.map((s) => (
        <section className="section" key={s.key}>
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </section>
      ))}

      {report.seven_day_plan.length > 0 && (
        <section className="section">
          <h2>Миссия на 7 дней</h2>
          <ul className="plan">
            {report.seven_day_plan.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>Живой разбор</h2>
        <p>{report.upsell}</p>
      </section>
    </article>
  );
}
