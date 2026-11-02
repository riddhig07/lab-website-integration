import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useOutletContext } from 'react-router';
import { api } from './api';
import type { ResourceDef } from './types';
import { useAuth } from './auth';
import { Assistant } from './assistant/Assistant';

/** Content definitions loaded by the portal layout, available to every portal page. */
export function useDefinitions(): ResourceDef[] {
  return useOutletContext<ResourceDef[]>();
}

export function Layout() {
  const { user, logout } = useAuth();
  const [defs, setDefs] = useState<ResourceDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ResourceDef[]>('/internal/definitions')
      .then(setDefs)
      .catch((e: Error) => setError(e.message));
  }, []);

  const navGroup = (heading: string, items: ResourceDef[]) => (
    <>
      <div className="nav-heading">{heading}</div>
      {items.map((def) => (
        <NavLink key={def.key} to={`/${def.key}`}>
          {def.label}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Lab Portal</div>
        <nav aria-label="Portal">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          {defs && navGroup('Public content', defs.filter((d) => d.public))}
          {defs && navGroup('Internal', defs.filter((d) => !d.public))}
          <NavLink to="/drive">Lab Drive</NavLink>
          <NavLink to="/meetings">Meetings</NavLink>
          <div className="nav-heading">Projects</div>
          <NavLink to="/tracker">Task Board</NavLink>
          <NavLink to="/repos">Repositories</NavLink>
        </nav>
        <div className="sidebar-footer">
          <a href="/">View public site</a>
          <div className="user">
            <div>{user?.name}</div>
            <div className="muted small">
              {user?.github_login ? `@${user.github_login}` : user?.email} · {user?.role}
            </div>
          </div>
          <button type="button" className="secondary" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        {error && <p className="error">{error}</p>}
        {defs ? <Outlet context={defs} /> : !error && <p className="muted">Loading…</p>}
      </main>
      <Assistant />
    </div>
  );
}
