import { formatTime, fromDateKey, WEEKDAYS } from '../schedule';
import type { Medicine } from '../types';
import { EditIcon, TrashIcon } from './Icons';

interface Props {
  medicines: Medicine[];
  onEdit: (med: Medicine) => void;
  onDelete: (med: Medicine) => void;
}

const fmtDate = (key: string) => fromDateKey(key).toLocaleDateString([], { month: 'short', day: 'numeric' });

export function MedicineList({ medicines, onEdit, onDelete }: Props) {
  return (
    <div className="med-list">
      {medicines.map((med) => (
        <article key={med.id} className="med-card clay">
          <div className="dose-swatch" style={{ background: med.color }}>
            <span>{med.name.slice(0, 1).toUpperCase()}</span>
          </div>
          <div className="med-info">
            <h3>{med.name}</h3>
            {med.dosage && <p className="dose-meta">{med.dosage}</p>}
            <div className="time-chips">
              {med.times.map((t) => (
                <span key={t} className="time-chip">{formatTime(t)}</span>
              ))}
            </div>
            <p className="dose-desc">
              {med.times.length}× daily · {med.days.length ? med.days.map((d) => WEEKDAYS[d]).join(', ') : 'Every day'}
              {' · '}from {fmtDate(med.startDate)}
              {med.endDate ? ` to ${fmtDate(med.endDate)}` : ''}
            </p>
            {med.notes && <p className="dose-desc notes">{med.notes}</p>}
          </div>
          <div className="dose-actions">
            <button className="clay-btn icon-btn small" aria-label={`Edit ${med.name}`} onClick={() => onEdit(med)}>
              <EditIcon width={16} height={16} />
            </button>
            <button className="clay-btn icon-btn small danger" aria-label={`Delete ${med.name}`} onClick={() => onDelete(med)}>
              <TrashIcon width={16} height={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
