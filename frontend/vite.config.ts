import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
      // The members portal is a separate app (frontend-private) on its own dev server.
      '/portal': { target: 'http://localhost:5181', ws: true },
    },
  },
});
