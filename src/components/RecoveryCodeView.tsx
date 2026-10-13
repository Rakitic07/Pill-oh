import { useState } from 'react';
import { SecretBox } from './SecretBox';

interface Props {
  username: string;
  code: string;
  title?: string;
  onDone: () => void;
}

export function RecoveryCodeView({ username, code, title = 'Save your recovery code', onDone }: Props) {
  const [saved, setSaved] = useState(false);
  const text = `Pill-oh recovery code\nUsername: ${username}\nCode: ${code}\n\nUse this code on the sign-in page ("Forgot password?") to set a new password.\nEach code works once; you'll get a new one after using it.\n`;

  return (
    <div className="recovery-view">
      <div className="auth-icon clay">🔑</div>
      <h2>{title}</h2>
      <p className="muted">
        If you ever forget your password, this code lets you set a new one. It’s shown <b>only once</b> — store it
        somewhere safe (a password manager, or write it down).
      </p>
      <SecretBox value={code} downloadName={`pill-oh-recovery-${username}.txt`} downloadText={text} />
      <label className="check-row">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>I’ve saved my recovery code</span>
      </label>
      <button type="button" className="clay-btn primary wide" disabled={!saved} onClick={onDone}>
        Continue
      </button>
    </div>
  );
}
