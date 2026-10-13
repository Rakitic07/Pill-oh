import { useMemo, useState } from 'react';
import { PERIOD_KINDS, periodOptions, periodRange, type PeriodKind } from '../reportPeriods';
import { toDateKey } from '../schedule';
import type { DoseLogs, Medicine, Settings } from '../types';
import { DatePicker } from './DatePicker';

interface Props {
  username: string;
  medicines: Medicine[];
  logs: DoseLogs;
  settings?: Partial<Settings> | null;
  now: Date;
}

export function ReportDownload({ username, medicines, logs, settings, now }: Props) {
  const today = toDateKey(now);
  const earliest = medicines.reduce((min, m) => (m.startDate < min ? m.startDate : min), today);
  const [kind, setKind] = useState<PeriodKind>('monthly');
  const [day, setDay] = useState(today);
  const months = useMemo(() => periodOptions('monthly', today, earliest), [today, earliest]);
  const quarters = useMemo(() => periodOptions('quarterly', today, earliest), [today, earliest]);
  const [month, setMonth] = useState(months[0].value);
  const [quarter, setQuarter] = useState(quarters[0].value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const anchor = kind === 'daily' ? day : kind === 'monthly' ? month : quarter;

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const { downloadReportPdf } = await import('../pdfReport');
      downloadReportPdf({ username, medicines, logs, settings, now, period: periodRange(kind, anchor, today) });
    } catch (err) {
      console.error(err);
      setError('Couldn’t create the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chart-card clay report-download">
      <div className="card-head">
        <h3>📄 Download report</h3>
        <nav className="tabs clay-inset mini-tabs">
          {PERIOD_KINDS.map((p) => (
            <button key={p.id} type="button" className={kind === p.id ? 'active' : ''} onClick={() => setKind(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="inline-form">
        {kind === 'daily' ? (
          <DatePicker value={day} onChange={(v) => v && setDay(v > today ? today : v)} min={earliest} ariaLabel="Report day" />
        ) : (
          <select
            className="clay-input"
            aria-label={kind === 'monthly' ? 'Report month' : 'Report quarter'}
            value={kind === 'monthly' ? month : quarter}
            onChange={(e) => (kind === 'monthly' ? setMonth : setQuarter)(e.target.value)}
          >
            {(kind === 'monthly' ? months : quarters).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        <button type="button" className="clay-btn primary" disabled={busy} onClick={download}>
          {busy ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
