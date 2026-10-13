import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Link-preview crawlers need absolute image URLs, so %SITE_URL% in index.html becomes e.g. https://pill-oh.example.com. */
const siteUrl = (url: string): Plugin => ({
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url.replace(/\/+$/, '')),
});

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'SITE_'), ...process.env };
  return {
    plugins: [react(), siteUrl(env.SITE_URL ?? '')],
    server: {
      watch: { ignored: ['**/.vercel/**', '**/server/.data/**'] },
      proxy: {
        '/api': { target: `http://localhost:${env.PORT || 8787}`, changeOrigin: false },
      },
    },
  };
});
