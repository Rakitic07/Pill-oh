import { useEffect, useMemo, useState } from 'react';
import { DatePicker } from './components/DatePicker';
import { DoseCard } from './components/DoseCard';
import { GearIcon, LogoutIcon, PillIcon, PlusIcon } from './components/Icons';
import { LogoMark } from './components/Logo';
import { MedicineForm } from './components/MedicineForm';
import { MedicineList } from './components/MedicineList';
import { ProgressRing } from './components/ProgressRing';
import { ReportCard } from './components/ReportCard';
import { SettingsModal } from './components/SettingsModal';
import { TakenAtModal } from './components/TakenAtModal';
import { ThemePicker } from './components/ThemePicker';
import { WeekStrip } from './components/WeekStrip';
import { applyThemeVars, buildThemeVars, DEFAULT_CUSTOM, sanitizeCustom, type CustomTheme } from './customTheme';
import { DEFAULT_THEME, isThemeId, type ThemeId } from './themes';
import type { NotifyPrefs, User, UserData } from './api';
import { AccountModal } from './components/AccountModal';
import { AdminPanel } from './components/AdminPanel';
import { useNow } from './hooks';
import { signOut, useSyncedState, useSyncStatus } from './sync';
import { sampleMedicines } from './sampleData';
import {
  DEFAULT_SETTINGS,
  formatDuration,
  formatTime,
  fromDateKey,
  getDosesForDate,
  periodOf,
  toDateKey,
} from './schedule';
import type { Dose, DoseLog, DoseLogs, Medicine, Settings } from './types';

export type Tab = 'schedule' | 'report' | 'medicines';

const SYNC_LABEL = { saved: 'All changes saved', saving: 'Saving…', error: 'Offline — will retry' };

/** Subscribes to save status on its own so autosaves don't re-render the whole app. */
function SyncDot() {
  const status = useSyncStatus();
  return <span className={`sync-dot ${status}`} title={SYNC_LABEL[status]} aria-label={SYNC_LABEL[status]} />;
}

function LogoutButton({ className = '' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`clay-btn icon-btn ${className}`}
      aria-label="Log out"
      title="Log out"
      disabled={busy}
      onClick={() => {
        if (!confirm('Log out of Pill-oh on this device?')) return;
        setBusy(true);
        void signOut();
      }}
    >
      <LogoutIcon />
    </button>
  );
}

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

interface Props {
  user: User;
  initialData: UserData;
  initialTab?: Tab;
}

export default function App({ user, initialData, initialTab = 'schedule' }: Props) {
  const [medicines, setMedicines] = useSyncedState<Medicine[]>('medicines', initialData.medicines ?? []);
  const [logs, setLogs] = useSyncedState<DoseLogs>('logs', initialData.logs ?? {});
  const [storedSettings, setSettings] = useSyncedState<Settings>('settings', initialData.settings ?? DEFAULT_SETTINGS);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...storedSettings }), [storedSettings]);
  const [notify, setNotify] = useSyncedState<NotifyPrefs | null>('notify', initialData.notify ?? null);
  // Reminders are timed in the user's zone; follow the device if it moves (travel, DST changes).
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (notify && notify.timeZone !== tz) setNotify({ ...notify, timeZone: tz });
  }, [notify, setNotify]);
  const [storedTheme, setTheme] = useSyncedState<ThemeId>('theme', initialData.theme ?? DEFAULT_THEME);
  const theme = isThemeId(storedTheme) ? storedTheme : DEFAULT_THEME;
  const [storedCustom, setCustomTheme] = useSyncedState<CustomTheme>('customTheme', initialData.customTheme ?? DEFAULT_CUSTOM);
  const customTheme = sanitizeCustom(storedCustom);
  const { bg: customBg, accent: customAccent } = customTheme;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const vars = theme === 'custom' ? buildThemeVars({ bg: customBg, accent: customAccent }) : null;
    applyThemeVars(vars);
    // Tints the phone's status bar / installed-app title bar to match the theme.
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    // Cached locally so public/theme-init.js can paint the right theme before the app loads.
    localStorage.setItem('pill-oh.theme', JSON.stringify(theme));
    if (vars) localStorage.setItem('pill-oh.customVars', JSON.stringify(vars));
  }, [theme, customBg, customAccent]);

  const now = useNow(30_000);
  const today = toDateKey(now);
  const [selected, setSelected] = useState(today);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState<Medicine | 'new' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pickTimeFor, setPickTimeFor] = useState<string | null>(null);
  const [showAccount, setShowAccount] = useState(false);

  const doses = getDosesForDate(medicines, logs, selected, now, settings);

  const isFuture = selected > today;
  const pickTimeDose = pickTimeFor ? doses.find((d) => d.key === pickTimeFor) ?? null : null;
  const taken = doses.filter((d) => d.status === 'taken').length;
  const missed = doses.filter((d) => d.status === 'missed').length;
  const next = doses.find((d) => d.status !== 'taken' && d.status !== 'missed');

  const groups = new Map<string, Dose[]>();
  for (const d of doses) {
    const p = periodOf(d.time);
    groups.set(p, [...(groups.get(p) ?? []), d]);
  }

  const setLog = (key: string, log: DoseLog | null) =>
    setLogs((prev) => {
      const nextLogs = { ...prev };
      if (log) nextLogs[key] = log;
      else delete nextLogs[key];
      return nextLogs;
    });

  const saveMedicine = (med: Medicine) => {
    setMedicines((prev) => (prev.some((m) => m.id === med.id) ? prev.map((m) => (m.id === med.id ? med : m)) : [...prev, med]));
    setEditing(null);
  };

  const deleteMedicine = (med: Medicine) => {
    if (!confirm(`Delete ${med.name} and its history?`)) return;
    setMedicines((prev) => prev.filter((m) => m.id !== med.id));
    setLogs((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k.split('|')[1] !== med.id)));
  };

  const selectedDate = fromDateKey(selected);
  const dateLabel =
    selected === today
      ? 'Today'
      : selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  if (user.isAdmin) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-logo clay"><LogoMark /></div>
            <div>
              <h1>Pill-oh <span className="admin-badge">Admin</span></h1>
              <p>
                {greeting(now)}, {user.username} 👋
                <SyncDot />
              </p>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="clay-btn icon-btn avatar-btn" aria-label="Account" onClick={() => setShowAccount(true)}>
              {user.username.slice(0, 1).toUpperCase()}
            </button>
            <ThemePicker value={theme} custom={customTheme} onChange={setTheme} onCustomChange={setCustomTheme} />
            <LogoutButton />
          </div>
        </header>
        <AdminPanel now={now} />
        {showAccount && <AccountModal user={user} onClose={() => setShowAccount(false)} />}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo clay"><LogoMark /></div>
          <div>
            <h1>Pill-oh</h1>
            <p>
              {greeting(now)}, {user.username} 👋
              <SyncDot />
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="clay-btn icon-btn avatar-btn" aria-label="Account" onClick={() => setShowAccount(true)}>
            {user.username.slice(0, 1).toUpperCase()}
          </button>
          <ThemePicker value={theme} custom={customTheme} onChange={setTheme} onCustomChange={setCustomTheme} />
          <button className="clay-btn icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
            <GearIcon />
          </button>
          <button className="clay-btn primary" onClick={() => setEditing('new')}>
            <PlusIcon width={18} height={18} /> <span className="hide-sm">Add medicine</span>
          </button>
          <LogoutButton className="hide-sm" />
        </div>
      </header>

      <nav className="tabs clay-inset">
        <button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>Schedule</button>
        <button className={tab === 'medicines' ? 'active' : ''} onClick={() => setTab('medicines')}>
          My medicines <span className="count">{medicines.length}</span>
        </button>
        <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>Report card</button>
      </nav>

      {medicines.length === 0 ? (
        <section className="empty clay">
          <div className="empty-art clay"><PillIcon width={40} height={40} /></div>
          <h2>No medicines yet</h2>
          <p>Add your medicines and their daily schedule. We’ll remind you visually when a dose is due and track what you’ve taken.</p>
          <div className="form-actions center">
            <button className="clay-btn primary" onClick={() => setEditing('new')}>
              <PlusIcon width={18} height={18} /> Add your first medicine
            </button>
            <button className="clay-btn" onClick={() => setMedicines(sampleMedicines(new Date()))}>Load sample data</button>
          </div>
        </section>
      ) : tab === 'schedule' ? (
        <>
          <WeekStrip
            selected={selected}
            today={today}
            medicines={medicines}
            logs={logs}
            now={now}
            settings={settings}
            onSelect={setSelected}
          />

          <section className="summary clay">
            <ProgressRing taken={taken} total={doses.length} />
            <div className="summary-text">
              <div className="summary-title">
                <h2>{dateLabel}</h2>
                <DatePicker variant="icon" value={selected} onChange={(v) => v && setSelected(v)} ariaLabel="Jump to a date" />
              </div>
              {selected !== today && (
                <button className="link-btn" onClick={() => setSelected(today)}>Jump to today</button>
              )}
              <div className="stats">
                <span className="stat taken">{taken} taken</span>
                <span className="stat missed">{missed} missed</span>
                <span className="stat upcoming">{doses.length - taken - missed} left</span>
              </div>
              {next && selected === today && (
                <p className="next">
                  Next: <b>{next.med.name}</b> at {formatTime(next.time)}
                  {next.scheduledAt > now ? ` · in ${formatDuration(next.scheduledAt.getTime() - now.getTime())}` : ' · now'}
                </p>
              )}
              {!next && doses.length > 0 && taken === doses.length && <p className="next">All done for the day 🎉</p>}
            </div>
          </section>

          {doses.length === 0 ? (
            <section className="empty clay small">
              <p>No doses scheduled for this day.</p>
            </section>
          ) : (
            [...groups].map(([period, items]) => (
              <section key={period} className="group">
                <h4 className="group-title">{period}</h4>
                {items.map((dose) => (
                  <DoseCard
                    key={dose.key}
                    dose={dose}
                    now={now}
                    settings={settings}
                    locked={isFuture}
                    onTake={() => setLog(dose.key, { status: 'taken', at: new Date().toISOString() })}
                    onMiss={() => setLog(dose.key, { status: 'missed', at: new Date().toISOString() })}
                    onReset={() => setLog(dose.key, null)}
                    onPickTime={() => setPickTimeFor(dose.key)}
                  />
                ))}
              </section>
            ))
          )}
        </>
      ) : tab === 'report' ? (
        <ReportCard username={user.username} medicines={medicines} logs={logs} settings={settings} now={now} />
      ) : (
        <MedicineList medicines={medicines} onEdit={setEditing} onDelete={deleteMedicine} />
      )}

      {editing && (
        <MedicineForm
          initial={editing === 'new' ? undefined : editing}
          onSave={saveMedicine}
          onClose={() => setEditing(null)}
        />
      )}

      {pickTimeDose && (
        <TakenAtModal
          dose={pickTimeDose}
          now={now}
          settings={settings}
          onClose={() => setPickTimeFor(null)}
          onSave={(takenAt) => {
            setLog(pickTimeDose.key, { status: 'taken', at: takenAt.toISOString() });
            setPickTimeFor(null);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          notify={notify}
          onNotifyChange={setNotify}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            setSettings(s);
            setShowSettings(false);
          }}
          onClearAll={() => {
            setMedicines([]);
            setLogs({});
            setShowSettings(false);
          }}
        />
      )}

      {showAccount && <AccountModal user={user} onClose={() => setShowAccount(false)} />}
    </div>
  );
}
