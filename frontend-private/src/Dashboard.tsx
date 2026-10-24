import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from './api';
import { useAuth } from './auth';
import { useDefinitions } from './Layout';

export function Dashboard() {
  const { user } = useAuth();
  const defs = useDefinitions();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Record<string, number>>('/internal/stats')
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <h1>Welcome, {user?.name.split(' ')[0]}</h1>
      <p className="muted">Manage the lab's public website content and internal resources.</p>
      {error && <p className="error">{error}</p>}
      <div className="stat-grid">
        {defs.map((def) => (
          <Link key={def.key} to={`/${def.key}`} className="stat">
            <div className="stat-value">{stats ? stats[def.key] : '–'}</div>
            <div className="stat-label">{def.label}</div>
            <div className="muted small">{def.description}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
