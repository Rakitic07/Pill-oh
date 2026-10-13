import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminRequest, type AdminUser } from '../api';
import { THEMES } from '../themes';
import { Modal } from './Modal';
import { SecretBox } from './SecretBox';

const themeName = (id: string | null | undefined) =>
  !id ? '—' : id === 'custom' ? 'Custom theme' : (THEMES.find((t) => t.id === id)?.name ?? id);

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <b>{value || '—'}</b>
    </div>
  );
}

export function AdminPanel() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([api.admin.requests(), api.admin.users()]);
      setRequests(r.requests);
      setUsers(u.users);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t load admin data.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const resetUser = (u: AdminUser) => {
    if (!confirm(`Reset the password for "${u.username}"? They will be signed out everywhere.`)) return;
    void act(u.id, async () => {
      const res = await api.admin.resetUser(u.id);
      setIssued({ username: u.username, password: res.tempPassword });
    });
  };

  const visible = filter === 'pending' ? requests.filter((r) => r.status === 'pending') : requests;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="admin">
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

        {error && <p className="form-error">{error}</p>}
        {visible.length === 0 && <p className="muted">No {filter === 'pending' ? 'pending ' : ''}requests.</p>}

        {visible.map((r) => (
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

      <section className="chart-card clay">
        <div className="card-head">
          <h3>Users</h3>
          <span className="muted">{users.length} total</span>
        </div>
        <div className="user-list">
          {users.map((u) => (
            <div key={u.id} className="user-row clay-inset">
              <div className="avatar">{u.username.slice(0, 1).toUpperCase()}</div>
              <div className="user-info">
                <b>
                  {u.username}
                  {u.isAdmin && <span className="req-chip resolved">admin</span>}
                </b>
                <span className="muted small-note left">Joined {fmt(u.createdAt)} · Last seen {fmt(u.lastSeenAt)}</span>
              </div>
              <button className="clay-btn" disabled={busyId === u.id} onClick={() => resetUser(u)}>Reset password</button>
            </div>
          ))}
        </div>
      </section>

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
