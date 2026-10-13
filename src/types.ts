export interface Medicine {
  id: string;
  name: string;
  dosage: string;
  /** Daily dose times as "HH:MM" (24h). */
  times: string[];
  /** Weekdays (0 = Sunday … 6 = Saturday). Empty means every day. */
  days: number[];
  color: string;
  notes?: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "YYYY-MM-DD", inclusive. */
  endDate?: string;
}

export type LoggedStatus = 'taken' | 'missed';

export interface DoseLog {
  status: LoggedStatus;
  /** ISO timestamp of when the user recorded this. */
  at: string;
}

/** Keyed by `${dateKey}|${medicineId}|${time}`. */
export type DoseLogs = Record<string, DoseLog>;

export type DoseStatus = 'upcoming' | 'due-soon' | 'due-now' | 'missed' | 'taken';

export interface Dose {
  key: string;
  med: Medicine;
  time: string;
  scheduledAt: Date;
  status: DoseStatus;
  log?: DoseLog;
}

export interface Settings {
  /** How many minutes before a dose it turns "due soon". */
  dueSoonMinutes: number;
  /** How many minutes after a dose it is auto-marked missed. */
  graceMinutes: number;
}
