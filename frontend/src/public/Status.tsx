export function Status({ loading, error, empty }: { loading: boolean; error: string | null; empty?: string }) {
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">Couldn't load this content. Please try again later.</p>;
  if (empty) return <p className="muted">{empty}</p>;
  return null;
}
