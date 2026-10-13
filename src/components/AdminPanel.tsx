import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AdminRequest, type AdminUserReport } from '../api';
import { adherenceOf, buildReport, punctualityOf, resolvedOf, takenOf, type Tally } from '../report';
import { DEFAULT_SETTINGS } from '../schedule';
import { THEMES } from '../themes';
import type { Settings } from '../types';
import { Modal } from './Modal';
import { ReportCard } from './ReportCard';
import { SecretBox } from './SecretBox';

const themeName = (id: string | null | undefined) =>
  !id ? '—' : id === 'custom' ? 'Custom theme' : (THEMES.find((t) => t.id === id)?.name ?? id);

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

const DAY_MS = 86_400_000;
const RANGES = [7, 30, 90];

type View = 'overview' | 'users' | 'requests';
type SortKey = 'name' | 'adherence' | 'missed' | 'lastSeen';

interface UserMetrics {
  user: AdminUserReport;
  settings: Settings;
  total: Tally;
  adherence: number;
  punctuality: number;
  streak: number;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <b>{value || '—'}</b>
    </div>
  );
}

function Tile({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="stat-tile clay">
      <span className="tile-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

const toneOf = (adherence: number, resolved: number) =>
  !resolved ? 'none' : adherence >= 90 ? 'great' : adherence >= 75 ? 'good' : adherence >= 60 ? 'ok' : 'poor';

export function AdminPanel({ now }: { now: Date }) {
  const [view, setView] = useState<View>('overview');
  const [range, setRange] = useState(30);
  const [reports, setReports] = useState<AdminUserReport[] | null>(null);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('adherence');
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([api.admin.requests(), api.admin.reports()]);
      setRequests(r.requests);
      setReports(u.users);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t load admin data.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo<UserMetrics[]>(() => {
    return (reports ?? []).map((user) => {
      const settings = { ...DEFAULT_SETTINGS, ...user.settings };
      const report = buildReport(user.medicines, user.logs, settings, now, range);
      return {
        user,
        settings,
        total: report.total,
        adherence: adherenceOf(report.total),
        punctuality: punctualityOf(report.total),
        streak: report.currentStreak,
      };
    });
  }, [reports, range, now]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const resolve = (r: AdminRequest, action: 'reset' | 'reject') => {
    const prompt =
      action === 'reset'
        ? `Reset the password for "${r.account?.username ?? r.username}"? They will be signed out everywhere.`
        : 'Reject this request?';
    if (!confirm(prompt)) return;
    void act(r.id, async () => {
      const res = await api.admin.resolve(r.id, action);
      if (res.tempPassword) setIssued({ username: r.account?.username ?? r.username, password: res.tempPassword });
    });
  };

  const resetUser = (u: AdminUserReport) => {
    if (!confirm(`Reset the password for "${u.username}"? They will be signed out everywhere.`)) return;
    void act(u.id, async () => {
      const res = await api.admin.resetUser(u.id);
      setIssued({ username: u.username, password: res.tempPassword });
    });
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const visibleRequests = filter === 'pending' ? requests.filter((r) => r.status === 'pending') : requests;

  // ---------- overview numbers ----------
  const seenWithin = (iso: string | null, days: number) => Boolean(iso && now.getTime() - Date.parse(iso) < days * DAY_MS);
  const all = metrics.reduce<Tally>(
    (a, m) => ({ onTime: a.onTime + m.total.onTime, early: a.early + m.total.early, late: a.late + m.total.late, missed: a.missed + m.total.missed }),
    { onTime: 0, early: 0, late: 0, missed: 0 },
  );
  const tracked = metrics.filter((m) => resolvedOf(m.total) > 0);
  const avgAdherence = tracked.length ? Math.round(tracked.reduce((s, m) => s + m.adherence, 0) / tracked.length) : 0;
  const attention = metrics
    .filter((m) => (resolvedOf(m.total) > 0 && m.adherence < 75) || (m.user.medicines.length > 0 && !seenWithin(m.user.lastSeenAt, 7)))
    .sort((a, b) => a.adherence - b.adherence);
  const top = [...tracked].sort((a, b) => b.adherence - a.adherence || b.streak - a.streak).slice(0, 5);

  const filtered = metrics
    .filter((m) => m.user.username.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      if (sort === 'name') return a.user.username.localeCompare(b.user.username);
      if (sort === 'missed') return b.total.missed - a.total.missed;
      if (sort === 'lastSeen') return Date.parse(b.user.lastSeenAt ?? '0') - Date.parse(a.user.lastSeenAt ?? '0');
      return (resolvedOf(a.total) ? a.adherence : 101) - (resolvedOf(b.total) ? b.adherence : 101);
    });

  const selected = openUser ? metrics.find((m) => m.user.id === openUser) : null;

  const userRow = (m: UserMetrics) => {
    const resolved = resolvedOf(m.total);
    return (
      <div key={m.user.id} className="user-row admin-user clay-inset">
        <div className="avatar">{m.user.username.slice(0, 1).toUpperCase()}</div>
        <div className="user-info">
          <b>
            {m.user.username}
            {m.user.remindersOn && <span className="req-chip resolved">reminders on</span>}
          </b>
          <span className="muted small-note left">
            {m.user.medicines.length} medicine{m.user.medicines.length === 1 ? '' : 's'} · Last seen {fmt(m.user.lastSeenAt)}
          </span>
        </div>
        <div className="user-metrics">
          <span className={`metric-pill tone-${toneOf(m.adherence, resolved)}`} title={`Adherence, last ${range} days`}>
            {resolved ? `${m.adherence}%` : '—'}
          </span>
          <span className="metric-sub">{resolved ? `${takenOf(m.total)}/${resolved} taken · ${m.total.missed} missed` : 'No doses yet'}</span>
        </div>
        <div className="user-actions">
          <button className="clay-btn primary small" onClick={() => setOpenUser(m.user.id)}>View report</button>
          <button className="clay-btn small" disabled={busyId === m.user.id} onClick={() => resetUser(m.user)}>Reset password</button>
        </div>
      </div>
    );
  };

  if (selected) {
    return (
      <div className="admin">
        <div className="admin-subhead">
          <button className="link-btn left" onClick={() => setOpenUser(null)}>← All users</button>
          <h2>{selected.user.username}’s report</h2>
          <p className="muted">
            Joined {fmt(selected.user.createdAt)} · Last seen {fmt(selected.user.lastSeenAt)} ·{' '}
            {selected.user.remindersOn ? 'Reminders on' : 'Reminders off'}
          </p>
        </div>
        {selected.user.medicines.length === 0 ? (
          <section className="empty clay small"><p>This user hasn’t added any medicines yet.</p></section>
        ) : (
          <ReportCard
            username={selected.user.username}
            medicines={selected.user.medicines}
            logs={selected.user.logs}
            settings={selected.settings}
            now={now}
          />
        )}
      </div>
    );
  }

  return (
    <div className="admin">
      <nav className="tabs clay-inset">
        <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>Overview</button>
        <button className={view === 'users' ? 'active' : ''} onClick={() => setView('users')}>
          Users <span className="count">{metrics.length}</span>
        </button>
        <button className={view === 'requests' ? 'active' : ''} onClick={() => setView('requests')}>
          Password requests {pendingCount > 0 && <span className="count">{pendingCount}</span>}
        </button>
      </nav>

      {error && <p className="form-error">{error}</p>}
      {reports === null && !error && <p className="muted">Loading…</p>}

      {view !== 'requests' && reports !== null && (
        <nav className="tabs clay-inset range-tabs">
          {RANGES.map((d) => (
            <button key={d} className={range === d ? 'active' : ''} onClick={() => setRange(d)}>Last {d} days</button>
          ))}
        </nav>
      )}

      {view === 'overview' && reports !== null && (
        <>
          <section className="stat-grid">
            <Tile icon="👥" value={metrics.length} label="Total users" />
            <Tile icon="🟢" value={metrics.filter((m) => seenWithin(m.user.lastSeenAt, 7)).length} label="Active (7 days)" />
            <Tile icon="✨" value={metrics.filter((m) => seenWithin(m.user.createdAt, 30)).length} label="New (30 days)" />
            <Tile icon="🔔" value={metrics.filter((m) => m.user.remindersOn).length} label="Reminders on" />
            <Tile icon="💊" value={metrics.reduce((s, m) => s + m.user.medicines.length, 0)} label="Medicines tracked" />
            <Tile icon="✅" value={tracked.length ? `${avgAdherence}%` : '—'} label="Avg adherence" />
            <Tile icon="⏱️" value={takenOf(all) ? `${punctualityOf(all)}%` : '—'} label="Taken on time" />
            <Tile icon="📋" value={takenOf(all)} label="Doses taken" />
            <Tile icon="❌" value={all.missed} label="Doses missed" />
          </section>

          <div className="report-row">
            <section className="chart-card clay">
              <div className="card-head"><h3>⚠️ Needs attention</h3></div>
              {attention.length === 0 ? (
                <p className="muted">Everyone is on track.</p>
              ) : (
                <div className="user-list">
                  {attention.slice(0, 6).map((m) => (
                    <button key={m.user.id} className="attention-row clay-inset" onClick={() => setOpenUser(m.user.id)}>
                      <b>{m.user.username}</b>
                      <span className="muted small-note left">
                        {resolvedOf(m.total) && m.adherence < 75 ? `${m.adherence}% adherence` : ''}
                        {resolvedOf(m.total) && m.adherence < 75 && !seenWithin(m.user.lastSeenAt, 7) ? ' · ' : ''}
                        {!seenWithin(m.user.lastSeenAt, 7) ? 'not seen for 7+ days' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="chart-card clay">
              <div className="card-head"><h3>🏆 Most consistent</h3></div>
              {top.length === 0 ? (
                <p className="muted">No completed doses yet.</p>
              ) : (
                <div className="hbars">
                  {top.map((m) => (
                    <div key={m.user.id} className="hbar">
                      <div className="hbar-head">
                        <span className="hbar-label">{m.user.username}</span>
                        <span className="hbar-value">{m.adherence}%</span>
                      </div>
                      <div className="hbar-track clay-inset">
                        <div className="hbar-fill" style={{ width: `${Math.max(m.adherence, 6)}%` }} />
                      </div>
                      <span className="hbar-sub">{m.streak}-day streak · {m.punctuality}% on time</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {view === 'users' && reports !== null && (
        <section className="chart-card clay">
          <div className="card-head">
            <h3>Users</h3>
            <span className="muted">{metrics.length} total</span>
          </div>
          <div className="inline-form">
            <input className="clay-input" placeholder="Search by username" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search users" />
            <select className="clay-input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort users">
              <option value="adherence">Lowest adherence first</option>
              <option value="missed">Most missed first</option>
              <option value="lastSeen">Recently seen</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>
          <div className="user-list">
            {filtered.length === 0 ? <p className="muted">No users found.</p> : filtered.map(userRow)}
          </div>
        </section>
      )}

      {view === 'requests' && (
        <section className="chart-card clay">
          <div className="card-head">
            <h3>Password reset requests</h3>
            <nav className="tabs clay-inset mini-tabs">
              <button className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>
                Pending <span className="count">{pendingCount}</span>
              </button>
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
            </nav>
          </div>

          {visibleRequests.length === 0 && <p className="muted">No {filter === 'pending' ? 'pending ' : ''}requests.</p>}

          {visibleRequests.map((r) => (
            <article key={r.id} className={`request-card clay-inset status-${r.status}`}>
              <div className="request-head">
                <div>
                  <b>{r.username}</b>
                  <span className="muted small-note left"> · {fmt(r.createdAt)}</span>
                </div>
                <span className={`req-chip ${r.status}`}>{r.status}</span>
              </div>

              <div className="request-grid">
                <div className="request-col">
                  <h4>Their answers</h4>
                  <Row label="Medicines" value={r.answers.medicines} />
                  <Row label="Signed up" value={r.answers.signupWhen} />
                  <Row label="Theme" value={themeName(r.answers.theme)} />
                  <Row label="Contact" value={r.answers.contact} />
                  {r.answers.note && <Row label="Note" value={r.answers.note} />}
                </div>
                <div className="request-col">
                  <h4>Account facts</h4>
                  {r.account ? (
                    <>
                      <Row label="Medicines" value={r.account.medicines.join(', ')} />
                      <Row label="Signed up" value={fmt(r.account.createdAt)} />
                      <Row label="Theme" value={themeName(r.account.theme)} />
                      <Row label="Last seen" value={fmt(r.account.lastSeenAt)} />
                      <Row label="Doses logged" value={String(r.account.dosesLogged)} />
                    </>
                  ) : (
                    <p className="form-error">No account with this username.</p>
                  )}
                </div>
              </div>

              {r.status === 'pending' && (
                <div className="form-actions">
                  <button className="clay-btn danger" disabled={busyId === r.id} onClick={() => resolve(r, 'reject')}>Reject</button>
                  <button className="clay-btn primary" disabled={busyId === r.id || !r.account} onClick={() => resolve(r, 'reset')}>
                    Reset password
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {issued && (
        <Modal title="Temporary password" onClose={() => setIssued(null)}>
          <div className="form">
            <p className="muted">
              Share this with <b>{issued.username}</b> through the contact they provided. It’s shown only once. Ask them to
              sign in and change it from the account menu.
            </p>
            <SecretBox value={issued.password} />
            <div className="form-actions">
              <button className="clay-btn primary" onClick={() => setIssued(null)}>Done</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
