// Combines the two frontend builds into dist/ for static hosting on Vercel:
// the public site at the root, the members portal under /portal, and
// deploy/vercel.json (which forwards /api to the backend on Railway).
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
cpSync('frontend/dist', 'dist', { recursive: true });
cpSync('frontend-private/dist', 'dist/portal', { recursive: true });
cpSync('deploy/vercel.json', 'dist/vercel.json');
console.log('Assembled dist/ (public site + /portal).');
