import type { Dose, DoseLog, DoseLogs, DoseStatus, Medicine, Settings } from './types.ts';

export const MINUTE = 60_000;

export const DEFAULT_SETTINGS: Settings = { dueSoonMinutes: 30, graceMinutes: 30 };

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function atTime(dateKey: string, time: string): Date {
  const d = fromDateKey(dateKey);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export const doseKey = (dateKey: string, medId: string, time: string) =>
  `${dateKey}|${medId}|${time}`;

export function isScheduledOn(med: Medicine, dateKey: string): boolean {
  if (dateKey < med.startDate) return false;
  if (med.endDate && dateKey > med.endDate) return false;
  if (med.days.length === 0) return true;
  return med.days.includes(fromDateKey(dateKey).getDay());
}

export function computeStatus(
  scheduledAt: Date,
  now: Date,
  log: DoseLog | undefined,
  settings: Settings,
): DoseStatus {
  if (log) return log.status;
  const diff = scheduledAt.getTime() - now.getTime();
  if (diff < -settings.graceMinutes * MINUTE) return 'missed';
  if (diff <= 0) return 'due-now';
  if (diff <= settings.dueSoonMinutes * MINUTE) return 'due-soon';
  return 'upcoming';
}

export type Timing = 'early' | 'onTime' | 'late';

/** How a taken dose compares with its schedule; within ±grace counts as on time. */
export function timingOf(scheduledAt: Date, takenAt: Date, graceMinutes: number): Timing {
  const delay = takenAt.getTime() - scheduledAt.getTime();
  const grace = graceMinutes * MINUTE;
  return delay > grace ? 'late' : delay < -grace ? 'early' : 'onTime';
}

export function getDosesForDate(
  meds: Medicine[],
  logs: DoseLogs,
  dateKey: string,
  now: Date,
  settings: Settings,
): Dose[] {
  const doses: Dose[] = [];
  for (const med of meds) {
    if (!isScheduledOn(med, dateKey)) continue;
    for (const time of med.times) {
      const key = doseKey(dateKey, med.id, time);
      const scheduledAt = atTime(dateKey, time);
      const log = logs[key];
      doses.push({ key, med, time, scheduledAt, log, status: computeStatus(scheduledAt, now, log, settings) });
    }
  }
  return doses.sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.med.name.localeCompare(b.med.name),
  );
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return formatClock(new Date(2000, 0, 1, h, m));
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(Math.abs(ms) / MINUTE));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function periodOf(time: string): string {
  const h = Number(time.split(':')[0]);
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}

/** Evenly spread `n` dose times between 08:00 and 22:00, rounded to 15 minutes. */
export function defaultTimes(n: number): string[] {
  if (n <= 1) return ['08:00'];
  const start = 8 * 60;
  const span = 14 * 60;
  return Array.from({ length: n }, (_, i) => {
    const mins = Math.round((start + (span * i) / (n - 1)) / 15) * 15;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  });
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
