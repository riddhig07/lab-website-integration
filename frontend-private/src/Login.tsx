import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { api } from './api';
import { useAuth } from './auth';

// Set by the backend when it sends GitHub sign-in back here (routes/auth.ts).
const GITHUB_ERRORS: Record<string, string> = {
  github_unavailable: 'GitHub sign-in is not set up on this site.',
  github_state: 'That sign-in link expired. Please try again.',
  github_failed: 'Could not reach GitHub. Please try again.',
};

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [githubEnabled, setGithubEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => githubError(params));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ github: boolean }>('/auth/options')
      .then((o) => setGithubEnabled(o.github))
      .catch(() => setGithubEnabled(false));
  }, []);

  if (user) return <Navigate to={from} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Lab Portal</h1>
        <p className="muted">Sign in with your lab account.</p>
        {githubEnabled && (
          <>
            {/* A full page load: the backend redirects to GitHub and back. */}
            <a className="button" href={`/api/auth/github?${new URLSearchParams({ from })}`}>
              Sign in with GitHub
            </a>
            <div className="divider">or</div>
          </>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="small">
          <a href="/">← Back to public site</a>
        </p>
      </form>
    </div>
  );
}

function githubError(params: URLSearchParams): string | null {
  const code = params.get('error');
  if (!code) return null;
  if (code === 'github_not_allowed') {
    return `The GitHub account @${params.get('login')} (id ${params.get('id')}) doesn't have access. Ask a lab admin to add you to the lab's GitHub organization.`;
  }
  return GITHUB_ERRORS[code] ?? 'Sign-in failed. Please try again.';
}
