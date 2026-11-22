import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api is forwarded to the Express API. In Docker/Kubernetes, nginx does the same.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_URL || 'http://localhost:4000' } },
});
