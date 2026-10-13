import pg from 'pg';
import {
  DuplicateUserError,
  type ResetRequestRecord,
  type ResetStatus,
  type SessionRecord,
  type Store,
  type UserPatch,
  type UserRecord,
} from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY,
  username       TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  recovery_hash  TEXT NOT NULL,
  is_admin       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_data (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS reset_requests (
  id          UUID PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  username    TEXT NOT NULL,
  answers     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
`;

const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());

function toUser(r: Record<string, unknown>): UserRecord {
  return {
    id: r.id as string,
    username: r.username as string,
    usernameLower: r.username_lower as string,
    passwordHash: r.password_hash as string,
    recoveryHash: r.recovery_hash as string,
    isAdmin: r.is_admin as boolean,
    createdAt: iso(r.created_at as Date)!,
    lastSeenAt: iso(r.last_seen_at as Date | null),
  };
}

function toSession(r: Record<string, unknown>): SessionRecord {
  return {
    tokenHash: r.token_hash as string,
    userId: r.user_id as string,
    createdAt: iso(r.created_at as Date)!,
    lastUsedAt: iso(r.last_used_at as Date)!,
    userAgent: r.user_agent as string,
  };
}

function toRequest(r: Record<string, unknown>): ResetRequestRecord {
  return {
    id: r.id as string,
    userId: (r.user_id as string | null) ?? null,
    username: r.username as string,
    answers: r.answers as ResetRequestRecord['answers'],
    status: r.status as ResetStatus,
    createdAt: iso(r.created_at as Date)!,
    resolvedAt: iso(r.resolved_at as Date | null),
  };
}

const USER_COLUMNS: Record<keyof UserPatch, string> = {
  passwordHash: 'password_hash',
  recoveryHash: 'recovery_hash',
  isAdmin: 'is_admin',
  lastSeenAt: 'last_seen_at',
};

export class PgStore implements Store {
  readonly kind = 'postgres' as const;
  private pool: pg.Pool;

  constructor(connectionString: string) {
    const isLocalHost = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(connectionString);
    const hasSslMode = /[?&]sslmode=/.test(connectionString);
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      // Neon requires TLS; verify the server certificate unless the URL already configures sslmode.
      ssl: isLocalHost || hasSslMode ? undefined : { rejectUnauthorized: true },
    });
  }

  async init() {
    await this.pool.query(SCHEMA);
  }

  async close() {
    await this.pool.end();
  }

  async createUser(u: UserRecord) {
    try {
      await this.pool.query(
        `INSERT INTO users (id, username, username_lower, password_hash, recovery_hash, is_admin, created_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [u.id, u.username, u.usernameLower, u.passwordHash, u.recoveryHash, u.isAdmin, u.createdAt, u.lastSeenAt],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new DuplicateUserError();
      throw err;
    }
  }

  async getUserById(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async getUserByUsername(usernameLower: string) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE username_lower = $1', [usernameLower]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async updateUser(id: string, patch: UserPatch) {
    const entries = (Object.keys(patch) as (keyof UserPatch)[]).filter((k) => patch[k] !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map((k, i) => `${USER_COLUMNS[k]} = $${i + 2}`).join(', ');
    await this.pool.query(`UPDATE users SET ${sets} WHERE id = $1`, [id, ...entries.map((k) => patch[k])]);
  }

  async listUsers() {
    const { rows } = await this.pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return rows.map(toUser);
  }

  async createSession(s: SessionRecord) {
    await this.pool.query(
      `INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [s.tokenHash, s.userId, s.createdAt, s.lastUsedAt, s.userAgent],
    );
  }

  async getSession(tokenHash: string) {
    const { rows } = await this.pool.query('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async touchSession(tokenHash: string, at: string) {
    await this.pool.query('UPDATE sessions SET last_used_at = $2 WHERE token_hash = $1', [tokenHash, at]);
  }

  async deleteSessionsForUser(userId: string) {
    await this.pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  async getUserData(userId: string) {
    const { rows } = await this.pool.query('SELECT key, value FROM user_data WHERE user_id = $1', [userId]);
    return Object.fromEntries(rows.map((r) => [r.key as string, r.value as unknown]));
  }

  async putUserData(userId: string, key: string, value: unknown) {
    await this.pool.query(
      `INSERT INTO user_data (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [userId, key, JSON.stringify(value)],
    );
  }

  async createResetRequest(r: ResetRequestRecord) {
    await this.pool.query(
      `INSERT INTO reset_requests (id, user_id, username, answers, status, created_at) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [r.id, r.userId, r.username, JSON.stringify(r.answers), r.status, r.createdAt],
    );
  }

  async getResetRequest(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM reset_requests WHERE id = $1', [id]);
    return rows[0] ? toRequest(rows[0]) : null;
  }

  async listResetRequests() {
    const { rows } = await this.pool.query('SELECT * FROM reset_requests ORDER BY created_at DESC LIMIT 500');
    return rows.map(toRequest);
  }

  async updateResetRequest(id: string, patch: { status: ResetStatus; resolvedAt: string }) {
    await this.pool.query('UPDATE reset_requests SET status = $2, resolved_at = $3 WHERE id = $1', [
      id,
      patch.status,
      patch.resolvedAt,
    ]);
  }
}
