// Vercel Function entry: the same API as server/index.ts, without the long-running timer or static file serving.
// Bundled to .vercel/output by scripts/vercel-output.mjs.
import { getRequestListener } from '@hono/node-server';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.ts';
import { bootstrapAdmin } from './bootstrapAdmin.ts';
import { initPush } from './notify/push.ts';
import { ConfigError, createStore } from './store/index.ts';

let ready: Promise<ReturnType<typeof createApp>> | null = null;

const boot = async () => {
  const store = await createStore();
  await bootstrapAdmin(store);
  await initPush();
  return createApp(store);
};

const listener = getRequestListener(async (request) => {
  try {
    ready ??= boot();
    return (await ready).fetch(request);
  } catch (err) {
    ready = null;
    console.error(err);
    const message = err instanceof ConfigError ? err.message : 'The server couldn’t start. Check the function logs on Vercel.';
    return Response.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
});

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Build Output routes rewrite /api/* here and pass the original path as ?__pathname=.
  const url = new URL(req.url ?? '/', 'http://local');
  const original = url.searchParams.get('__pathname');
  if (original?.startsWith('/api/')) {
    url.searchParams.delete('__pathname');
    req.url = original + url.search;
  }
  return listener(req, res);
}
