import { PERSON_CATEGORIES, PERSON_CATEGORY_LABELS, type Person } from '../../types';
import { usePublicData } from '../../api';
import { Status } from '../Status';

export function People() {
  const { data, error, loading } = usePublicData<Person[]>('/people');

  return (
    <>
      <h1>People</h1>
      <Status loading={loading} error={error} empty={data?.length === 0 ? 'No people listed yet.' : undefined} />
      {data &&
        PERSON_CATEGORIES.map((category) => {
          const members = data.filter((p) => p.category === category);
          if (members.length === 0) return null;
          return (
            <section key={category}>
              <h2>{PERSON_CATEGORY_LABELS[category]}</h2>
              <div className="people-grid">
                {members.map((person) => (
                  <PersonCard key={person.id} person={person} />
                ))}
              </div>
            </section>
          );
        })}
    </>
  );
}

function PersonCard({ person }: { person: Person }) {
  const initials = person.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

  return (
    <article className="person">
      {person.photo_url ? (
        <img src={person.photo_url} alt="" className="avatar" />
      ) : (
        <div className="avatar placeholder" aria-hidden="true">
          {initials}
        </div>
      )}
      <div>
        <h3>{person.website ? <a href={person.website}>{person.name}</a> : person.name}</h3>
        {person.title && <p className="muted">{person.title}</p>}
        {person.bio && <p>{person.bio}</p>}
        {person.email && <a href={`mailto:${person.email}`}>{person.email}</a>}
      </div>
    </article>
  );
}
