import { useCallback, useRef, useState } from 'react';
import { fromDateKey, toDateKey, WEEKDAYS } from '../schedule';
import { CalendarIcon, ChevronIcon } from './Icons';
import { Popover } from './Popover';

interface Props {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  clearable?: boolean;
  /** "field" renders an input-like trigger; "icon" renders a round calendar button. */
  variant?: 'field' | 'icon';
  ariaLabel?: string;
}

const fmt = (key: string) =>
  fromDateKey(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export function DatePicker({ value, onChange, min, placeholder = 'Pick a date', clearable, variant = 'field', ariaLabel }: Props) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => fromDateKey(value || toDateKey(new Date())));
  const close = useCallback(() => setOpen(false), []);
  const today = toDateKey(new Date());

  const toggle = () => {
    if (!open) setView(fromDateKey(value || today));
    setOpen((o) => !o);
  };

  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - first.getDay() + i));
  const shiftMonth = (n: number) => setView(new Date(year, month + n, 1));

  const pick = (key: string) => {
    onChange(key);
    close();
  };

  return (
    <>
      {variant === 'icon' ? (
        <button ref={anchor} type="button" className="clay-btn icon-btn" aria-label={ariaLabel ?? 'Open calendar'} aria-expanded={open} onClick={toggle}>
          <CalendarIcon />
        </button>
      ) : (
        <button
          ref={anchor}
          type="button"
          className={`picker-trigger clay-input ${open ? 'open' : ''} ${value ? '' : 'placeholder'}`}
          aria-label={ariaLabel}
          aria-expanded={open}
          onClick={toggle}
        >
          <span>{value ? fmt(value) : placeholder}</span>
          <CalendarIcon width={18} height={18} />
        </button>
      )}

      <Popover anchor={anchor} open={open} onClose={close} className="cal-pop" align={variant === 'icon' ? 'end' : 'start'}>
        <div className="cal-head">
          <button type="button" className="clay-btn icon-btn small" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronIcon dir="left" width={16} height={16} />
          </button>
          <strong>{view.toLocaleDateString([], { month: 'long', year: 'numeric' })}</strong>
          <button type="button" className="clay-btn icon-btn small" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <ChevronIcon width={16} height={16} />
          </button>
        </div>

        <div className="cal-grid">
          {WEEKDAYS.map((d) => (
            <span key={d} className="cal-wd">{d.slice(0, 2)}</span>
          ))}
          {cells.map((d) => {
            const key = toDateKey(d);
            const disabled = !!min && key < min;
            const cls = [
              'cal-day',
              d.getMonth() !== month && 'outside',
              key === today && 'today',
              key === value && 'selected',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button type="button" key={key} className={cls} disabled={disabled} onClick={() => pick(key)}>
                {d.getDate()}
              </button>
            );
          })}
        </div>

        <div className="cal-foot">
          <button type="button" className="chip" disabled={!!min && today < min} onClick={() => pick(today)}>Today</button>
          {clearable && value && (
            <button type="button" className="chip" onClick={() => pick('')}>Clear</button>
          )}
        </div>
      </Popover>
    </>
  );
}
