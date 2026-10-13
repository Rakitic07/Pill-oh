import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import webpush from 'web-push';
import { config } from '../config.ts';

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url?: string;
}

let publicKey = '';

/** Uses VAPID keys from the environment, or generates a pair once and keeps it (owner-only) in server/.data. */
export async function initPush() {
  let keys = { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey };
  if ((!keys.publicKey || !keys.privateKey) && config.isVercel) {
    console.warn('Phone push is off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys).');
    return;
  }
  if (!keys.publicKey || !keys.privateKey) {
    const file = join(config.dataDir, 'vapid.json');
    try {
      keys = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      await mkdir(config.dataDir, { recursive: true });
      await writeFile(file, JSON.stringify(keys), { mode: 0o600 });
      await chmod(file, 0o600);
      console.log(
        `Generated Web Push keys in ${file}.` +
          (config.isProd ? ' Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in production so they survive redeploys.' : ''),
      );
    }
  }
  webpush.setVapidDetails(config.vapidSubject, keys.publicKey, keys.privateKey);
  publicKey = keys.publicKey;
}

export const pushPublicKey = () => publicKey;

// Only real browser push services, so the server can't be pointed at arbitrary URLs.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
const B64URL = /^[A-Za-z0-9_-]+=*$/;

export function parsePushSub(v: unknown): PushSub | null {
  if (!v || typeof v !== 'object') return null;
  const { endpoint, keys } = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((h) => h.test(url.hostname))) return null;
  const { p256dh, auth } = keys ?? {};
  if (typeof p256dh !== 'string' || p256dh.length > 200 || !B64URL.test(p256dh)) return null;
  if (typeof auth !== 'string' || auth.length > 100 || !B64URL.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth }, createdAt: new Date().toISOString() };
}

/** 'gone' means the browser unsubscribed; the caller should forget this subscription. */
export async function sendPush(sub: PushSub, payload: PushPayload): Promise<'ok' | 'gone' | 'error'> {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60, urgency: 'high', timeout: 10_000 });
    return 'ok';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.warn(JSON.stringify({ at: new Date().toISOString(), event: 'push.error', status: status ?? null }));
    return 'error';
  }
}
