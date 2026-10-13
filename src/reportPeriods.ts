import { fromDateKey, toDateKey } from './schedule';

export type PeriodKind = 'daily' | 'monthly' | 'quarterly';

export interface PeriodRange {
  kind: PeriodKind;
  /** Inclusive "YYYY-MM-DD" bounds; `to` never goes past today. */
  from: string;
  to: string;
  label: string;
  /** Short, filename-safe tag such as 2026-10, 2026-Q4 or 2026-10-14. */
  tag: string;
}

export const PERIOD_KINDS: { id: PeriodKind; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
];

const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
const minKey = (a: string, b: string) => (a < b ? a : b);

/** `anchor` is a date key for daily, "YYYY-MM" for monthly and "YYYY-Qn" for quarterly. */
export function periodRange(kind: PeriodKind, anchor: string, today: string): PeriodRange {
  if (kind === 'daily') {
    const day = minKey(anchor, today);
    const label = fromDateKey(day).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return { kind, from: day, to: day, label, tag: day };
  }
  if (kind === 'monthly') {
    const [y, m] = anchor.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { kind, from: toDateKey(first), to: minKey(toDateKey(last), today), label, tag: anchor };
  }
  const [y, q] = anchor.split('-Q').map(Number);
  const first = new Date(y, (q - 1) * 3, 1);
  const last = new Date(y, q * 3, 0);
  const label = `Q${q} ${y} (${monthName(first)} - ${monthName(last)})`;
  return { kind, from: toDateKey(first), to: minKey(toDateKey(last), today), label, tag: anchor };
}

/** Selectable months / quarters, newest first, going back to `earliest` (at most 2 years). */
export function periodOptions(kind: Exclude<PeriodKind, 'daily'>, today: string, earliest: string): { value: string; label: string }[] {
  const now = fromDateKey(today);
  const start = fromDateKey(earliest < today ? earliest : today);
  const out: { value: string; label: string }[] = [];
  if (kind === 'monthly') {
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      if (i > 0 && d < new Date(start.getFullYear(), start.getMonth(), 1)) break;
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ value, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
    }
    return out;
  }
  const startQ = start.getFullYear() * 4 + Math.floor(start.getMonth() / 3);
  for (let i = 0; i < 8; i++) {
    const idx = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) - i;
    if (i > 0 && idx < startQ) break;
    const y = Math.floor(idx / 4);
    const q = (idx % 4) + 1;
    out.push({ value: `${y}-Q${q}`, label: periodRange('quarterly', `${y}-Q${q}`, '9999-12-31').label });
  }
  return out;
}
