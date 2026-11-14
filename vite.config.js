import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString()) }, // shown in the menu so you can tell which version is live
  server: { proxy: { '/api': 'http://localhost:8787' } },       // `npm run dev` + `npm run dev:api` together
  build: { chunkSizeWarningLimit: 1200 },
});
