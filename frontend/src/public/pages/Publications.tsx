import type { Publication } from '../../types';
import { usePublicData } from '../../api';
import { PublicationItem } from '../PublicationItem';
import { Status } from '../Status';

export function Publications() {
  const { data, error, loading } = usePublicData<Publication[]>('/publications');
  const years = data ? [...new Set(data.map((p) => p.year))] : [];

  return (
    <>
      <h1>Publications</h1>
      <Status loading={loading} error={error} empty={data?.length === 0 ? 'No publications yet.' : undefined} />
      {years.map((year) => (
        <section key={year}>
          <h2>{year}</h2>
          <ul className="publications">
            {data!
              .filter((p) => p.year === year)
              .map((pub) => (
                <PublicationItem key={pub.id} pub={pub} />
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
