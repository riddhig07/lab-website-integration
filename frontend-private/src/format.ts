/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '—');

export const formatDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '—');

/** Two initials for an avatar placeholder. */
export function initials(name: string): string {
  return (
    name
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/** Lines added / removed: "+1,204", "−36", or "0". */
export const added = (n: number) => (n ? `+${n.toLocaleString()}` : '0');
export const removed = (n: number) => (n ? `−${Math.abs(n).toLocaleString()}` : '0');

export const plural =(n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
