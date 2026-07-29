import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 48311,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:48310',
    },
  },
});
