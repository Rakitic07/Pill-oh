import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTime } from '../schedule';
import { ClockIcon } from './Icons';
import { Popover } from './Popover';

interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const BASE_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const PRESETS = [
  { label: '🌅 Morning', time: '08:00' },
  { label: '☀️ Noon', time: '13:00' },
  { label: '🌇 Evening', time: '18:00' },
  { label: '🌙 Night', time: '21:00' },
];

const pad = (n: number) => String(n).padStart(2, '0');

function parse(value: string) {
  const [h, m] = (value || '08:00').split(':').map(Number);
  return { hour12: h % 12 || 12, minute: m, pm: h >= 12 };
}

function build(hour12: number, minute: number, pm: boolean) {
  return `${pad((hour12 % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
}

export function TimePicker({ value, onChange, ariaLabel }: Props) {
  const anchor = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { hour12, minute, pm } = parse(value);

  const minutes = BASE_MINUTES.includes(minute) ? BASE_MINUTES : [...BASE_MINUTES, minute].sort((a, b) => a - b);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      body.current?.querySelectorAll<HTMLElement>('.tp-col').forEach((col) => {
        const sel = col.querySelector<HTMLElement>('.selected');
        if (sel) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`picker-trigger clay-input ${open ? 'open' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{formatTime(value)}</span>
        <ClockIcon width={18} height={18} />
      </button>

      <Popover anchor={anchor} open={open} onClose={close} className="time-pop">
        <div ref={body}>
          <div className="tp-display clay-inset">
            <span>{pad(hour12)}</span>
            <span className="tp-colon">:</span>
            <span>{pad(minute)}</span>
            <span className="tp-ampm">{pm ? 'PM' : 'AM'}</span>
          </div>

          <div className="tp-cols">
            <div className="tp-col" role="listbox" aria-label="Hour">
              {HOURS.map((h) => (
                <button type="button" key={h} className={h === hour12 ? 'selected' : ''} onClick={() => onChange(build(h, minute, pm))}>
                  {pad(h)}
                </button>
              ))}
            </div>
            <div className="tp-col" role="listbox" aria-label="Minute">
              {minutes.map((m) => (
                <button type="button" key={m} className={m === minute ? 'selected' : ''} onClick={() => onChange(build(hour12, m, pm))}>
                  {pad(m)}
                </button>
              ))}
            </div>
            <div className="tp-col tp-meridiem" role="listbox" aria-label="AM or PM">
              {[false, true].map((isPm) => (
                <button type="button" key={String(isPm)} className={isPm === pm ? 'selected' : ''} onClick={() => onChange(build(hour12, minute, isPm))}>
                  {isPm ? 'PM' : 'AM'}
                </button>
              ))}
            </div>
          </div>

          <div className="tp-presets">
            {PRESETS.map((p) => (
              <button type="button" key={p.time} className={`chip ${p.time === value ? 'active' : ''}`} onClick={() => onChange(p.time)}>
                {p.label}
              </button>
            ))}
          </div>

          <button type="button" className="clay-btn primary pop-done" onClick={close}>Done</button>
        </div>
      </Popover>
    </>
  );
}
