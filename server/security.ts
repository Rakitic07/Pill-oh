import { argon2id, argon2Verify } from 'hash-wasm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Argon2id with OWASP-recommended minimums (19 MiB, 2 passes). WebAssembly, so it bundles for serverless hosts. */
const ARGON2_OPTIONS = { memorySize: 19_456, iterations: 2, parallelism: 1, hashLength: 32 };

export const hashPassword = (password: string) =>
  argon2id({ ...ARGON2_OPTIONS, password, salt: randomBytes(16), outputType: 'encoded' });

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash: passwordHash });
  } catch {
    return false;
  }
}

/**
 * Checks a key against ADMIN_UNLOCK_HASH: either an Argon2id hash of the key (from `npm run admin-unlock-hash`),
 * or the key itself when it's a long random value (32+ characters, e.g. `openssl rand -hex 32`).
 */
export async function verifyAdminUnlockKey(setting: string, key: string): Promise<boolean> {
  if (!setting || !key || key.length > 256) return false;
  if (setting.startsWith('$argon2id$')) return verifyPassword(setting, key);
  if (setting.length < 32) return false;
  return safeEqualHex(sha256(`admin-unlock:${setting}`), sha256(`admin-unlock:${key}`));
}

let decoyHash: Promise<string> | null = null;

/** Spends the same time as a real check so unknown usernames can't be detected by timing. */
export async function burnPasswordCheck(password: string) {
  decoyHash ??= hashPassword(randomBytes(32).toString('hex'));
  await verifyPassword(await decoyHash, password);
}

export const newSessionToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// 32 unambiguous characters (no I, O, 0, 1), so each random byte maps uniformly via `& 31`.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] & 31];
  return out;
}

const groups = (code: string) => code.match(/.{1,4}/g)!.join('-');

/** 20 characters × 5 bits = 100 bits of entropy, shown as XXXX-XXXX-XXXX-XXXX-XXXX. */
export const generateRecoveryCode = () => groups(randomCode(20));

export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const hashRecoveryCode = (code: string) => sha256(`pillpal-recovery:${normalizeRecoveryCode(code)}`);

/** Temporary password handed out by an admin (60 bits, hashed with Argon2id like any password). */
export const generateTempPassword = () => groups(randomCode(12));

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
    setInterval(() => this.prune(), windowMs).unref();
  }

  /** Records an attempt; returns false when the key is over its limit. */
  take(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private prune() {
    const now = Date.now();
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
