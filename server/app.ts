import { getConnInfo } from '@hono/node-server/conninfo';
import { randomInt, randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { config } from './config.ts';
import { deliver, NTFY_KEY, PUSH_KEY, runNotifier, WA_KEY, WA_PENDING_KEY } from './notify/index.ts';
import { isNtfyTopic, newNtfyTopic, ntfyServer } from './notify/ntfy.ts';
import { parsePushSub, pushPublicKey, type PushSub } from './notify/push.ts';
import { maskPhone, parsePhone, sendWhatsApp, whatsappAvailable } from './notify/whatsapp.ts';
import {
  burnPasswordCheck,
  generateRecoveryCode,
  generateTempPassword,
  hashPassword,
  hashRecoveryCode,
  newSessionToken,
  RateLimiter,
  safeEqualHex,
  sha256,
  verifyPassword,
} from './security.ts';
import { DuplicateUserError, type Store, type UserRecord } from './store/types.ts';
import {
  DATA_VALIDATORS,
  parsePassword,
  parseResetAnswers,
  parseUsername,
  PASSWORD_RULE,
  USERNAME_RULE,
} from './validation.ts';

type Env = { Variables: { user: UserRecord | null } };
type Ctx = Context<Env>;

const COOKIE = config.isProd ? '__Host-pp_sid' : 'pp_sid';
// Browsers cap cookie lifetime at 400 days; it is re-issued while the app is in use, so users stay signed in.
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const MINUTE = 60_000;

const LOGIN_FAILED = 'Invalid username or password.';
const ADMIN_LOGIN_FAILED = 'Invalid admin username or password.';
const RECOVERY_FAILED = 'Invalid username or recovery code.';

const publicUser = (u: UserRecord) => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, createdAt: u.createdAt });

const audit = (event: string, details: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...details }));

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

export function createApp(store: Store) {
  const app = new Hono<Env>();

  const limits = {
    login: new RateLimiter(10, 15 * MINUTE),
    signup: new RateLimiter(5, 60 * MINUTE),
    recover: new RateLimiter(5, 15 * MINUTE),
    resetRequest: new RateLimiter(3, 60 * MINUTE),
    sensitive: new RateLimiter(10, 15 * MINUTE),
    whatsappCode: new RateLimiter(3, 60 * MINUTE),
    notifyTest: new RateLimiter(5, 15 * MINUTE),
  };

  const clientIp = (c: Ctx) => {
    if (config.trustProxy) {
      const forwarded = c.req.header('x-forwarded-for');
      if (forwarded) return forwarded.split(',')[0].trim();
    }
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const tooMany = (c: Ctx) => c.json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, 429);

  const setSessionCookie = (c: Ctx, token: string) =>
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'Strict',
      path: '/',
      maxAge: COOKIE_MAX_AGE_S,
    });

  async function startSession(c: Ctx, user: UserRecord) {
    const token = newSessionToken();
    const now = new Date().toISOString();
    await store.createSession({
      tokenHash: sha256(token),
      userId: user.id,
      createdAt: now,
      lastUsedAt: now,
      userAgent: (c.req.header('user-agent') ?? '').slice(0, 200),
    });
    await store.updateUser(user.id, { lastSeenAt: now });
    setSessionCookie(c, token);
  }

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: 'no-referrer',
    }),
  );

  app.use(
    '/api/*',
    bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: 'Payload too large.' }, 413) }),
  );

  // CSRF: state-changing calls must carry a custom header (forces a CORS preflight) and a same-origin Origin.
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if (c.req.header('x-pillpal') !== '1') return c.json({ error: 'Bad request.' }, 403);
      const origin = c.req.header('origin');
      if (origin) {
        let sameOrigin = false;
        try {
          sameOrigin = new URL(origin).host === c.req.header('host');
        } catch {
          sameOrigin = false;
        }
        if (!sameOrigin) return c.json({ error: 'Bad origin.' }, 403);
      }
    }
    await next();
  });

  app.use('/api/*', async (c, next) => {
    c.set('user', null);
    const token = getCookie(c, COOKIE);
    if (token && token.length <= 128) {
      const tokenHash = sha256(token);
      const session = await store.getSession(tokenHash);
      const user = session ? await store.getUserById(session.userId) : null;
      if (session && user) {
        c.set('user', user);
        if (Date.now() - Date.parse(session.lastUsedAt) > TOUCH_INTERVAL_MS) {
          const at = new Date().toISOString();
          await store.touchSession(tokenHash, at);
          await store.updateUser(user.id, { lastSeenAt: at });
          setSessionCookie(c, token);
        }
      }
    }
    await next();
  });

  const requireUser = (c: Ctx) => c.get('user');

  // ---------- auth ----------

  app.post('/api/auth/signup', async (c) => {
    if (!limits.signup.take(clientIp(c))) return tooMany(c);
    const body = await readBody(c);
    const username = parseUsername(body.username);
    const password = parsePassword(body.password);
    if (!username) return c.json({ error: USERNAME_RULE }, 400);
    if (!password) return c.json({ error: PASSWORD_RULE }, 400);

    const recoveryCode = generateRecoveryCode();
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      username,
      usernameLower: username.toLowerCase(),
      passwordHash: await hashPassword(password),
      recoveryHash: hashRecoveryCode(recoveryCode),
      isAdmin: false,
      createdAt: now,
      lastSeenAt: now,
    };
    try {
      await store.createUser(user);
    } catch (err) {
      if (err instanceof DuplicateUserError) return c.json({ error: 'That username is already taken.' }, 409);
      throw err;
    }
    await startSession(c, user);
    audit('auth.signup', { userId: user.id });
    return c.json({ user: publicUser(user), recoveryCode });
  });

  app.post('/api/auth/login', async (c) => {
    const body = await readBody(c);
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const asAdmin = body.admin === true;
    const failed = asAdmin ? ADMIN_LOGIN_FAILED : LOGIN_FAILED;
    const ip = clientIp(c);
    if (!limits.login.take(ip) || !limits.login.take(`u:${username}`)) return tooMany(c);
    if (!username || !password || password.length > 128) return c.json({ error: failed }, 401);

    const user = await store.getUserByUsername(username);
    if (!user) {
      await burnPasswordCheck(password);
      audit('auth.login.fail', { asAdmin });
      return c.json({ error: failed }, 401);
    }
    // Non-admins get the same error as a wrong password, so the admin form can't be used to discover admin accounts.
    if (!(await verifyPassword(user.passwordHash, password)) || (asAdmin && !user.isAdmin)) {
      audit('auth.login.fail', { userId: user.id, asAdmin });
      return c.json({ error: failed }, 401);
    }
    limits.login.reset(`u:${username}`);
    await startSession(c, user);
    audit(asAdmin ? 'auth.admin-login' : 'auth.login', { userId: user.id });
    return c.json({ user: publicUser(user) });
  });

  app.post('/api/auth/recover', async (c) => {
    const body = await readBody(c);
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const code = typeof body.recoveryCode === 'string' ? body.recoveryCode.slice(0, 64) : '';
    if (!limits.recover.take(clientIp(c)) || !limits.recover.take(`u:${username}`)) return tooMany(c);
    const newPassword = parsePassword(body.newPassword);
    if (!newPassword) return c.json({ error: PASSWORD_RULE }, 400);

    const user = username ? await store.getUserByUsername(username) : null;
    if (!user || !code || !safeEqualHex(user.recoveryHash, hashRecoveryCode(code))) {
      audit('auth.recover.fail', user ? { userId: user.id } : {});
      return c.json({ error: RECOVERY_FAILED }, 401);
    }

    // Recovery codes are single-use: issue a fresh one and sign out every other device.
    const recoveryCode = generateRecoveryCode();
    await store.updateUser(user.id, {
      passwordHash: await hashPassword(newPassword),
      recoveryHash: hashRecoveryCode(recoveryCode),
    });
    await store.deleteSessionsForUser(user.id);
    await startSession(c, user);
    audit('auth.recover', { userId: user.id });
    return c.json({ user: publicUser(user), recoveryCode });
  });

  app.get('/api/me', (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    return c.json({ user: publicUser(user) });
  });

  app.post('/api/account/password', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!limits.sensitive.take(`u:${user.id}`)) return tooMany(c);
    const body = await readBody(c);
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const next = parsePassword(body.newPassword);
    if (!next) return c.json({ error: PASSWORD_RULE }, 400);
    if (!(await verifyPassword(user.passwordHash, current))) return c.json({ error: 'Current password is incorrect.' }, 401);

    await store.updateUser(user.id, { passwordHash: await hashPassword(next) });
    await store.deleteSessionsForUser(user.id);
    await startSession(c, user);
    audit('account.password.change', { userId: user.id });
    return c.json({ ok: true });
  });

  app.post('/api/account/recovery-code', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!limits.sensitive.take(`u:${user.id}`)) return tooMany(c);
    const body = await readBody(c);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!(await verifyPassword(user.passwordHash, password))) return c.json({ error: 'Password is incorrect.' }, 401);

    const recoveryCode = generateRecoveryCode();
    await store.updateUser(user.id, { recoveryHash: hashRecoveryCode(recoveryCode) });
    audit('account.recovery.regenerate', { userId: user.id });
    return c.json({ recoveryCode });
  });

  // ---------- user data ----------

  app.get('/api/data', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    const data = await store.getUserData(user.id);
    return c.json({ data: Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith('_'))) });
  });

  app.put('/api/data/:key', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    const key = c.req.param('key');
    const validate = Object.hasOwn(DATA_VALIDATORS, key) ? DATA_VALIDATORS[key] : null;
    if (!validate) return c.json({ error: 'Unknown data key.' }, 404);
    const body = await readBody(c);
    const value = validate(body.value);
    if (value === null) return c.json({ error: 'Invalid data.' }, 400);
    await store.putUserData(user.id, key, value);
    return c.json({ ok: true });
  });

  // ---------- notifications ----------

  const MAX_DEVICES = 10;
  const WA_CODE_TTL_MS = 10 * MINUTE;
  const hashWaCode = (userId: string, phone: string, code: string) => sha256(`pillpal-wa:${userId}:${phone}:${code}`);

  async function notifyStatus(userId: string) {
    const data = await store.getUserData(userId);
    const subs = Array.isArray(data[PUSH_KEY]) ? (data[PUSH_KEY] as PushSub[]) : [];
    const wa = data[WA_KEY] as { phone: string } | undefined;
    const pending = data[WA_PENDING_KEY] as { phone: string; expiresAt: number } | undefined;
    const ntfy = data[NTFY_KEY] as { topic?: string } | undefined;
    return {
      push: { publicKey: pushPublicKey(), devices: subs.length },
      ntfy: isNtfyTopic(ntfy?.topic) ? { server: ntfyServer(), topic: ntfy.topic } : null,
      whatsapp: {
        available: whatsappAvailable(),
        phone: wa?.phone ? maskPhone(wa.phone) : null,
        pending: pending && pending.expiresAt > Date.now() ? maskPhone(pending.phone) : null,
      },
    };
  }

  app.get('/api/notify', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    return c.json(await notifyStatus(user.id));
  });

  app.post('/api/notify/push', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!limits.sensitive.take(`n:${user.id}`)) return tooMany(c);
    const sub = parsePushSub((await readBody(c)).subscription);
    if (!sub) return c.json({ error: 'This browser’s push subscription isn’t supported.' }, 400);
    const data = await store.getUserData(user.id);
    const subs = (Array.isArray(data[PUSH_KEY]) ? (data[PUSH_KEY] as PushSub[]) : []).filter((s) => s.endpoint !== sub.endpoint);
    await store.putUserData(user.id, PUSH_KEY, [...subs, sub].slice(-MAX_DEVICES));
    audit('notify.push.subscribe', { userId: user.id });
    return c.json(await notifyStatus(user.id));
  });

  app.post('/api/notify/push/remove', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    const endpoint = (await readBody(c)).endpoint;
    const data = await store.getUserData(user.id);
    const subs = Array.isArray(data[PUSH_KEY]) ? (data[PUSH_KEY] as PushSub[]) : [];
    await store.putUserData(user.id, PUSH_KEY, subs.filter((s) => s.endpoint !== endpoint));
    return c.json(await notifyStatus(user.id));
  });

  // Creates (or replaces, which cuts off anyone who learned the old one) the user's private ntfy topic.
  app.post('/api/notify/ntfy', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!limits.sensitive.take(`n:${user.id}`)) return tooMany(c);
    await store.putUserData(user.id, NTFY_KEY, { topic: newNtfyTopic(), createdAt: new Date().toISOString() });
    audit('notify.ntfy.topic', { userId: user.id });
    return c.json(await notifyStatus(user.id));
  });

  app.post('/api/notify/ntfy/remove', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    await store.putUserData(user.id, NTFY_KEY, null);
    return c.json(await notifyStatus(user.id));
  });

  app.post('/api/notify/whatsapp/start', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!whatsappAvailable()) return c.json({ error: 'WhatsApp alerts aren’t set up on this server yet.' }, 503);
    if (!limits.whatsappCode.take(`u:${user.id}`) || !limits.whatsappCode.take(clientIp(c))) return tooMany(c);
    const phone = parsePhone((await readBody(c)).phone);
    if (!phone) return c.json({ error: 'Enter the number with country code, e.g. +919876543210.' }, 400);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ok = await sendWhatsApp(phone, {
      body: `Your Pill-oh code is ${code}. It expires in 10 minutes. If you didn’t ask for this, ignore this message.`,
      template: config.twilioCodeContentSid ? { sid: config.twilioCodeContentSid, variables: { 1: code } } : undefined,
    });
    if (!ok) return c.json({ error: 'Couldn’t send a WhatsApp message to that number.' }, 502);
    await store.putUserData(user.id, WA_PENDING_KEY, {
      phone,
      codeHash: hashWaCode(user.id, phone, code),
      expiresAt: Date.now() + WA_CODE_TTL_MS,
      attempts: 0,
    });
    audit('notify.whatsapp.code', { userId: user.id });
    return c.json(await notifyStatus(user.id));
  });

  app.post('/api/notify/whatsapp/verify', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    const code = String((await readBody(c)).code ?? '').replace(/\D/g, '').slice(0, 6);
    const data = await store.getUserData(user.id);
    const pending = data[WA_PENDING_KEY] as { phone: string; codeHash: string; expiresAt: number; attempts: number } | undefined;
    if (!pending || pending.expiresAt < Date.now() || pending.attempts >= 5) {
      return c.json({ error: 'That code has expired. Please request a new one.' }, 400);
    }
    if (code.length !== 6 || !safeEqualHex(pending.codeHash, hashWaCode(user.id, pending.phone, code))) {
      await store.putUserData(user.id, WA_PENDING_KEY, { ...pending, attempts: pending.attempts + 1 });
      return c.json({ error: 'That code isn’t right.' }, 400);
    }
    await store.putUserData(user.id, WA_KEY, { phone: pending.phone, verifiedAt: new Date().toISOString() });
    await store.putUserData(user.id, WA_PENDING_KEY, null);
    audit('notify.whatsapp.verified', { userId: user.id });
    return c.json(await notifyStatus(user.id));
  });

  app.post('/api/notify/whatsapp/remove', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    await store.putUserData(user.id, WA_KEY, null);
    await store.putUserData(user.id, WA_PENDING_KEY, null);
    audit('notify.whatsapp.remove', { userId: user.id });
    return c.json(await notifyStatus(user.id));
  });

  app.post('/api/notify/test', async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!limits.notifyTest.take(`u:${user.id}`)) return tooMany(c);
    const body = await readBody(c);
    const channels = { push: body.push === true, whatsapp: body.whatsapp === true, ntfy: body.ntfy === true };
    const sent = await deliver(store, user.id, await store.getUserData(user.id), {
      title: '💊 Pill-oh test alert',
      body: 'Alerts are working. You’ll get one like this when a dose is due.',
      tag: 'test',
      vars: { meds: 'Test medicine', time: 'now' },
    }, channels);
    if (!sent) return c.json({ error: 'Nothing was delivered. Turn on a channel on this device first.' }, 400);
    return c.json({ sent });
  });

  // Called every minute by Vercel Cron / an external scheduler with `Authorization: Bearer <CRON_SECRET>`.
  app.get('/api/cron/notify', async (c) => {
    const given = sha256(c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '');
    if (!config.cronSecret || !safeEqualHex(given, sha256(config.cronSecret))) return c.json({ error: 'Not found.' }, 404);
    await runNotifier(store);
    return c.json({ ok: true });
  });

  // ---------- password reset requests (public) ----------

  app.post('/api/reset-requests', async (c) => {
    if (!limits.resetRequest.take(clientIp(c))) return tooMany(c);
    const body = await readBody(c);
    const username = typeof body.username === 'string' ? body.username.trim().slice(0, 64) : '';
    const answers = parseResetAnswers(body.answers);
    if (!username) return c.json({ error: 'Please enter your username.' }, 400);
    if (!answers) return c.json({ error: 'Please fill in how the admin can reach you.' }, 400);

    const user = await store.getUserByUsername(username.toLowerCase());
    await store.createResetRequest({
      id: randomUUID(),
      userId: user?.id ?? null,
      username,
      answers,
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    });
    audit('reset.request', user ? { userId: user.id } : { unknownUser: true });
    // Same response whether or not the account exists, so usernames can't be probed here.
    return c.json({ ok: true });
  });

  // ---------- admin ----------

  const admin = new Hono<Env>();

  admin.use('*', async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!user.isAdmin) return c.json({ error: 'Admins only.' }, 403);
    await next();
  });

  async function accountFacts(userId: string) {
    const user = await store.getUserById(userId);
    if (!user) return null;
    const data = await store.getUserData(userId);
    const meds = Array.isArray(data.medicines) ? (data.medicines as { name?: unknown }[]) : [];
    const logs = data.logs && typeof data.logs === 'object' ? Object.keys(data.logs) : [];
    return {
      username: user.username,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      medicines: meds.map((m) => (typeof m.name === 'string' ? m.name : '')).filter(Boolean),
      theme: typeof data.theme === 'string' ? data.theme : null,
      dosesLogged: logs.length,
    };
  }

  async function resetPasswordFor(userId: string, adminId: string) {
    const tempPassword = generateTempPassword();
    await store.updateUser(userId, { passwordHash: await hashPassword(tempPassword) });
    await store.deleteSessionsForUser(userId);
    audit('admin.password.reset', { userId, adminId });
    return tempPassword;
  }

  admin.get('/requests', async (c) => {
    const requests = await store.listResetRequests();
    const enriched = await Promise.all(
      requests.map(async (r) => ({ ...r, userId: undefined, account: r.userId ? await accountFacts(r.userId) : null })),
    );
    return c.json({ requests: enriched });
  });

  admin.post('/requests/:id/resolve', async (c) => {
    const adminUser = c.get('user')!;
    const request = await store.getResetRequest(c.req.param('id'));
    if (!request) return c.json({ error: 'Request not found.' }, 404);
    if (request.status !== 'pending') return c.json({ error: 'This request was already handled.' }, 409);
    const body = await readBody(c);
    const resolvedAt = new Date().toISOString();

    if (body.action === 'reject') {
      await store.updateResetRequest(request.id, { status: 'rejected', resolvedAt });
      audit('admin.request.reject', { requestId: request.id, adminId: adminUser.id });
      return c.json({ ok: true });
    }
    if (body.action !== 'reset') return c.json({ error: 'Unknown action.' }, 400);
    if (!request.userId) return c.json({ error: 'No account exists with this username.' }, 400);

    const tempPassword = await resetPasswordFor(request.userId, adminUser.id);
    await store.updateResetRequest(request.id, { status: 'resolved', resolvedAt });
    return c.json({ tempPassword });
  });

  admin.get('/users', async (c) => {
    const users = await store.listUsers();
    return c.json({
      users: users.map((u) => ({ ...publicUser(u), lastSeenAt: u.lastSeenAt })),
    });
  });

  admin.post('/users/:id/reset-password', async (c) => {
    const adminUser = c.get('user')!;
    const target = await store.getUserById(c.req.param('id'));
    if (!target) return c.json({ error: 'User not found.' }, 404);
    return c.json({ tempPassword: await resetPasswordFor(target.id, adminUser.id) });
  });

  app.route('/api/admin', admin);

  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Something went wrong. Please try again.' }, 500);
  });

  return app;
}
