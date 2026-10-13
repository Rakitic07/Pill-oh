import { randomBytes } from 'node:crypto';
import { config } from '../config.ts';

/** 128 random bits: the topic name is the only thing protecting a user's reminders on a public ntfy server. */
export const newNtfyTopic = () => `pill-oh-${randomBytes(16).toString('base64url').replace(/[-_]/g, 'x')}`;

export const ntfyServer = () => config.ntfyServer.replace(/\/+$/, '');

/** `pillpal-` topics were created before the rename and stay valid. */
export const isNtfyTopic = (v: unknown): v is string => typeof v === 'string' && /^(pill-oh|pillpal)-[A-Za-z0-9]{22}$/.test(v);

export async function sendNtfy(topic: string, msg: { title: string; body: string }): Promise<boolean> {
  try {
    const res = await fetch(ntfyServer(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.ntfyToken ? { Authorization: `Bearer ${config.ntfyToken}` } : {}),
      },
      body: JSON.stringify({
        topic,
        title: msg.title,
        message: msg.body,
        tags: ['pill'],
        priority: 4,
        ...(config.siteUrl ? { click: config.siteUrl } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn(JSON.stringify({ at: new Date().toISOString(), event: 'ntfy.error', status: res.status }));
    return res.ok;
  } catch {
    console.warn(JSON.stringify({ at: new Date().toISOString(), event: 'ntfy.error', status: null }));
    return false;
  }
}
