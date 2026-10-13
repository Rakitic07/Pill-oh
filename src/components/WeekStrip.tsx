import { memo, useMemo, useState } from 'react';
import { addDays, fromDateKey, getDosesForDate, WEEKDAYS } from '../schedule';
import type { DoseLogs, Medicine, Settings } from '../types';
import { ChevronIcon } from './Icons';

interface Props {
  selected: string;
  today: string;
  medicines: Medicine[];
  logs: DoseLogs;
  now: Date;
  settings: Settings;
  onSelect: (dateKey: string) => void;
}

export const WeekStrip = memo(function WeekStrip({ selected, today, medicines, logs, now, settings, onSelect }: Props) {
  const monday = addDays(selected, -((fromDateKey(selected).getDay() + 6) % 7));

  // Remembers which way the week moved so the new week slides in from that side.
  const [slide, setSlide] = useState({ monday, dir: '' });
  if (slide.monday !== monday) setSlide({ monday, dir: monday > slide.monday ? 'next' : 'prev' });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(monday, i);
      const doses = getDosesForDate(medicines, logs, key, now, settings);
      const anyMissed = doses.some((d) => d.status === 'missed');
      const allTaken = doses.length > 0 && doses.every((d) => d.status === 'taken');
      return { key, date: fromDateKey(key), mark: anyMissed ? 'missed' : allTaken ? 'taken' : doses.length ? 'pending' : '' };
    });
  }, [monday, medicines, logs, now, settings]);

  return (
    <div className="week clay">
      <button className="clay-btn icon-btn" aria-label="Previous week" onClick={() => onSelect(addDays(selected, -7))}>
        <ChevronIcon dir="left" />
      </button>

      <div className="week-viewport">
      <div className={`week-days ${slide.dir ? `slide-${slide.dir}` : ''}`} key={monday}>
        {days.map(({ key, date, mark }) => {
          return (
            <button
              key={key}
              className={`day ${key === selected ? 'selected' : ''} ${key === today ? 'today' : ''}`}
              onClick={() => onSelect(key)}
            >
              <span className="day-name">{WEEKDAYS[date.getDay()]}</span>
              <span className="day-num">{date.getDate()}</span>
              <span className={`day-dot ${mark}`} />
            </button>
          );
        })}
      </div>
      </div>

      <button className="clay-btn icon-btn" aria-label="Next week" onClick={() => onSelect(addDays(selected, 7))}>
        <ChevronIcon />
      </button>
    </div>
  );
});
