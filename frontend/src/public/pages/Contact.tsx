import { site } from '../site';

export function Contact() {
  return (
    <>
      <h1>Contact</h1>
      <section>
        <h2>Location</h2>
        <address>
          {site.department}
          <br />
          {site.institution}
          {site.address.map((line) => (
            <span key={line}>
              <br />
              {line}
            </span>
          ))}
        </address>
      </section>
      <section>
        <h2>Email</h2>
        <p>
          <a href={`mailto:${site.email}`}>{site.email}</a>
        </p>
      </section>
      <section>
        <h2>Prospective Members</h2>
        <p>{site.prospective}</p>
      </section>
    </>
  );
}
