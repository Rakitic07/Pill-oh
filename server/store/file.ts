import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  DuplicateUserError,
  type ResetRequestRecord,
  type ResetStatus,
  type SessionRecord,
  type Store,
  type UserPatch,
  type UserRecord,
} from './types.ts';

interface FileDb {
  users: UserRecord[];
  sessions: SessionRecord[];
  userData: Record<string, Record<string, unknown>>;
  resetRequests: ResetRequestRecord[];
}

const emptyDb = (): FileDb => ({ users: [], sessions: [], userData: {}, resetRequests: [] });

/** Local JSON-file store so the app runs without any database. Not meant for multi-instance deployments. */
export class FileStore implements Store {
  readonly kind = 'file' as const;
  private file: string;
  private db: FileDb = emptyDb();
  private mtime = 0;
  private writing: Promise<void> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  async init() {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    try {
      await this.reload();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      await this.persist();
    }
  }

  async close() {
    await this.writing;
  }

  private async reload() {
    const raw = await readFile(this.file, 'utf8');
    this.db = { ...emptyDb(), ...(JSON.parse(raw) as Partial<FileDb>) };
    this.mtime = (await stat(this.file)).mtimeMs;
  }

  /** Picks up changes written by other processes (e.g. the make-admin script). */
  private async sync() {
    await this.writing;
    try {
      const { mtimeMs } = await stat(this.file);
      if (mtimeMs !== this.mtime) await this.reload();
    } catch {
      // File missing: keep the in-memory copy; the next write recreates it.
    }
  }

  private persist() {
    const snapshot = JSON.stringify(this.db, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, this.file);
      this.mtime = (await stat(this.file)).mtimeMs;
    });
    return this.writing;
  }

  async createUser(user: UserRecord) {
    await this.sync();
    if (this.db.users.some((u) => u.usernameLower === user.usernameLower)) throw new DuplicateUserError();
    this.db.users.push(user);
    await this.persist();
  }

  async getUserById(id: string) {
    await this.sync();
    return this.db.users.find((u) => u.id === id) ?? null;
  }

  async getUserByUsername(usernameLower: string) {
    await this.sync();
    return this.db.users.find((u) => u.usernameLower === usernameLower) ?? null;
  }

  async updateUser(id: string, patch: UserPatch) {
    await this.sync();
    const user = this.db.users.find((u) => u.id === id);
    if (!user) return;
    Object.assign(user, patch);
    await this.persist();
  }

  async listUsers() {
    await this.sync();
    return [...this.db.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createSession(session: SessionRecord) {
    await this.sync();
    this.db.sessions.push(session);
    await this.persist();
  }

  async getSession(tokenHash: string) {
    await this.sync();
    return this.db.sessions.find((s) => s.tokenHash === tokenHash) ?? null;
  }

  async touchSession(tokenHash: string, at: string) {
    await this.sync();
    const session = this.db.sessions.find((s) => s.tokenHash === tokenHash);
    if (!session) return;
    session.lastUsedAt = at;
    await this.persist();
  }

  async deleteSession(tokenHash: string) {
    await this.sync();
    this.db.sessions = this.db.sessions.filter((s) => s.tokenHash !== tokenHash);
    await this.persist();
  }

  async deleteSessionsForUser(userId: string) {
    await this.sync();
    this.db.sessions = this.db.sessions.filter((s) => s.userId !== userId);
    await this.persist();
  }

  async getUserData(userId: string) {
    await this.sync();
    return { ...(this.db.userData[userId] ?? {}) };
  }

  async putUserData(userId: string, key: string, value: unknown) {
    await this.sync();
    this.db.userData[userId] = { ...(this.db.userData[userId] ?? {}), [key]: value };
    await this.persist();
  }

  async createResetRequest(request: ResetRequestRecord) {
    await this.sync();
    this.db.resetRequests.push(request);
    await this.persist();
  }

  async getResetRequest(id: string) {
    await this.sync();
    return this.db.resetRequests.find((r) => r.id === id) ?? null;
  }

  async listResetRequests() {
    await this.sync();
    return [...this.db.resetRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateResetRequest(id: string, patch: { status: ResetStatus; resolvedAt: string }) {
    await this.sync();
    const request = this.db.resetRequests.find((r) => r.id === id);
    if (!request) return;
    Object.assign(request, patch);
    await this.persist();
  }
}
