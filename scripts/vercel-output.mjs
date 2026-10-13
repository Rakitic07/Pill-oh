// Packages the built site + API for Vercel (Build Output API v3). Runs after `vite build`; does nothing off Vercel
// unless called with --force (for testing locally).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

if (process.env.VERCEL !== '1' && !process.argv.includes('--force')) process.exit(0);

const root = new URL('../', import.meta.url);
const out = new URL('.vercel/output/', root);
const fn = new URL('functions/api.func/', out);

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });
cpSync(new URL('dist/', root), new URL('static/', out), { recursive: true });

await build({
  entryPoints: [new URL('server/vercel.ts', root).pathname],
  outfile: new URL('index.mjs', fn).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['pg-native'],
  // Lets bundled CommonJS packages (pg, web-push) call require() for Node built-ins.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

writeFileSync(
  new URL('.vc-config.json', fn),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }),
);
writeFileSync(new URL('package.json', fn), JSON.stringify({ type: 'module' }));

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

writeFileSync(
  new URL('config.json', out),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '/(.*)',
          headers: {
            'Content-Security-Policy': csp,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'no-referrer',
          },
          continue: true,
        },
        { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '/(sw\\.js|manifest\\.webmanifest|index\\.html)?', headers: { 'Cache-Control': 'no-cache' }, continue: true },
        { src: '/api/(.*)', dest: '/api?__pathname=/api/$1' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

console.log('Vercel output written to .vercel/output');
