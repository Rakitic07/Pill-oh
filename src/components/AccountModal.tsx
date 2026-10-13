import { useState, type FormEvent } from 'react';
import { api, ApiError, type User } from '../api';
import { signOut } from '../sync';
import { LogoutIcon } from './Icons';
import { Modal } from './Modal';
import { RecoveryCodeView } from './RecoveryCodeView';

interface Props {
  user: User;
  onClose: () => void;
}

export function AccountModal({ user, onClose }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [codePassword, setCodePassword] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setMessage({ kind: 'error', text: 'New passwords don’t match.' });
    run(async () => {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMessage({ kind: 'ok', text: 'Password updated. Other devices have been signed out.' });
    });
  };

  const regenerate = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { recoveryCode } = await api.newRecoveryCode(codePassword);
      setCodePassword('');
      setNewCode(recoveryCode);
    });
  };

  if (newCode) {
    return (
      <Modal title="New recovery code" onClose={() => setNewCode(null)}>
        <RecoveryCodeView
          username={user.username}
          code={newCode}
          title="Your new recovery code"
          onDone={() => {
            setNewCode(null);
            setMessage({ kind: 'ok', text: 'New recovery code saved. The old one no longer works.' });
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal title="Account" onClose={onClose}>
      <div className="form">
        <div className="account-head clay-inset">
          <div className="avatar big">{user.username.slice(0, 1).toUpperCase()}</div>
          <div>
            <b>{user.username}</b>
            <p className="muted small-note left">
              Member since {new Date(user.createdAt).toLocaleDateString([], { month: 'long', year: 'numeric' })}
              {user.isAdmin ? ' · Admin' : ''}
            </p>
            <p className="muted small-note left">You stay signed in on this device until you log out.</p>
          </div>
        </div>

        {message && <p className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p>}

        <form className="form" onSubmit={changePassword}>
          <h3 className="section-title">Change password</h3>
          <input type="text" autoComplete="username" value={user.username} readOnly hidden />
          <label className="field">
            <span>Current password</span>
            <input type="password" className="clay-input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required maxLength={128} />
          </label>
          <div className="row-2">
            <label className="field">
              <span>New password</span>
              <input type="password" className="clay-input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} />
            </label>
            <label className="field">
              <span>Confirm</span>
              <input type="password" className="clay-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required maxLength={128} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="clay-btn primary" disabled={busy}>Update password</button>
          </div>
        </form>

        <form className="form" onSubmit={regenerate}>
          <h3 className="section-title">Recovery code</h3>
          <p className="muted small-note left">Lost your recovery code? Generate a new one — the old code stops working.</p>
          <label className="field">
            <span>Confirm with your password</span>
            <input type="password" className="clay-input" value={codePassword} onChange={(e) => setCodePassword(e.target.value)} autoComplete="current-password" required maxLength={128} />
          </label>
          <div className="form-actions">
            <button type="submit" className="clay-btn" disabled={busy}>Generate new code</button>
          </div>
        </form>

        <div className="form-actions">
          <button
            type="button"
            className="clay-btn danger wide"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void signOut();
            }}
          >
            <LogoutIcon width={18} height={18} /> Log out
          </button>
        </div>
      </div>
    </Modal>
  );
}
