import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { bootstrapAdmin } from './bootstrapAdmin.ts';
import { startNotifier } from './notify/index.ts';
import { initPush } from './notify/push.ts';
import { config } from './config.ts';
import { createStore } from './store/index.ts';

const store = await createStore();
await bootstrapAdmin(store);
await initPush();
const app = createApp(store);
startNotifier(store);

if (config.isProd) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  const storage = store.kind === 'postgres' ? 'Postgres (DATABASE_URL)' : `local file ${config.localDbFile}`;
  console.log(`Pill-oh API listening on http://localhost:${info.port} · storage: ${storage}`);
});

const shutdown = async () => {
  await store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
