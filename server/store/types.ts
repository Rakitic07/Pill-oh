export interface UserRecord {
  id: string;
  /** Username as typed at sign-up (for display). */
  username: string;
  /** Lower-cased username; unique, used for case-insensitive lookup. */
  usernameLower: string;
  passwordHash: string;
  recoveryHash: string;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

export type UserPatch = Partial<Pick<UserRecord, 'passwordHash' | 'recoveryHash' | 'isAdmin' | 'lastSeenAt'>>;

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string;
}

export interface ResetAnswers {
  medicines: string;
  signupWhen: string;
  theme: string;
  contact: string;
  note: string;
}

export type ResetStatus = 'pending' | 'resolved' | 'rejected';

export interface ResetRequestRecord {
  id: string;
  userId: string | null;
  username: string;
  answers: ResetAnswers;
  status: ResetStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export class DuplicateUserError extends Error {}

export interface Store {
  readonly kind: 'postgres' | 'file';
  init(): Promise<void>;
  close(): Promise<void>;

  createUser(user: UserRecord): Promise<void>;
  getUserById(id: string): Promise<UserRecord | null>;
  getUserByUsername(usernameLower: string): Promise<UserRecord | null>;
  updateUser(id: string, patch: UserPatch): Promise<void>;
  listUsers(): Promise<UserRecord[]>;

  createSession(session: SessionRecord): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(tokenHash: string, at: string): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;

  getUserData(userId: string): Promise<Record<string, unknown>>;
  putUserData(userId: string, key: string, value: unknown): Promise<void>;

  createResetRequest(request: ResetRequestRecord): Promise<void>;
  getResetRequest(id: string): Promise<ResetRequestRecord | null>;
  listResetRequests(): Promise<ResetRequestRecord[]>;
  updateResetRequest(id: string, patch: { status: ResetStatus; resolvedAt: string }): Promise<void>;
}
