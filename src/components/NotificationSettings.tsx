import { useEffect, useState } from 'react';
import { api, ApiError, type NotifyPrefs, type NotifyStatus } from '../api';

interface Props {
  prefs: NotifyPrefs | null;
  onChange: (prefs: NotifyPrefs) => void;
}

const LEADS = [0, 5, 10, 15, 30];

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function Switch({ on, onToggle, disabled, label }: { on: boolean; onToggle: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={onToggle} disabled={disabled}>
      <span />
    </button>
  );
}

export function NotificationSettings({ prefs, onChange }: Props) {
  const current: NotifyPrefs = { push: false, whatsapp: false, ntfy: false, leadMinutes: 0, missedNudge: true, timeZone: timeZone(), ...prefs };
  const update = (patch: Partial<NotifyPrefs>) => onChange({ ...current, ...patch, timeZone: timeZone() });

  const [status, setStatus] = useState<NotifyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    api.notify.status().then(setStatus).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const wa = status?.whatsapp;
  const ntfy = status?.ntfy ?? null;
  const ntfyOn = Boolean(ntfy && current.ntfy);

  const toggleNtfy = () =>
    run(async () => {
      if (ntfyOn) {
        update({ ntfy: false });
        return;
      }
      if (!ntfy) setStatus(await api.notify.createNtfy());
      update({ ntfy: true });
    });

  const copyTopic = () =>
    ntfy &&
    navigator.clipboard.writeText(ntfy.topic).then(
      () => setMessage({ ok: true, text: 'Topic copied.' }),
      () => setMessage({ ok: false, text: 'Couldn’t copy — select the topic and copy it manually.' }),
    );
  const customServer = ntfy && ntfy.server !== 'https://ntfy.sh' ? ntfy.server : null;

  return (
    <section className="notify clay-inset">
      <h3>🔔 Dose reminders</h3>

      <div className="notify-row">
        <div>
          <b>Phone notifications</b>
          <small>Free on iPhone &amp; Android through the ntfy app — your own private channel.</small>
        </div>
        <Switch label="Phone notifications" on={ntfyOn} disabled={busy} onToggle={toggleNtfy} />
      </div>

      {ntfyOn && ntfy && (
        <ol className="ntfy-steps">
          <li>
            Install <b>ntfy</b>:{' '}
            <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener noreferrer">App Store</a>
            {' · '}
            <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener noreferrer">Google Play</a>
          </li>
          <li>
            In ntfy, tap <b>+</b> and subscribe to this topic{customServer ? <> on server <code>{customServer}</code></> : null}:
            <div className="inline-form">
              <code className="topic clay-inset">{ntfy.topic}</code>
              <button type="button" className="clay-btn" onClick={copyTopic}>Copy</button>
            </div>
          </li>
          <li>Tap <b>Send test alert</b> below to check it arrives.</li>
          <li className="field-hint">
            Keep this topic private — anyone who knows it can read your reminders.{' '}
            <button type="button" className="link-btn" disabled={busy} onClick={() => run(async () => {
              setStatus(await api.notify.createNtfy());
              setMessage({ ok: true, text: 'New topic created. Subscribe to it in ntfy and remove the old one.' });
            })}>
              Make a new topic
            </button>
          </li>
        </ol>
      )}

      {wa?.available && (
        <div className="notify-row">
          <div>
            <b>WhatsApp</b>
            <small>{wa.phone ? `Sending to ${wa.phone}` : 'Get reminders on your WhatsApp number'}</small>
          </div>
          {wa.phone && (
            <Switch label="WhatsApp reminders" on={current.whatsapp} disabled={busy} onToggle={() => update({ whatsapp: !current.whatsapp })} />
          )}
        </div>
      )}

      {wa?.available && !wa.phone && (
        <div className="notify-wa">
          {wa.pending ? (
            <>
              <p className="field-hint">We sent a 6-digit code to {wa.pending} on WhatsApp.</p>
              <div className="inline-form">
                <input
                  className="clay-input mono"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <button
                  type="button"
                  className="clay-btn primary"
                  disabled={busy || code.length !== 6}
                  onClick={() =>
                    run(async () => {
                      setStatus(await api.notify.verifyWhatsApp(code));
                      setCode('');
                      update({ whatsapp: true });
                      setMessage({ ok: true, text: 'WhatsApp number verified.' });
                    })
                  }
                >
                  Verify
                </button>
              </div>
            </>
          ) : (
            <div className="inline-form">
              <input
                className="clay-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                maxLength={20}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button
                type="button"
                className="clay-btn primary"
                disabled={busy || phone.replace(/\D/g, '').length < 8}
                onClick={() => run(async () => setStatus(await api.notify.startWhatsApp(phone)))}
              >
                Send code
              </button>
            </div>
          )}
        </div>
      )}
      {wa?.phone && (
        <button type="button" className="link-btn left" disabled={busy} onClick={() => run(async () => {
          setStatus(await api.notify.removeWhatsApp());
          update({ whatsapp: false });
        })}>
          Remove WhatsApp number
        </button>
      )}

      <div className="field">
        <span>Remind me</span>
        <div className="chips">
          {LEADS.map((m) => (
            <button key={m} type="button" className={`chip ${current.leadMinutes === m ? 'active' : ''}`} onClick={() => update({ leadMinutes: m })}>
              {m ? `${m} min before` : 'At dose time'}
            </button>
          ))}
        </div>
      </div>

      <label className="check-row">
        <input type="checkbox" checked={current.missedNudge} onChange={(e) => update({ missedNudge: e.target.checked })} />
        <span>Nudge me again if I haven’t ticked it off before it’s marked missed</span>
      </label>

      <div className="form-actions spread">
        <span className="field-hint">Times follow this device’s time zone ({timeZone()}).</span>
        <button
          type="button"
          className="clay-btn"
          disabled={busy || (!ntfyOn && !(wa?.phone && current.whatsapp))}
          onClick={() =>
            run(async () => {
              const { sent } = await api.notify.test({
                push: false,
                whatsapp: Boolean(wa?.phone && current.whatsapp),
                ntfy: ntfyOn,
              });
              setMessage({ ok: true, text: `Test alert sent (${sent}).` });
            })
          }
        >
          Send test alert
        </button>
      </div>

      {message && <p className={message.ok ? 'form-ok' : 'form-error'}>{message.text}</p>}
    </section>
  );
}
