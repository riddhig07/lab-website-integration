import type { NewsItem } from '../../types';
import { formatDate, usePublicData } from '../../api';
import { Status } from '../Status';

export function News() {
  const { data, error, loading } = usePublicData<NewsItem[]>('/news');

  return (
    <>
      <h1>News</h1>
      <Status loading={loading} error={error} empty={data?.length === 0 ? 'No news yet.' : undefined} />
      <ul className="news-list">
        {data?.map((item) => (
          <li key={item.id}>
            <time>{formatDate(item.published_at)}</time>
            <h2>{item.title}</h2>
            <p className="prewrap">{item.body}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
