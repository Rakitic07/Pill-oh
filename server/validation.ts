import { isThemeId } from '../src/themes.ts';
import { isTimeZone } from './notify/index.ts';
import type { ResetAnswers } from './store/types.ts';

const HEX = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[\w-]{1,64}$/;
const LOG_KEY = /^\d{4}-\d{2}-\d{2}\|[\w-]{1,64}\|([01]\d|2[0-3]):[0-5]\d$/;
const USERNAME = /^[A-Za-z0-9_.-]{3,32}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);
const int = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

export const USERNAME_RULE = 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.';
export const PASSWORD_RULE = 'Password must be 8–128 characters.';

export function parseUsername(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim();
  return USERNAME.test(name) ? name : null;
}

export const parsePassword = (v: unknown): string | null =>
  typeof v === 'string' && v.length >= 8 && v.length <= 128 ? v : null;

function medicine(v: unknown) {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const name = str(v.name, 80)?.trim();
  const dosage = v.dosage === undefined ? '' : str(v.dosage, 80);
  const color = str(v.color, 7);
  const startDate = str(v.startDate, 10);
  const endDate = v.endDate === undefined ? undefined : str(v.endDate, 10);
  const notes = v.notes === undefined ? undefined : str(v.notes, 300);
  const times = Array.isArray(v.times) ? v.times : null;
  const days = Array.isArray(v.days) ? v.days : null;

  if (!id || !ID.test(id) || !name || dosage === null || !color || !HEX.test(color)) return null;
  if (!startDate || !DATE.test(startDate) || endDate === null || (endDate && !DATE.test(endDate)) || notes === null) return null;
  if (!times || times.length < 1 || times.length > 24 || !times.every((t) => typeof t === 'string' && TIME.test(t))) return null;
  if (!days || days.length > 7 || !days.every((d) => int(d, 0, 6) !== null)) return null;

  return {
    id,
    name,
    dosage,
    color,
    times: times as string[],
    days: days as number[],
    startDate,
    ...(endDate ? { endDate } : {}),
    ...(notes ? { notes } : {}),
  };
}

function medicines(v: unknown) {
  if (!Array.isArray(v) || v.length > 200) return null;
  const out = v.map(medicine);
  return out.every(Boolean) ? out : null;
}

function logs(v: unknown) {
  if (!isObj(v)) return null;
  const entries = Object.entries(v);
  if (entries.length > 100_000) return null;
  const out: Record<string, { status: 'taken' | 'missed'; at: string }> = {};
  for (const [key, entry] of entries) {
    if (!LOG_KEY.test(key) || !isObj(entry)) return null;
    const { status, at } = entry;
    if (status !== 'taken' && status !== 'missed') return null;
    if (typeof at !== 'string' || at.length > 40 || Number.isNaN(Date.parse(at))) return null;
    out[key] = { status, at };
  }
  return out;
}

function settings(v: unknown) {
  if (!isObj(v)) return null;
  const dueSoonMinutes = int(v.dueSoonMinutes, 5, 120);
  const graceMinutes = int(v.graceMinutes, 5, 240);
  return dueSoonMinutes !== null && graceMinutes !== null ? { dueSoonMinutes, graceMinutes } : null;
}

function customTheme(v: unknown) {
  if (!isObj(v)) return null;
  const { bg, accent } = v;
  return typeof bg === 'string' && HEX.test(bg) && typeof accent === 'string' && HEX.test(accent) ? { bg, accent } : null;
}

function notify(v: unknown) {
  if (!isObj(v)) return null;
  const { push, whatsapp, missedNudge, timeZone } = v;
  const ntfy = v.ntfy ?? false;
  const leadMinutes = int(v.leadMinutes, 0, 60);
  if (typeof push !== 'boolean' || typeof whatsapp !== 'boolean' || typeof ntfy !== 'boolean' || typeof missedNudge !== 'boolean') return null;
  if (leadMinutes === null || !isTimeZone(timeZone)) return null;
  return { push, whatsapp, ntfy, leadMinutes, missedNudge, timeZone };
}

/** Allow-listed per-user data keys, each with a validator that returns a sanitised copy or null. */
export const DATA_VALIDATORS: Record<string, (v: unknown) => unknown> = {
  medicines,
  logs,
  settings,
  theme: (v) => (isThemeId(v) ? v : null),
  customTheme,
  notify,
};

export function parseResetAnswers(v: unknown): ResetAnswers | null {
  if (!isObj(v)) return null;
  const field = (key: string, max: number) => {
    const s = v[key] === undefined ? '' : str(v[key], max);
    return s === null ? null : s.trim();
  };
  const answers = {
    medicines: field('medicines', 300),
    signupWhen: field('signupWhen', 100),
    theme: field('theme', 60),
    contact: field('contact', 120),
    note: field('note', 500),
  };
  if (Object.values(answers).some((a) => a === null)) return null;
  if (!answers.contact) return null;
  return answers as ResetAnswers;
}
