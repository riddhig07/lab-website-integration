import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { site } from './site';

const NAV = [
  { to: '/research', label: 'Research' },
  { to: '/people', label: 'People' },
  { to: '/publications', label: 'Publications' },
  { to: '/news', label: 'News' },
  { to: '/contact', label: 'Contact' },
];

export function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = NAV.find((n) => n.to === pathname)?.label;
    document.title = page ? `${page} · ${site.shortName}` : site.name;
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            {site.shortName}
          </Link>
          <nav aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="container site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            {site.name} · {site.department} · {site.institution}
          </p>
          <p>
            <a href={`mailto:${site.email}`}>{site.email}</a> · <a href="/portal/">Members</a>
          </p>
        </div>
      </footer>
    </>
  );
}
