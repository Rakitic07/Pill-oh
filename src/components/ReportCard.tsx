import { memo, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import {
  adherenceOf,
  buildReport,
  gradeFor,
  pct,
  punctualityOf,
  resolvedOf,
  scoreOf,
  takenOf,
  type DayReport,
  type Tally,
} from '../report';
import { fromDateKey, WEEKDAYS } from '../schedule';
import type { DoseLogs, Medicine, Settings } from '../types';
import { ReportDownload } from './ReportDownload';

interface Props {
  username: string;
  medicines: Medicine[];
  logs: DoseLogs;
  settings: Settings;
  now: Date;
}

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const shortDate = (key: string) => fromDateKey(key).toLocaleDateString([], { month: 'short', day: 'numeric' });

function sumTallies(days: DayReport[]): Tally {
  return days.reduce(
    (acc, d) => ({
      onTime: acc.onTime + d.tally.onTime,
      early: acc.early + d.tally.early,
      late: acc.late + d.tally.late,
      missed: acc.missed + d.tally.missed,
    }),
    { onTime: 0, early: 0, late: 0, missed: 0 },
  );
}

function formatDelay(mins: number): string {
  const m = Math.round(Math.abs(mins));
  if (m < 1) return 'Right on time';
  const text = m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  return mins > 0 ? `${text} late` : `${text} early`;
}

function BarChart({ days, range }: { days: DayReport[]; range: number }) {
  const groups = useMemo(() => {
    const size = range > 31 ? 7 : 1;
    const out: { label: string; title: string; tally: Tally }[] = [];
    for (let i = 0; i < days.length; i += size) {
      const chunk = days.slice(i, i + size);
      const first = chunk[0].key;
      const d = fromDateKey(first);
      const label =
        size > 1 ? shortDate(first) : range <= 7 ? WEEKDAYS[d.getDay()] : i % 5 === 0 || i === days.length - 1 ? String(d.getDate()) : '';
      const title = size > 1 ? `Week of ${shortDate(first)}` : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      out.push({ label, title, tally: sumTallies(chunk) });
    }
    return out;
  }, [days, range]);

  const max = Math.max(1, ...groups.map((g) => resolvedOf(g.tally)));

  return (
    <div className={`bar-chart ${groups.length > 14 ? 'dense' : ''}`}>
      {groups.map((g, i) => {
        const t = g.tally;
        const resolved = resolvedOf(t);
        const height = (resolved / max) * 100;
        const tip = resolved
          ? `${g.title}: ${t.onTime + t.early} on time, ${t.late} late, ${t.missed} missed`
          : `${g.title}: no doses`;
        return (
          <div className="bar-col" key={i} title={tip}>
            {groups.length <= 14 && <span className="bar-value">{resolved ? `${adherenceOf(t)}%` : ''}</span>}
            <div className="bar-track clay-inset">
              <div className="bar-fill" style={{ height: `${height}%` }}>
                {t.missed > 0 && <span className="seg missed" style={{ flexGrow: t.missed }} />}
                {t.late > 0 && <span className="seg late" style={{ flexGrow: t.late }} />}
                {t.onTime + t.early > 0 && <span className="seg ontime" style={{ flexGrow: t.onTime + t.early }} />}
              </div>
            </div>
            <span className="bar-label">{g.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ tally }: { tally: Tally }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const total = resolvedOf(tally);
  const parts = [
    { key: 'ontime', value: tally.onTime },
    { key: 'early', value: tally.early },
    { key: 'late', value: tally.late },
    { key: 'missed', value: tally.missed },
  ].filter((p) => p.value > 0);

  let offset = 0;
  return (
    <div className="donut clay-inset">
      <svg viewBox="0 0 140 140" width="150" height="150">
        <circle cx="70" cy="70" r={r} className="donut-track" />
        {parts.map((p) => {
          const len = (p.value / total) * c;
          const el = (
            <circle
              key={p.key}
              cx="70"
              cy="70"
              r={r}
              className={`donut-seg ${p.key}`}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="donut-label">
        <strong>{punctualityOf(tally)}%</strong>
        <span>on time</span>
      </div>
    </div>
  );
}

function HBar({ label, value, sub, color }: { label: ReactNode; value: number; sub?: string; color?: string }) {
  return (
    <div className="hbar">
      <div className="hbar-head">
        <span className="hbar-label">{label}</span>
        <span className="hbar-value">{value}%</span>
      </div>
      <div className="hbar-track clay-inset">
        <div className="hbar-fill" style={{ width: `${Math.max(value, value ? 6 : 0)}%`, ...(color ? { background: color } : {}) }} />
      </div>
      {sub && <span className="hbar-sub">{sub}</span>}
    </div>
  );
}

export const ReportCard = memo(function ReportCard({ username, medicines, logs, settings, now }: Props) {
  const [range, setRange] = useState(7);
  // The range buttons respond instantly; the heavier chart render follows without blocking input.
  const deferredRange = useDeferredValue(range);
  const stale = range !== deferredRange;
  const report = useMemo(
    () => buildReport(medicines, logs, settings, now, deferredRange),
    [medicines, logs, settings, now, deferredRange],
  );

  const { total } = report;
  const taken = takenOf(total);
  const resolved = resolvedOf(total);
  const adherence = adherenceOf(total);
  const punctuality = punctualityOf(total);
  const score = scoreOf(total);
  const grade = gradeFor(score);
  const avgDelay = report.delays.length ? report.delays.reduce((a, b) => a + b, 0) / report.delays.length : null;

  const periodsWithData = report.byPeriod.filter((p) => resolvedOf(p.tally) > 0);
  const bestPeriod = [...periodsWithData].sort((a, b) => adherenceOf(b.tally) - adherenceOf(a.tally))[0];
  const worstPeriod = [...periodsWithData].sort((a, b) => adherenceOf(a.tally) - adherenceOf(b.tally))[0];
  const medsWithData = report.byMed.filter((m) => resolvedOf(m.tally) > 0);
  const worstMed = [...medsWithData].sort((a, b) => adherenceOf(a.tally) - adherenceOf(b.tally))[0];

  const insights: string[] = [];
  if (bestPeriod) insights.push(`🌟 You’re most consistent in the ${bestPeriod.period.toLowerCase()} (${adherenceOf(bestPeriod.tally)}%).`);
  if (worstPeriod && worstPeriod !== bestPeriod && adherenceOf(worstPeriod.tally) < 90)
    insights.push(`⏰ ${worstPeriod.period} doses need attention — only ${adherenceOf(worstPeriod.tally)}% taken.`);
  if (worstMed && adherenceOf(worstMed.tally) < 90)
    insights.push(`💊 ${worstMed.med.name} is your most-missed medicine (${worstMed.tally.missed} missed).`);
  if (total.late > 0) insights.push(`🐢 ${total.late} dose${total.late > 1 ? 's were' : ' was'} taken late. Try a reminder a few minutes before.`);
  if (report.currentStreak >= 3) insights.push(`🔥 ${report.currentStreak}-day perfect streak — don’t break the chain!`);
  if (insights.length === 0) insights.push('✨ Keep logging your doses to unlock personalised insights.');

  return (
    <div className="report">
      <nav className="tabs clay-inset range-tabs">
        {RANGES.map((r) => (
          <button key={r.days} className={range === r.days ? 'active' : ''} onClick={() => setRange(r.days)}>
            {r.label}
          </button>
        ))}
      </nav>

      <div className={`report-body ${stale ? 'updating' : ''}`} key={deferredRange}>
      <section className="grade-card clay">
        <div className={`grade-badge tone-${resolved ? grade.tone : 'none'}`}>
          <span>{resolved ? grade.letter : '–'}</span>
        </div>
        <div className="grade-text">
          <p className="eyebrow">Report card · last {deferredRange} days</p>
          <h2>{resolved ? grade.message : 'No completed doses yet'}</h2>
          <p className="muted">
            {resolved
              ? `Score ${score}/100 · ${taken} of ${resolved} doses taken, ${total.onTime} right on time.`
              : 'Once doses are taken or missed, your grade will appear here.'}
          </p>
          <div className="score-track clay-inset">
            <div className="score-fill" style={{ width: `${resolved ? score : 0}%` }} />
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <div className="stat-tile clay">
          <span className="tile-icon">✅</span>
          <strong>{adherence}%</strong>
          <span>Adherence</span>
        </div>
        <div className="stat-tile clay">
          <span className="tile-icon">⏱️</span>
          <strong>{punctuality}%</strong>
          <span>Punctuality</span>
        </div>
        <div className="stat-tile clay">
          <span className="tile-icon">🕒</span>
          <strong className="small">{avgDelay === null ? '—' : formatDelay(avgDelay)}</strong>
          <span>Average timing</span>
        </div>
        <div className="stat-tile clay">
          <span className="tile-icon">🔥</span>
          <strong>{report.currentStreak}</strong>
          <span>Current streak (days)</span>
        </div>
        <div className="stat-tile clay">
          <span className="tile-icon">🏆</span>
          <strong>{report.bestStreak}</strong>
          <span>Best streak (days)</span>
        </div>
        <div className="stat-tile clay">
          <span className="tile-icon">❌</span>
          <strong>{total.missed}</strong>
          <span>Missed doses</span>
        </div>
      </section>

      <section className="chart-card clay">
        <div className="card-head">
          <h3>{deferredRange > 31 ? 'Weekly doses' : 'Daily doses'}</h3>
          <div className="legend-inline">
            <span><i className="lg taken" /> On time</span>
            <span><i className="lg due-soon" /> Late</span>
            <span><i className="lg missed" /> Missed</span>
          </div>
        </div>
        <BarChart days={report.days} range={deferredRange} />
      </section>

      <div className="report-row">
        <section className="chart-card clay">
          <div className="card-head"><h3>Punctuality</h3></div>
          <div className="donut-wrap">
            <Donut tally={total} />
            <ul className="donut-legend">
              <li><i className="lg taken" /> On time <b>{total.onTime}</b></li>
              <li><i className="lg early" /> Early <b>{total.early}</b></li>
              <li><i className="lg due-soon" /> Late <b>{total.late}</b></li>
              <li><i className="lg missed" /> Missed <b>{total.missed}</b></li>
            </ul>
          </div>
          <p className="muted small-note">
            “On time” means within {settings.graceMinutes} min of the scheduled time.
          </p>
        </section>

        <section className="chart-card clay">
          <div className="card-head"><h3>By time of day</h3></div>
          <div className="hbars">
            {report.byPeriod.map(({ period, tally }) => (
              <HBar
                key={period}
                label={period}
                value={adherenceOf(tally)}
                sub={resolvedOf(tally) ? `${takenOf(tally)}/${resolvedOf(tally)} taken · ${punctualityOf(tally)}% on time` : 'No doses'}
              />
            ))}
          </div>
        </section>
      </div>

      <section className="chart-card clay">
        <div className="card-head"><h3>By medicine</h3></div>
        <div className="hbars">
          {report.byMed.map(({ med, tally }) => (
            <HBar
              key={med.id}
              color={`linear-gradient(90deg, color-mix(in srgb, ${med.color} 70%, white), ${med.color})`}
              label={
                <>
                  <i className="med-dot" style={{ background: med.color }} /> {med.name}
                </>
              }
              value={adherenceOf(tally)}
              sub={
                resolvedOf(tally)
                  ? `${takenOf(tally)} taken · ${tally.missed} missed · ${pct(tally.onTime, takenOf(tally))}% on time`
                  : 'No doses in this period'
              }
            />
          ))}
        </div>
      </section>

      <section className="chart-card clay">
        <div className="card-head"><h3>Insights</h3></div>
        <ul className="insights">
          {insights.map((text) => (
            <li key={text} className="clay-inset">{text}</li>
          ))}
        </ul>
      </section>
      </div>
      <ReportDownload username={username} medicines={medicines} logs={logs} settings={settings} now={now} />
    </div>
  );
});
