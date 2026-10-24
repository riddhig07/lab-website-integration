import { Link } from 'react-router';
import type { NewsItem, Publication } from '../../types';
import { formatDate, usePublicData } from '../../api';
import { PublicationItem } from '../PublicationItem';
import { site } from '../site';

export function Home() {
  const news = usePublicData<NewsItem[]>('/news?limit=3');
  const featured = usePublicData<Publication[]>('/publications?featured=1');

  return (
    <>
      <section className="hero">
        <h1>{site.name}</h1>
        <p className="lead">{site.tagline}</p>
      </section>

      <section>
        <h2>About</h2>
        <p>{site.about}</p>
        <p>
          <Link to="/research">Learn about our research →</Link>
        </p>
      </section>

      {news.data && news.data.length > 0 && (
        <section>
          <h2>Recent News</h2>
          <ul className="news-list compact">
            {news.data.map((item) => (
              <li key={item.id}>
                <time>{formatDate(item.published_at)}</time> {item.title}
              </li>
            ))}
          </ul>
          <Link to="/news">All news →</Link>
        </section>
      )}

      {featured.data && featured.data.length > 0 && (
        <section>
          <h2>Featured Publications</h2>
          <ul className="publications">
            {featured.data.map((pub) => (
              <PublicationItem key={pub.id} pub={pub} />
            ))}
          </ul>
          <Link to="/publications">All publications →</Link>
        </section>
      )}
    </>
  );
}
