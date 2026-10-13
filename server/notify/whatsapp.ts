import { config } from '../config.ts';

export const whatsappAvailable = () =>
  Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioWhatsAppFrom);

/** E.164, e.g. +919876543210. */
export const parsePhone = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const phone = v.replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
};

export const maskPhone = (phone: string) => `${phone.slice(0, 3)}••••${phone.slice(-3)}`;

interface Message {
  /** Free-form text (Twilio sandbox, or within 24h of the user messaging you). */
  body: string;
  /** Approved template used instead of `body` when configured. */
  template?: { sid: string; variables: Record<string, string> };
}

export async function sendWhatsApp(to: string, msg: Message): Promise<boolean> {
  if (!whatsappAvailable()) return false;
  const form = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: config.twilioWhatsAppFrom.startsWith('whatsapp:') ? config.twilioWhatsAppFrom : `whatsapp:${config.twilioWhatsAppFrom}`,
  });
  if (msg.template?.sid) {
    form.set('ContentSid', msg.template.sid);
    form.set('ContentVariables', JSON.stringify(msg.template.variables));
  } else {
    form.set('Body', msg.body);
  }
  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioAccountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { code?: number };
      console.warn(JSON.stringify({ at: new Date().toISOString(), event: 'whatsapp.error', status: res.status, code: err.code ?? null }));
    }
    return res.ok;
  } catch {
    console.warn(JSON.stringify({ at: new Date().toISOString(), event: 'whatsapp.error', status: null }));
    return false;
  }
}
