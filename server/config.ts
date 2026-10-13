import { fileURLToPath } from 'node:url';

export const config = {
  port: Number(process.env.PORT) || 8787,
  /** Neon/Postgres connection string. When empty, a local JSON file store is used instead. */
  databaseUrl: process.env.DATABASE_URL?.trim() ?? '',
  isProd: process.env.NODE_ENV === 'production',
  /** Running as a Vercel Function: no writable disk and no long-running timers. */
  isVercel: process.env.VERCEL === '1',
  /** Only trust X-Forwarded-For behind a reverse proxy you control (Vercel's edge always sets it). */
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.VERCEL === '1',
  /** Shared secret for GET /api/cron/notify (Vercel Cron or an external scheduler such as cron-job.org). */
  cronSecret: process.env.CRON_SECRET?.trim() ?? '',
  /** Optional first-admin bootstrap; the password is hashed on startup and never stored in plain text. */
  adminUsername: process.env.ADMIN_USERNAME?.trim() ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  /** Argon2id hash (from `npm run admin-unlock-hash`) of a key that turns the signed-in account into an admin. */
  adminUnlockHash: process.env.ADMIN_UNLOCK_HASH?.trim() ?? '',
  /** Web Push (VAPID). If unset, a key pair is generated once and kept in server/.data/vapid.json. */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY?.trim() ?? '',
  vapidSubject: process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@pill-oh.local',
  /** WhatsApp via Twilio. Alerts over WhatsApp are disabled unless all three are set. */
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN?.trim() ?? '',
  twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM?.trim() ?? '',
  /** Optional approved Content Template SIDs (needed outside the Twilio sandbox for business-initiated messages). */
  twilioReminderContentSid: process.env.TWILIO_REMINDER_CONTENT_SID?.trim() ?? '',
  twilioCodeContentSid: process.env.TWILIO_CODE_CONTENT_SID?.trim() ?? '',
  /** ntfy server for per-user phone alerts (free public ntfy.sh by default; can be self-hosted). */
  ntfyServer: process.env.NTFY_SERVER?.trim() || 'https://ntfy.sh',
  /** Only needed for a self-hosted ntfy server with access control. */
  ntfyToken: process.env.NTFY_TOKEN?.trim() ?? '',
  /** Public app address; tapping an ntfy alert opens it. */
  /** Vercel sets VERCEL_PROJECT_PRODUCTION_URL (host only) on every deployment. */
  siteUrl: (
    process.env.SITE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  ).replace(/\/+$/, ''),
  dataDir: fileURLToPath(new URL('./.data/', import.meta.url)),
  localDbFile: process.env.LOCAL_DB_FILE || fileURLToPath(new URL('./.data/local-db.json', import.meta.url)),
};
