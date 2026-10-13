// Builds and downloads a report PDF. Loaded on demand (dynamic import), so jsPDF stays out of the main bundle.
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import {
  adherenceOf,
  buildReportBetween,
  gradeFor,
  PERIODS,
  punctualityOf,
  resolvedOf,
  scoreOf,
  takenOf,
  type Tally,
} from './report';
import type { PeriodRange } from './reportPeriods';
import { DEFAULT_SETTINGS, formatTime, fromDateKey, getDosesForDate, MINUTE, timingOf } from './schedule';
import type { DoseLogs, Medicine, Settings } from './types';

export interface PdfInput {
  username: string;
  medicines: Medicine[];
  logs: DoseLogs;
  settings?: Partial<Settings> | null;
  period: PeriodRange;
  now: Date;
}

type RGB = [number, number, number];
const ACCENT: RGB = [255, 122, 89];
const INK: RGB = [28, 31, 38];
const MUTED: RGB = [110, 116, 130];
const LIGHT: RGB = [246, 241, 238];

/** The built-in PDF fonts only cover Latin-1, so other characters (emoji, other scripts) are dropped. */
const t = (s: string) => s.normalize('NFKD').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();

const daysText = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const TIMING_STATUS = { onTime: 'Taken on time', early: 'Taken early', late: 'Taken late' };
const dayLabel = (key: string) => fromDateKey(key).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function delayText(mins: number): string {
  const m = Math.round(Math.abs(mins));
  if (m < 1) return 'Right on time';
  const text = m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  return mins > 0 ? `${text} late` : `${text} early`;
}

const tallyRow = (label: string, tally: Tally, scheduled?: number): RowInput => [
  label,
  ...(scheduled === undefined ? [] : [String(scheduled)]),
  String(takenOf(tally)),
  String(tally.onTime + tally.early),
  String(tally.late),
  String(tally.missed),
  resolvedOf(tally) ? `${adherenceOf(tally)}%` : '-',
];

export function buildReportPdf({ username, medicines, logs, settings: partial, period, now }: PdfInput): jsPDF {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...partial };
  const report = buildReportBetween(medicines, logs, settings, now, period.from, period.to);
  const { total } = report;
  const resolved = resolvedOf(total);
  const score = scoreOf(total);
  const grade = gradeFor(score);
  const avgDelay = report.delays.length ? report.delays.reduce((a, b) => a + b, 0) / report.delays.length : null;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  // Header band
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 92, 'F');
  doc.setFillColor(...ACCENT);
  doc.roundedRect(M, 24, 44, 44, 10, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Rx', M + 22, 52, { align: 'center' });
  doc.setFontSize(22);
  doc.text('Pill-oh', M + 58, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...LIGHT);
  doc.text(`${period.kind[0].toUpperCase()}${period.kind.slice(1)} medicine report`, M + 58, 63);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...ACCENT);
  doc.text(t(period.label), W - M, 46, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...LIGHT);
  doc.text(`${dayLabel(period.from)}${period.to !== period.from ? ` - ${dayLabel(period.to)}` : ''}`, W - M, 63, { align: 'right' });

  // Who / when
  let y = 120;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Patient: ${t(username)}`, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(`Generated ${now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, W - M, y, { align: 'right' });

  // Grade + summary
  y += 18;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(M, y, W - 2 * M, 70, 10, 10, 'F');
  doc.setFillColor(...ACCENT);
  doc.circle(M + 38, y + 35, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(resolved ? grade.letter : '-', M + 38, y + 41, { align: 'center' });
  doc.setTextColor(...INK);
  doc.setFontSize(13);
  doc.text(t(resolved ? grade.message : 'No completed doses in this period yet.'), M + 76, y + 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(
    resolved ? `Score ${score}/100  |  ${takenOf(total)} of ${resolved} doses taken  |  ${total.onTime} right on time` : 'Doses appear here once they are taken or missed.',
    M + 76,
    y + 48,
  );
  y += 88;

  const tableStyle = {
    theme: 'grid' as const,
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 5, textColor: INK, lineColor: [225, 220, 216] as RGB, lineWidth: 0.5 },
    headStyles: { fillColor: INK, textColor: [255, 255, 255] as RGB, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [250, 247, 245] as RGB },
  };
  const section = (title: string) => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 50;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...ACCENT);
    doc.text(title, M, y);
    y += 8;
  };
  const table = (head: string[], body: RowInput[]) => {
    autoTable(doc, { ...tableStyle, startY: y, head: [head], body });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 26;
  };

  section('Summary');
  table(
    ['Measure', 'Value', 'Measure', 'Value'],
    [
      ['Adherence (doses taken)', resolved ? `${adherenceOf(total)}%` : '-', 'Doses taken', `${takenOf(total)} of ${resolved}`],
      ['Punctuality (on time)', takenOf(total) ? `${punctualityOf(total)}%` : '-', 'On time / early', `${total.onTime} / ${total.early}`],
      ['Average timing', avgDelay === null ? '-' : delayText(avgDelay), 'Taken late', String(total.late)],
      ['Current streak', daysText(report.currentStreak), 'Missed', String(total.missed)],
      ['Best streak', daysText(report.bestStreak), 'Medicines', String(medicines.length)],
    ],
  );

  if (period.kind === 'daily') {
    const doses = getDosesForDate(medicines, logs, period.from, now, settings);
    section('Doses');
    table(
      ['Time', 'Medicine', 'Dosage', 'Status', 'Taken at', 'Timing'],
      doses.length
        ? doses.map((d) => {
            const takenAt = d.status === 'taken' && d.log ? new Date(d.log.at) : null;
            const timing = takenAt ? timingOf(d.scheduledAt, takenAt, settings.graceMinutes) : null;
            return [
              formatTime(d.time),
              t(d.med.name),
              t(d.med.dosage),
              timing ? TIMING_STATUS[timing] : d.status === 'missed' ? 'Missed' : 'Pending',
              takenAt ? clock(takenAt) : '-',
              takenAt ? delayText((takenAt.getTime() - d.scheduledAt.getTime()) / MINUTE) : '-',
            ];
          })
        : [[{ content: 'No doses scheduled on this day.', colSpan: 6 }]],
    );
  } else if (period.kind === 'monthly') {
    section('Day by day');
    table(
      ['Date', 'Scheduled', 'Taken', 'On time', 'Late', 'Missed', 'Adherence'],
      report.days.map((d) => tallyRow(dayLabel(d.key), d.tally, getDosesForDate(medicines, logs, d.key, now, settings).length)),
    );
  } else {
    const months = new Map<string, Tally>();
    for (const d of report.days) {
      const label = fromDateKey(d.key).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const m = months.get(label) ?? { onTime: 0, early: 0, late: 0, missed: 0 };
      m.onTime += d.tally.onTime;
      m.early += d.tally.early;
      m.late += d.tally.late;
      m.missed += d.tally.missed;
      months.set(label, m);
    }
    section('Month by month');
    table(['Month', 'Taken', 'On time', 'Late', 'Missed', 'Adherence'], [...months].map(([label, tally]) => tallyRow(label, tally)));

    const weeks: RowInput[] = [];
    for (let i = 0; i < report.days.length; i += 7) {
      const chunk = report.days.slice(i, i + 7);
      const tally = chunk.reduce<Tally>(
        (a, d) => ({ onTime: a.onTime + d.tally.onTime, early: a.early + d.tally.early, late: a.late + d.tally.late, missed: a.missed + d.tally.missed }),
        { onTime: 0, early: 0, late: 0, missed: 0 },
      );
      weeks.push(tallyRow(`${dayLabel(chunk[0].key)} - ${dayLabel(chunk[chunk.length - 1].key)}`, tally));
    }
    section('Week by week');
    table(['Week', 'Taken', 'On time', 'Late', 'Missed', 'Adherence'], weeks);
  }

  section('By medicine');
  table(
    ['Medicine', 'Dosage', 'Taken', 'On time', 'Late', 'Missed', 'Adherence'],
    report.byMed.length
      ? report.byMed.map(({ med, tally }) => {
          const row = tallyRow(t(med.name), tally) as string[];
          return [row[0], t(med.dosage), ...row.slice(1)];
        })
      : [[{ content: 'No medicines added.', colSpan: 7 }]],
  );

  section('By time of day');
  table(
    ['Time of day', 'Taken', 'On time', 'Late', 'Missed', 'Adherence'],
    report.byPeriod.filter((p) => PERIODS.includes(p.period)).map(({ period: p, tally }) => tallyRow(p, tally)),
  );

  // Footer on every page
  const pages = doc.getNumberOfPages();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`"On time" = within ${settings.graceMinutes} min of the scheduled time.  Generated by Pill-oh.`, M, H - 24);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 24, { align: 'right' });
  }
  return doc;
}

export function downloadReportPdf(input: PdfInput) {
  const safeName = input.username.replace(/[^A-Za-z0-9._-]/g, '_');
  buildReportPdf(input).save(`pill-oh-${safeName}-${input.period.kind}-${input.period.tag}.pdf`);
}
