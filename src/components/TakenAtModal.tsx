import { useState } from 'react';
import { addDays, atTime, formatClock, formatDuration, formatTime, MINUTE, timingOf, toDateKey } from '../schedule';
import type { Dose, Settings } from '../types';
import { Modal } from './Modal';
import { TimePicker } from './TimePicker';

interface Props {
  dose: Dose;
  now: Date;
  settings: Settings;
  onSave: (takenAt: Date) => void;
  onClose: () => void;
}

type Choice = 'on-time' | 'now' | 'custom';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** A picked clock time for this dose; times well before the schedule are taken to mean after midnight. */
function resolveTime(dose: Dose, time: string): Date {
  const dateKey = toDateKey(dose.scheduledAt);
  const at = atTime(dateKey, time);
  return at.getTime() < dose.scheduledAt.getTime() - 3 * 60 * MINUTE ? atTime(addDays(dateKey, 1), time) : at;
}

export function TakenAtModal({ dose, now, settings, onSave, onClose }: Props) {
  const past = now.getTime() - dose.scheduledAt.getTime() > settings.graceMinutes * MINUTE;
  const initial = dose.log?.status === 'taken' ? new Date(dose.log.at) : past ? now : dose.scheduledAt;
  const [choice, setChoice] = useState<Choice>(dose.log?.status === 'taken' ? 'custom' : past ? 'custom' : 'on-time');
  const [time, setTime] = useState(hhmm(initial));

  const takenAt = choice === 'on-time' ? dose.scheduledAt : choice === 'now' ? now : resolveTime(dose, time);
  const inFuture = takenAt.getTime() > now.getTime() + MINUTE;
  const timing = timingOf(dose.scheduledAt, takenAt, settings.graceMinutes);
  const gap = formatDuration(takenAt.getTime() - dose.scheduledAt.getTime());
  const dayNote = toDateKey(takenAt) !== toDateKey(dose.scheduledAt) ? ' (next day)' : '';

  return (
    <Modal title={`When did you take ${dose.med.name}?`} onClose={onClose}>
      <div className="form">
        <p className="muted">Scheduled for {formatTime(dose.time)}.</p>

        <div className="taken-choices">
          <button type="button" className={`chip ${choice === 'on-time' ? 'active' : ''}`} onClick={() => setChoice('on-time')}>
            ✅ On time · {formatTime(dose.time)}
          </button>
          <button type="button" className={`chip ${choice === 'now' ? 'active' : ''}`} onClick={() => setChoice('now')}>
            🕒 Just now · {formatClock(now)}
          </button>
          <button type="button" className={`chip ${choice === 'custom' ? 'active' : ''}`} onClick={() => setChoice('custom')}>
            ✏️ Pick a time
          </button>
        </div>

        {choice === 'custom' && (
          <label className="field">
            <span>Taken at</span>
            <TimePicker value={time} onChange={setTime} ariaLabel="Time you took it" />
          </label>
        )}

        <div className={`timing-preview clay-inset timing-${inFuture ? 'future' : timing}`}>
          {inFuture
            ? 'That time hasn’t happened yet.'
            : timing === 'onTime'
              ? `Counts as on time · ${formatClock(takenAt)}${dayNote}`
              : timing === 'late'
                ? `Counts as late · ${gap} after schedule${dayNote}`
                : `Counts as early · ${gap} before schedule`}
        </div>

        <div className="form-actions">
          <button type="button" className="clay-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="clay-btn primary" disabled={inFuture} onClick={() => onSave(takenAt)}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
