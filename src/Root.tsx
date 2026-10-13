import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type DataKey, type User, type UserData } from './api';
import App from './App';
import { AuthPage } from './components/AuthPage';
import { LogoMark } from './components/Logo';
import { RecoveryCodeView } from './components/RecoveryCodeView';

type State =
  | { phase: 'loading' }
  | { phase: 'signed-out' }
  | { phase: 'offline'; message: string }
  | { phase: 'recovery-code'; user: User; data: UserData; code: string }
  | { phase: 'ready'; user: User; data: UserData };

const LEGACY_KEYS: DataKey[] = ['medicines', 'logs', 'settings', 'customTheme', 'theme'];

/** Moves data saved by the pre-login version of the app (localStorage only) into the account once. */
async function loadUserData(): Promise<UserData> {
  const { data } = await api.getData();
  for (const key of LEGACY_KEYS) {
    const storageKey = `pillpal.${key}`;
    const raw = localStorage.getItem(storageKey);
    if (raw === null) continue;
    if (data[key] === undefined) {
      try {
        const value = JSON.parse(raw);
        await api.putData(key, value);
        (data as Record<string, unknown>)[key] = value;
      } catch {
        // Invalid or rejected legacy value: drop it.
      }
    }
    // The theme key also drives the pre-paint theme script, so keep it.
    if (key !== 'theme') localStorage.removeItem(storageKey);
  }
  return data;
}

export function Root() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [openAdmin, setOpenAdmin] = useState(false);

  const enter = useCallback(async (user: User, code?: string) => {
    try {
      const data = await loadUserData();
      setState(code ? { phase: 'recovery-code', user, data, code } : { phase: 'ready', user, data });
    } catch (err) {
      setState({ phase: 'offline', message: err instanceof ApiError ? err.message : 'Couldn’t load your data.' });
    }
  }, []);

  const boot = useCallback(() => {
    setState({ phase: 'loading' });
    api
      .me()
      .then(({ user }) => enter(user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setState({ phase: 'signed-out' });
        else setState({ phase: 'offline', message: err instanceof ApiError ? err.message : 'Couldn’t reach the server.' });
      });
  }, [enter]);

  useEffect(boot, [boot]);

  switch (state.phase) {
    case 'loading':
      return (
        <div className="auth-screen">
          <div className="brand-logo clay loading-logo"><LogoMark /></div>
        </div>
      );
    case 'offline':
      return (
        <div className="auth-screen">
          <div className="auth-card clay center-text">
            <div className="auth-icon clay">📡</div>
            <h2>Can’t connect</h2>
            <p className="muted">{state.message}</p>
            <button className="clay-btn primary wide" onClick={boot}>Try again</button>
          </div>
        </div>
      );
    case 'signed-out':
      return (
        <AuthPage
          onSignedIn={(user, asAdmin) => {
            setOpenAdmin(Boolean(asAdmin));
            enter(user);
          }}
          onNewRecoveryCode={(user, code) => enter(user, code)}
        />
      );
    case 'recovery-code':
      return (
        <div className="auth-screen">
          <div className="auth-card clay">
            <RecoveryCodeView
              username={state.user.username}
              code={state.code}
              onDone={() => setState({ phase: 'ready', user: state.user, data: state.data })}
            />
          </div>
        </div>
      );
    case 'ready':
      return <App user={state.user} initialData={state.data} initialTab={openAdmin && state.user.isAdmin ? 'admin' : 'schedule'} />;
  }
}
