import { addDays, getDosesForDate, MINUTE, periodOf, timingOf, toDateKey } from './schedule';
import type { Dose, DoseLogs, Medicine, Settings } from './types';

export interface Tally {
  onTime: number;
  early: number;
  late: number;
  missed: number;
}

export interface DayReport {
  key: string;
  tally: Tally;
}

export interface Report {
  days: DayReport[];
  total: Tally;
  /** Signed minutes between scheduled and actual time for every taken dose. */
  delays: number[];
  byMed: { med: Medicine; tally: Tally }[];
  byPeriod: { period: string; tally: Tally }[];
  currentStreak: number;
  bestStreak: number;
}

export const PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];
const STREAK_LOOKBACK_DAYS = 365;

const emptyTally = (): Tally => ({ onTime: 0, early: 0, late: 0, missed: 0 });
export const takenOf = (t: Tally) => t.onTime + t.early + t.late;
export const resolvedOf = (t: Tally) => takenOf(t) + t.missed;
export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
export const adherenceOf = (t: Tally) => pct(takenOf(t), resolvedOf(t));
export const punctualityOf = (t: Tally) => pct(t.onTime, takenOf(t));

function classify(dose: Dose, graceMs: number): { kind: keyof Tally; delay?: number } | null {
  if (dose.status === 'missed') return { kind: 'missed' };
  if (dose.status !== 'taken' || !dose.log) return null;
  const takenAt = new Date(dose.log.at);
  const kind = timingOf(dose.scheduledAt, takenAt, graceMs / MINUTE);
  return { kind, delay: (takenAt.getTime() - dose.scheduledAt.getTime()) / MINUTE };
}

type DayState = 'perfect' | 'broken' | 'skip';

function dayState(doses: Dose[], isToday: boolean): DayState {
  if (doses.length === 0) return 'skip';
  if (doses.some((d) => d.status === 'missed')) return 'broken';
  if (doses.every((d) => d.status === 'taken')) return 'perfect';
  return isToday ? 'skip' : 'broken';
}

export function buildReport(
  meds: Medicine[],
  logs: DoseLogs,
  settings: Settings,
  now: Date,
  rangeDays: number,
): Report {
  const today = toDateKey(now);
  const graceMs = settings.graceMinutes * MINUTE;
  const earliest = meds.reduce((min, m) => (m.startDate < min ? m.startDate : min), today);

  const total = emptyTally();
  const delays: number[] = [];
  const byMed = new Map<string, Tally>();
  const byPeriod = new Map<string, Tally>(PERIODS.map((p) => [p, emptyTally()]));
  const days: DayReport[] = [];

  for (let i = rangeDays - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    const tally = emptyTally();
    for (const dose of getDosesForDate(meds, logs, key, now, settings)) {
      const result = classify(dose, graceMs);
      if (!result) continue;
      tally[result.kind]++;
      total[result.kind]++;
      if (result.delay !== undefined) delays.push(result.delay);
      if (!byMed.has(dose.med.id)) byMed.set(dose.med.id, emptyTally());
      byMed.get(dose.med.id)![result.kind]++;
      byPeriod.get(periodOf(dose.time))![result.kind]++;
    }
    days.push({ key, tally });
  }

  // Streaks: consecutive days where every scheduled dose was taken. Days with nothing scheduled are skipped.
  const lookback = Math.min(STREAK_LOOKBACK_DAYS, Math.max(0, daysBetween(earliest, today)));
  const states: DayState[] = [];
  for (let i = lookback; i >= 0; i--) {
    const key = addDays(today, -i);
    states.push(dayState(getDosesForDate(meds, logs, key, now, settings), key === today));
  }

  let bestStreak = 0;
  let run = 0;
  for (const s of states) {
    if (s === 'perfect') bestStreak = Math.max(bestStreak, ++run);
    else if (s === 'broken') run = 0;
  }

  let currentStreak = 0;
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i] === 'broken') break;
    if (states[i] === 'perfect') currentStreak++;
  }

  return {
    days,
    total,
    delays,
    byMed: meds.map((med) => ({ med, tally: byMed.get(med.id) ?? emptyTally() })),
    byPeriod: PERIODS.map((period) => ({ period, tally: byPeriod.get(period)! })),
    currentStreak,
    bestStreak,
  };
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function gradeFor(score: number): { letter: string; tone: string; message: string } {
  if (score >= 95) return { letter: 'A+', tone: 'great', message: 'Outstanding! You’re a medication pro.' };
  if (score >= 90) return { letter: 'A', tone: 'great', message: 'Excellent consistency — keep it up!' };
  if (score >= 80) return { letter: 'B', tone: 'good', message: 'Great job, just a few slips here and there.' };
  if (score >= 70) return { letter: 'C', tone: 'ok', message: 'Decent, but there’s room to be more regular.' };
  if (score >= 60) return { letter: 'D', tone: 'poor', message: 'Several doses slipped — try setting reminders.' };
  return { letter: 'F', tone: 'poor', message: 'Lots of missed doses. Let’s get back on track!' };
}
