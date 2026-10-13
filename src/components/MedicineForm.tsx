import { useState, type FormEvent } from 'react';
import { defaultTimes, toDateKey, uid, WEEKDAYS } from '../schedule';
import type { Medicine } from '../types';
import { DatePicker } from './DatePicker';
import { CrossIcon, PlusIcon } from './Icons';
import { Modal } from './Modal';
import { TimePicker } from './TimePicker';

const COLORS = ['#a8d8ff', '#ffb8c9', '#b9f0d4', '#ffe08a', '#d4c4ff', '#ffc89e', '#9ee6e0', '#f5b8ff'];
const PRESETS = [
  { label: 'Once', n: 1 },
  { label: 'Twice', n: 2 },
  { label: '3 times', n: 3 },
  { label: '4 times', n: 4 },
];

interface Props {
  initial?: Medicine;
  onSave: (med: Medicine) => void;
  onClose: () => void;
}

export function MedicineForm({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [dosage, setDosage] = useState(initial?.dosage ?? '');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [times, setTimes] = useState<string[]>(initial?.times ?? defaultTimes(1));
  const [days, setDays] = useState<number[]>(initial?.days ?? []);
  const [startDate, setStartDate] = useState(initial?.startDate ?? toDateKey(new Date()));
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');

  const everyDay = days.length === 0;

  const toggleDay = (d: number) =>
    setDays((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort();
      return next.length === 7 ? [] : next;
    });

  const updateTime = (i: number, value: string) =>
    setTimes((prev) => prev.map((t, j) => (j === i ? value : t)));

  const addTime = () =>
    setTimes((prev) => {
      const last = prev[prev.length - 1] ?? '08:00';
      const [h, m] = last.split(':').map(Number);
      const next = Math.min(h + 2, 23);
      return [...prev, `${String(next).padStart(2, '0')}:${String(m).padStart(2, '0')}`];
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleanTimes = [...new Set(times.filter(Boolean))].sort();
    if (!name.trim()) return setError('Please enter a medicine name.');
    if (cleanTimes.length === 0) return setError('Add at least one dose time.');
    if (endDate && endDate < startDate) return setError('End date must be on or after the start date.');

    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      dosage: dosage.trim(),
      color,
      times: cleanTimes,
      days,
      startDate,
      endDate: endDate || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? 'Edit medicine' : 'Add medicine'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Medicine name</span>
          <input className="clay-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Metformin" autoFocus />
        </label>

        <label className="field">
          <span>Dosage</span>
          <input className="clay-input" value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 500 mg · 1 tablet" />
        </label>

        <div className="field">
          <span>Colour</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch ${c === color ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span>How many times a day?</span>
          <div className="chips">
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p.n}
                className={`chip ${times.length === p.n ? 'active' : ''}`}
                onClick={() => setTimes(defaultTimes(p.n))}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="times">
            {times.map((t, i) => (
              <div className="time-row" key={i}>
                <span className="time-index">Dose {i + 1}</span>
                <TimePicker value={t} onChange={(v) => updateTime(i, v)} ariaLabel={`Dose ${i + 1} time`} />
                {times.length > 1 && (
                  <button
                    type="button"
                    className="clay-btn icon-btn small"
                    aria-label={`Remove dose ${i + 1}`}
                    onClick={() => setTimes((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <CrossIcon width={14} height={14} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="clay-btn ghost" onClick={addTime}>
              <PlusIcon width={16} height={16} /> Add another time
            </button>
          </div>
        </div>

        <div className="field">
          <span>Which days?</span>
          <div className="chips">
            <button type="button" className={`chip ${everyDay ? 'active' : ''}`} onClick={() => setDays([])}>
              Every day
            </button>
            {WEEKDAYS.map((d, i) => (
              <button
                type="button"
                key={d}
                className={`chip ${!everyDay && days.includes(i) ? 'active' : ''}`}
                onClick={() => toggleDay(i)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="row-2">
          <div className="field">
            <span>Start date</span>
            <DatePicker value={startDate} onChange={setStartDate} ariaLabel="Start date" />
          </div>
          <div className="field">
            <span>End date (optional)</span>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              min={startDate}
              clearable
              placeholder="No end date"
              ariaLabel="End date"
            />
          </div>
        </div>

        <label className="field">
          <span>Notes</span>
          <input className="clay-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. after breakfast" />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="clay-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="clay-btn primary">{initial ? 'Save changes' : 'Add medicine'}</button>
        </div>
      </form>
    </Modal>
  );
}
