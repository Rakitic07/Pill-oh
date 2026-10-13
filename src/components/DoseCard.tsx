import { formatClock, formatDuration, formatTime, MINUTE, timingOf, toDateKey, type Timing } from '../schedule';
import type { Dose, Settings } from '../types';
import { CheckIcon, ClockIcon, CrossIcon, UndoIcon } from './Icons';

interface Props {
  dose: Dose;
  now: Date;
  settings: Settings;
  locked: boolean;
  onTake: () => void;
  onMiss: () => void;
  onReset: () => void;
  /** Opens "When did you take it?" to record a late/early time. */
  onPickTime: () => void;
}

const TIMING_LABEL: Record<Timing, string> = { onTime: 'Taken', late: 'Taken late', early: 'Taken early' };

function describe(dose: Dose, now: Date, settings: Settings): string {
  const diff = dose.scheduledAt.getTime() - now.getTime();
  switch (dose.status) {
    case 'upcoming':
      return `In ${formatDuration(diff)}`;
    case 'due-soon':
      return `Due in ${formatDuration(diff)}`;
    case 'due-now':
      return diff > -MINUTE ? 'Take it now' : `Take now · ${formatDuration(diff)} past`;
    case 'missed':
      return dose.log ? 'Marked as missed' : 'Missed · auto-marked';
    case 'taken': {
      const at = new Date(dose.log!.at);
      const timing = timingOf(dose.scheduledAt, at, settings.graceMinutes);
      const gap = formatDuration(at.getTime() - dose.scheduledAt.getTime());
      const sameDay = toDateKey(at) === toDateKey(dose.scheduledAt);
      const when = sameDay
        ? formatClock(at)
        : `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${formatClock(at)}`;
      return `Taken at ${when}${timing === 'late' ? ` · ${gap} late` : timing === 'early' ? ` · ${gap} early` : ''}`;
    }
  }
}

const STATUS_LABEL: Record<Dose['status'], string> = {
  upcoming: 'Upcoming',
  'due-soon': 'Due soon',
  'due-now': 'Due now',
  missed: 'Missed',
  taken: 'Taken',
};

export function DoseCard({ dose, now, settings, locked, onTake, onMiss, onReset, onPickTime }: Props) {
  const { med, status } = dose;
  const taken = status === 'taken';
  const missed = status === 'missed';
  const timing = taken && dose.log ? timingOf(dose.scheduledAt, new Date(dose.log.at), settings.graceMinutes) : null;

  const mainLabel = taken ? 'Undo — mark as not taken' : missed ? 'I took it late — choose when' : 'Mark as taken';

  return (
    <article className={`dose-card clay status-${status} ${timing && timing !== 'onTime' ? `timing-${timing}` : ''}`}>
      <div className="dose-swatch" style={{ background: med.color }}>
        <span>{med.name.slice(0, 1).toUpperCase()}</span>
      </div>

      <div className="dose-info">
        <div className="dose-title">
          <h3>{med.name}</h3>
          <span className="status-chip">{timing ? TIMING_LABEL[timing] : STATUS_LABEL[status]}</span>
        </div>
        <p className="dose-meta">
          <ClockIcon width={14} height={14} />
          <span>{formatTime(dose.time)}</span>
          {med.dosage && <span className="dot">•</span>}
          {med.dosage && <span>{med.dosage}</span>}
        </p>
        <p className="dose-desc">{describe(dose, now, settings)}</p>
      </div>

      <div className="dose-actions">
        {!locked && (
          <button
            className="clay-btn icon-btn small"
            title={taken ? 'Change when you took it' : 'Took it at a different time?'}
            aria-label={taken ? 'Change when you took it' : 'Record the time you took it'}
            onClick={onPickTime}
          >
            <ClockIcon width={16} height={16} />
          </button>
        )}
        {!locked && !taken && !missed && (
          <button className="clay-btn icon-btn small" title="Mark as missed" aria-label="Mark as missed" onClick={onMiss}>
            <CrossIcon width={16} height={16} />
          </button>
        )}
        {!locked && dose.log && missed && (
          <button className="clay-btn icon-btn small" title="Reset to automatic" aria-label="Reset to automatic" onClick={onReset}>
            <UndoIcon width={16} height={16} />
          </button>
        )}
        <button
          className="check-btn"
          disabled={locked}
          title={locked ? 'Future doses can’t be marked yet' : mainLabel}
          aria-label={mainLabel}
          aria-pressed={taken}
          onClick={taken ? onReset : missed ? onPickTime : onTake}
        >
          {missed ? <CrossIcon /> : <CheckIcon />}
          {timing && timing !== 'onTime' && (
            <span className="timing-badge" aria-hidden="true">
              <ClockIcon width={11} height={11} />
            </span>
          )}
        </button>
      </div>
    </article>
  );
}
