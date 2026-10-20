import { addDays, DEFAULT_SETTINGS, getDosesForDate, MINUTE, toDateKey } from '../../src/schedule.ts';
import type { Dose, DoseLogs, Medicine, Settings } from '../../src/types.ts';
import { config } from '../config.ts';
import type { Store } from '../store/types.ts';
import { sendPush, type PushPayload, type PushSub } from './push.ts';
import { isNtfyTopic, sendNtfy, type NtfyKind } from './ntfy.ts';
import { sendWhatsApp } from './whatsapp.ts';

/** Server-managed data keys (leading underscore: never accepted from, or returned to, the client). */
export const PUSH_KEY = '_push';
export const WA_KEY = '_whatsapp';
export const WA_PENDING_KEY = '_waPending';
export const NTFY_KEY = '_ntfy';

export interface NotifyPrefs {
  push: boolean;
  whatsapp: boolean;
  ntfy: boolean;
  /** Remind this many minutes before the dose time (0 = at the time). */
  leadMinutes: number;
  /** Send a second nudge when a dose is about to be auto-marked missed. */
  missedNudge: boolean;
  timeZone: string;
}

export const isTimeZone = (tz: unknown): tz is string => {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** The user's wall-clock time, expressed as a server-local Date, so schedule.ts maths works unchanged. */
function wallClock(timeZone: string, at = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

const clock = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const names = (doses: Dose[]) => {
  const list = [...new Set(doses.map((d) => (d.med.dosage ? `${d.med.name} (${d.med.dosage})` : d.med.name)))];
  return list.length <= 2 ? list.join(' & ') : `${list.slice(0, 2).join(', ')} +${list.length - 2} more`;
};

export interface Alert extends PushPayload {
  kind: NtfyKind;
  /** Short values for an approved WhatsApp template: {{1}} medicines, {{2}} time. */
  vars: { meds: string; time: string };
}

/** Sends one alert over the user's enabled channels. Returns how many deliveries succeeded. */
export interface Channels {
  push: boolean;
  whatsapp: boolean;
  ntfy?: boolean;
}

export async function deliver(store: Store, userId: string, data: Record<string, unknown>, alert: Alert, channels: Channels) {
  let sent = 0;
  if (channels.push) {
    const subs = Array.isArray(data[PUSH_KEY]) ? (data[PUSH_KEY] as PushSub[]) : [];
    const { title, body, tag, url } = alert;
    const results = await Promise.all(subs.map((s) => sendPush(s, { title, body, tag, url })));
    sent += results.filter((r) => r === 'ok').length;
    if (results.includes('gone')) {
      await store.putUserData(userId, PUSH_KEY, subs.filter((_, i) => results[i] !== 'gone'));
    }
  }
  const wa = data[WA_KEY] as { phone?: string } | undefined;
  if (channels.whatsapp && wa?.phone) {
    const ok = await sendWhatsApp(wa.phone, {
      body: `${alert.title}\n${alert.body}`,
      template: config.twilioReminderContentSid
        ? { sid: config.twilioReminderContentSid, variables: { 1: alert.vars.meds, 2: alert.vars.time } }
        : undefined,
    });
    if (ok) sent++;
  }
  const ntfy = data[NTFY_KEY] as { topic?: string } | undefined;
  if (channels.ntfy && isNtfyTopic(ntfy?.topic) && (await sendNtfy(ntfy.topic, alert))) sent++;
  return sent;
}

const TICK_MS = MINUTE;
/** Gap between runs: 1 min in-process, or the external cron's interval on Vercel. */
const INTERVAL_MS = (config.isVercel ? config.cronIntervalMinutes : 1) * MINUTE;
/** A trigger fires on any run inside this window, so a slow or skipped run doesn't drop it. */
const WINDOW_MS = Math.max(5 * MINUTE, INTERVAL_MS + 2 * MINUTE);

/** Doses already alerted, kept in the database so serverless instances and restarts don't send twice. */
const NOTIFIED_KEY = '_notified';
const NOTIFIED_TTL_MS = 2 * 24 * 60 * MINUTE;

/** One pass over all users: sends any reminders that are due right now. Safe to call every minute from a cron. */
export async function runNotifier(store: Store) {
  const realNow = Date.now();
  for (const user of await store.listUsers()) {
    const data = await store.getUserData(user.id);
    const prefs = data.notify as NotifyPrefs | undefined;
    if (!prefs || (!prefs.push && !prefs.whatsapp && !prefs.ntfy) || !isTimeZone(prefs.timeZone)) continue;
    const notified: Record<string, number> = Object.fromEntries(
      Object.entries((data[NOTIFIED_KEY] ?? {}) as Record<string, number>).filter(([, at]) => realNow - at < NOTIFIED_TTL_MS),
    );
    let changed = false;

    const now = wallClock(prefs.timeZone);
    const meds = Array.isArray(data.medicines) ? (data.medicines as Medicine[]) : [];
    const logs = (data.logs ?? {}) as DoseLogs;
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(data.settings as Partial<Settings> | undefined) };
    const today = toDateKey(now);
    const doses = [addDays(today, -1), today, addDays(today, 1)].flatMap((day) => getDosesForDate(meds, logs, day, now, settings));

    const groups = new Map<string, { kind: 'due' | 'nudge'; time: string; doses: Dose[] }>();
    const consider = (dose: Dose, kind: 'due' | 'nudge', triggerAt: number) => {
      // Alerts go out on the run before their time, so cron/cold-start delay never makes them late.
      const diff = now.getTime() - (triggerAt - INTERVAL_MS);
      if (dose.log || diff < 0 || diff >= WINDOW_MS) return;
      const id = `${dose.key}|${kind}`;
      if (notified[id]) return;
      notified[id] = realNow;
      changed = true;
      const groupKey = `${kind}|${dose.scheduledAt.getTime()}`;
      const group = groups.get(groupKey) ?? { kind, time: dose.time, doses: [] };
      group.doses.push(dose);
      groups.set(groupKey, group);
    };
    for (const dose of doses) {
      consider(dose, 'due', dose.scheduledAt.getTime() - prefs.leadMinutes * MINUTE);
      const nudgeAfter = Math.max(Math.ceil(settings.graceMinutes / 2), settings.graceMinutes - 10);
      if (prefs.missedNudge) consider(dose, 'nudge', dose.scheduledAt.getTime() + nudgeAfter * MINUTE);
    }

    for (const { kind, time, doses: group } of groups.values()) {
      const meds = names(group);
      const at = clock(time);
      const alert: Alert =
        kind === 'due'
          ? {
              kind,
              title: `💊 Time for ${meds}`,
              body: `${prefs.leadMinutes || INTERVAL_MS > MINUTE ? `⏳ Due at ${at}.` : `🕒 Due now, ${at}.`} Tap to tick it off in Pill-oh.`,
              tag: `due-${group[0].key}`,
              vars: { meds, time: at },
            }
          : {
              kind,
              title: `⏰ Did you take ${meds}?`,
              body: `🕒 It was due at ${at} and will be marked missed soon. Tap to tick it off in Pill-oh.`,
              tag: `nudge-${group[0].key}`,
              vars: { meds, time: at },
            };
      await deliver(store, user.id, data, alert, prefs);
    }
    // Saved even when nothing is due, so expired entries get pruned.
    if (changed || Object.keys(notified).length !== Object.keys(data[NOTIFIED_KEY] ?? {}).length) {
      await store.putUserData(user.id, NOTIFIED_KEY, notified);
    }
  }
}

/** Long-running servers: checks every minute in-process. (On Vercel, a cron calls /api/cron/notify instead.) */
export function startNotifier(store: Store) {
  let running: Promise<void> | null = null;
  const run = () => {
    running ??= runNotifier(store)
      .catch((err) => console.error('notifier tick failed', err))
      .finally(() => {
        running = null;
      });
    return running;
  };
  const timer = setInterval(run, TICK_MS);
  timer.unref();
  void run();
  return { stop: () => clearInterval(timer), runNow: run };
}
