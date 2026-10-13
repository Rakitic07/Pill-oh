import { useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, type User } from '../api';
import { THEMES } from '../themes';
import { LogoMark } from './Logo';

type Mode = 'login' | 'signup' | 'forgot' | 'recover' | 'help' | 'help-sent' | 'admin';

interface Props {
  onSignedIn: (user: User, asAdmin?: boolean) => void;
  /** Called after sign-up or recovery, when a new recovery code must be shown. */
  onNewRecoveryCode: (user: User, code: string) => void;
}

const HERO_FEATURES = [
  { icon: '🔔', title: 'Reminders on your phone', text: 'Free alerts at dose time — and a nudge if you forget.' },
  { icon: '✅', title: 'One tap to tick it off', text: 'Mark doses taken, taken late or missed.' },
  { icon: '📅', title: 'Your week at a glance', text: 'Swipe through days to see what’s due and what’s done.' },
  { icon: '📊', title: 'A friendly report card', text: 'See your streaks and on-time rate over weeks and months.' },
];

const USERNAME_HINT = '3–32 characters: letters, numbers, dot, dash or underscore. Not case-sensitive.';

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function AuthPage({ onSignedIn, onNewRecoveryCode }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [answers, setAnswers] = useState({ medicines: '', signupWhen: '', theme: '', contact: '', note: '' });
  const { busy, error, setError, run } = useSubmit();

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  };

  const passwordsMatch = () => {
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return false;
    }
    return true;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      run(async () => onSignedIn((await api.login(username, password)).user));
    } else if (mode === 'admin') {
      run(async () => onSignedIn((await api.login(username, password, true)).user, true));
    } else if (mode === 'signup') {
      if (!passwordsMatch()) return;
      run(async () => {
        const res = await api.signup(username, password);
        onNewRecoveryCode(res.user, res.recoveryCode);
      });
    } else if (mode === 'recover') {
      if (!passwordsMatch()) return;
      run(async () => {
        const res = await api.recover(username, recoveryCode, password);
        onNewRecoveryCode(res.user, res.recoveryCode);
      });
    } else if (mode === 'help') {
      run(async () => {
        await api.requestReset(username, answers);
        setMode('help-sent');
      });
    }
  };

  const setAnswer = (key: keyof typeof answers) => (e: { target: { value: string } }) =>
    setAnswers((a) => ({ ...a, [key]: e.target.value }));

  const usernameField = (
    <Field label="Username" hint={mode === 'signup' ? USERNAME_HINT : undefined}>
      <input
        className="clay-input"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={32}
        autoFocus
      />
    </Field>
  );

  const showIntro = mode === 'login' || mode === 'signup';

  return (
    <div className="auth-screen">
      <div className={`auth-layout ${showIntro ? 'with-intro' : ''}`}>
      {showIntro && (
        <section className="auth-hero" aria-labelledby="auth-hero-title">
          <span className="hero-eyebrow">💊 Your daily medicine tracker</span>
          <h2 id="auth-hero-title">
            Never miss a dose. <span>Feel good about every pill.</span>
          </h2>
          <p className="hero-lead">
            Pill-oh keeps all your medicines on one calm schedule. Get a gentle reminder on your phone when it’s time,
            tick it off in a tap, and see how well you’re keeping up.
          </p>
          <ul className="hero-features">
            {HERO_FEATURES.map((f) => (
              <li key={f.title} className="clay">
                <span className="hero-icon" aria-hidden>{f.icon}</span>
                <span>
                  <b>{f.title}</b>
                  <small>{f.text}</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="hero-note">Free to use · Works on iPhone, Android &amp; desktop · Your data stays private</p>
        </section>
      )}
      <div className="auth-card clay">
        <div className="auth-brand">
          <div className="brand-logo clay"><LogoMark /></div>
          <div>
            <h1>Pill-oh</h1>
            <p className="muted">Your clay-soft medicine buddy</p>
          </div>
        </div>

        {(mode === 'login' || mode === 'signup') && (
          <nav className="tabs clay-inset">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => go('login')}>Sign in</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => go('signup')}>Create account</button>
          </nav>
        )}

        {mode === 'forgot' && (
          <div className="form">
            <h2>Forgot your password?</h2>
            <button type="button" className="choice-card clay" onClick={() => go('recover')}>
              <span className="choice-icon">🔑</span>
              <span>
                <b>I have my recovery code</b>
                <small>Set a new password right away.</small>
              </span>
            </button>
            <button type="button" className="choice-card clay" onClick={() => go('help')}>
              <span className="choice-icon">🧑‍💼</span>
              <span>
                <b>Ask the admin for help</b>
                <small>Answer a few questions; the admin will verify and reset it for you.</small>
              </span>
            </button>
            <button type="button" className="link-btn" onClick={() => go('login')}>← Back to sign in</button>
          </div>
        )}

        {mode === 'help-sent' && (
          <div className="form center-text">
            <div className="auth-icon clay">📨</div>
            <h2>Request sent</h2>
            <p className="muted">
              The admin will check your answers and contact you at <b>{answers.contact}</b> with a temporary password.
              Use it to sign in, then change it from the account menu.
            </p>
            <button type="button" className="clay-btn primary wide" onClick={() => go('login')}>Back to sign in</button>
          </div>
        )}

        {(mode === 'login' || mode === 'signup' || mode === 'recover' || mode === 'help' || mode === 'admin') && (
          <form className="form" onSubmit={submit}>
            {mode === 'admin' && (
              <>
                <h2>🛡️ Admin sign in</h2>
                <p className="muted">For Pill-oh admins only.</p>
              </>
            )}
            {mode === 'recover' && <h2>Reset with recovery code</h2>}
            {mode === 'help' && (
              <>
                <h2>Ask the admin</h2>
                <p className="muted">These answers help the admin confirm it’s really you.</p>
              </>
            )}

            {usernameField}

            {mode === 'recover' && (
              <Field label="Recovery code">
                <input
                  className="clay-input mono"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  maxLength={40}
                />
              </Field>
            )}

            {mode !== 'help' && (
              <Field label={mode === 'recover' ? 'New password' : 'Password'} hint={mode === 'signup' || mode === 'recover' ? 'At least 8 characters.' : undefined}>
                <input
                  type="password"
                  className="clay-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' || mode === 'admin' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'login' || mode === 'admin' ? undefined : 8}
                  maxLength={128}
                />
              </Field>
            )}

            {(mode === 'signup' || mode === 'recover') && (
              <Field label="Confirm password">
                <input
                  type="password"
                  className="clay-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  maxLength={128}
                />
              </Field>
            )}

            {mode === 'help' && (
              <>
                <Field label="Which medicines do you track in the app?">
                  <input className="clay-input" value={answers.medicines} onChange={setAnswer('medicines')} maxLength={300} placeholder="e.g. Metformin, Vitamin D" />
                </Field>
                <Field label="Roughly when did you create your account?">
                  <input className="clay-input" value={answers.signupWhen} onChange={setAnswer('signupWhen')} maxLength={100} placeholder="e.g. early October 2026" />
                </Field>
                <Field label="Which theme were you using?">
                  <select className="clay-input" value={answers.theme} onChange={setAnswer('theme')}>
                    <option value="">Not sure</option>
                    {THEMES.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    <option value="custom">My own custom theme</option>
                  </select>
                </Field>
                <Field label="How can the admin reach you? *">
                  <input className="clay-input" value={answers.contact} onChange={setAnswer('contact')} maxLength={120} required placeholder="Phone or email" />
                </Field>
                <Field label="Anything else that proves it’s you? (optional)">
                  <textarea className="clay-input" rows={2} value={answers.note} onChange={setAnswer('note')} maxLength={500} />
                </Field>
              </>
            )}

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="clay-btn primary wide" disabled={busy}>
              {busy
                ? 'Please wait…'
                : { login: 'Sign in', signup: 'Create account', recover: 'Set new password', help: 'Send request', admin: 'Sign in as admin' }[mode]}
            </button>

            {mode === 'login' && (
              <button type="button" className="link-btn" onClick={() => go('forgot')}>Forgot password?</button>
            )}
            {(mode === 'recover' || mode === 'help') && (
              <button type="button" className="link-btn" onClick={() => go('forgot')}>← Back</button>
            )}
            {mode === 'admin' && (
              <button type="button" className="link-btn" onClick={() => go('login')}>← Back to sign in</button>
            )}
          </form>
        )}
      </div>
      </div>

      <footer className="auth-footer">
        <span>Pill-oh · {new Date().getFullYear()}</span>
        {mode !== 'admin' && (
          <>
            <span aria-hidden>·</span>
            <button type="button" className="footer-link" onClick={() => go('admin')}>Admin login</button>
          </>
        )}
      </footer>
    </div>
  );
}
