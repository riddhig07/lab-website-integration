import type { Publication } from '../types';

export function PublicationItem({ pub }: { pub: Publication }) {
  return (
    <li className="publication">
      <div className="pub-title">{pub.url ? <a href={pub.url}>{pub.title}</a> : pub.title}</div>
      <div className="pub-authors">{pub.authors}</div>
      <div className="pub-meta">
        {pub.venue && <span>{pub.venue}, </span>}
        <span>{pub.year}</span>
        {pub.pdf_url && (
          <>
            {' · '}
            <a href={pub.pdf_url}>PDF</a>
          </>
        )}
      </div>
    </li>
  );
}
