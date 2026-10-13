import { addDays, toDateKey, uid } from './schedule';
import type { Medicine } from './types';

function offsetTime(now: Date, minutes: number): string {
  const d = new Date(now.getTime() + minutes * 60_000);
  if (d.getDate() !== now.getDate()) d.setTime(now.getTime());
  const m = Math.round(d.getMinutes() / 5) * 5;
  d.setMinutes(m, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Demo medicines with times relative to now so every status colour is visible. */
export function sampleMedicines(now: Date): Medicine[] {
  const today = toDateKey(now);
  const start = addDays(today, -6);
  return [
    {
      id: uid(),
      name: 'Metformin',
      dosage: '500 mg · 1 tablet',
      times: ['08:00', '20:00'],
      days: [],
      color: '#a8d8ff',
      notes: 'Take after meals',
      startDate: start,
    },
    {
      id: uid(),
      name: 'Vitamin D3',
      dosage: '1000 IU · 1 capsule',
      times: [offsetTime(now, 20)],
      days: [],
      color: '#ffe08a',
      startDate: start,
    },
    {
      id: uid(),
      name: 'Amoxicillin',
      dosage: '250 mg · 1 capsule',
      times: [offsetTime(now, -90), offsetTime(now, -5), '22:00'].filter(
        (t, i, arr) => arr.indexOf(t) === i,
      ),
      days: [],
      color: '#ffb8c9',
      notes: '7-day course',
      startDate: start,
      endDate: addDays(today, 3),
    },
    {
      id: uid(),
      name: 'Omega-3',
      dosage: '1 softgel',
      times: ['13:00'],
      days: [1, 3, 5],
      color: '#b9f0d4',
      startDate: start,
    },
  ];
}
