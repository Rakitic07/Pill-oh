import { randomBytes } from 'node:crypto';
import { config } from '../config.ts';

/** 128 random bits: the topic name is the only thing protecting a user's reminders on a public ntfy server. */
export const newNtfyTopic = () => `pill-oh-${randomBytes(16).toString('base64url').replace(/[-_]/g, 'x')}`;

export const ntfyServer = () => config.ntfyServer.replace(/\/+$/, '');

/** `pillpal-` topics were created before the rename and stay valid. */
export const isNtfyTopic = (v: unknown): v is string => typeof v === 'string' && /^(pill-oh|pillpal)-[A-Za-z0-9]{22}$/.test(v);

export type NtfyKind = 'due' | 'nudge' | 'test';

/** ntfy turns tags that are emoji short codes into an emoji before the title. */
const STYLE: Record<NtfyKind, { tags: string[]; priority: number }> = {
  due: { tags: ['pill'], priority: 4 },
  nudge: { tags: ['alarm_clock'], priority: 4 },
  test: { tags: ['white_check_mark'], priority: 3 },
};

const LEADING_EMOJI = /^\p{Extended_Pictographic}\uFE0F?\s*/u;

export async function sendNtfy(topic: string, msg: { title: string; body: string; kind?: NtfyKind }): Promise<boolean> {
  const kind = msg.kind ?? 'test';
  // Images and buttons need a public https address the phone can reach (public/notify-*.png).
  const site = config.siteUrl.startsWith('https://') ? config.siteUrl : '';
  try {
    const res = await fetch(ntfyServer(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.ntfyToken ? { Authorization: `Bearer ${config.ntfyToken}` } : {}),
      },
      body: JSON.stringify({
        topic,
        title: msg.title.replace(LEADING_EMOJI, ''),
        message: msg.body,
        ...STYLE[kind],
        ...(site
          ? {
              click: site,
              icon: `${site}/icon-192.png`,
              attach: `${site}/notify-${kind}.png`,
              filename: `pill-oh-${kind}.png`,
              actions: [{ action: 'view', label: 'Open Pill-oh', url: site, clear: true }],
            }
          : {}),
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
