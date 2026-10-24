import { site } from '../site';

export function Research() {
  return (
    <>
      <h1>Research</h1>
      <div className="card-grid">
        {site.researchAreas.map((area) => (
          <article key={area.title} className="card">
            <h2>{area.title}</h2>
            <p>{area.description}</p>
          </article>
        ))}
      </div>
    </>
  );
}
