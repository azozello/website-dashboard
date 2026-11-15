import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Same origin as production (app.<domain>/api → app API): the session cookie just works.
    // The Host header stays localhost:<port>, matching the API's APP_BASE_URL.
    proxy: { '/api': 'http://127.0.0.1:8081' },
  },
});
