import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served under /portal on the same origin as the public site, so the session
// cookie and /api work without CORS. In dev, the public dev server (:5180)
// proxies /portal here, so http://localhost:5180/portal works like production.
export default defineConfig({
  base: '/portal/',
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
