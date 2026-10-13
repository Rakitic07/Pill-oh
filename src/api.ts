import type { CustomTheme } from './customTheme';
import type { ThemeId } from './themes';
import type { DoseLogs, Medicine, Settings } from './types';

export interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface NotifyPrefs {
  push: boolean;
  whatsapp: boolean;
  ntfy: boolean;
  leadMinutes: number;
  missedNudge: boolean;
  timeZone: string;
}

export interface NotifyStatus {
  push: { publicKey: string; devices: number };
  ntfy: { server: string; topic: string } | null;
  whatsapp: { available: boolean; phone: string | null; pending: string | null };
}

export interface UserData {
  medicines?: Medicine[];
  logs?: DoseLogs;
  settings?: Settings;
  theme?: ThemeId;
  customTheme?: CustomTheme;
  notify?: NotifyPrefs;
}

export type DataKey = keyof UserData;

export interface ResetAnswers {
  medicines: string;
  signupWhen: string;
  theme: string;
  contact: string;
  note: string;
}

export interface AdminRequest {
  id: string;
  username: string;
  answers: ResetAnswers;
  status: 'pending' | 'resolved' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
  account: null | {
    username: string;
    createdAt: string;
    lastSeenAt: string | null;
    medicines: string[];
    theme: string | null;
    dosesLogged: number;
  };
}

export interface AdminUser extends User {
  lastSeenAt: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Bodies above ~64 KB can't use `keepalive`, so large saves on page close fall back to a normal request.
const KEEPALIVE_LIMIT = 60_000;

async function request<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-PillPal': '1' },
      body: payload,
      keepalive: keepalive && (payload?.length ?? 0) < KEEPALIVE_LIMIT,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong.');
  return data as T;
}

export const api = {
  me: () => request<{ user: User }>('GET', '/me'),
  signup: (username: string, password: string) =>
    request<{ user: User; recoveryCode: string }>('POST', '/auth/signup', { username, password }),
  login: (username: string, password: string, admin = false) =>
    request<{ user: User }>('POST', '/auth/login', { username, password, admin }),
  recover: (username: string, recoveryCode: string, newPassword: string) =>
    request<{ user: User; recoveryCode: string }>('POST', '/auth/recover', { username, recoveryCode, newPassword }),
  requestReset: (username: string, answers: ResetAnswers) =>
    request<{ ok: true }>('POST', '/reset-requests', { username, answers }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('POST', '/account/password', { currentPassword, newPassword }),
  newRecoveryCode: (password: string) => request<{ recoveryCode: string }>('POST', '/account/recovery-code', { password }),

  getData: () => request<{ data: UserData }>('GET', '/data'),
  putData: (key: DataKey, value: unknown, keepalive = false) =>
    request<{ ok: true }>('PUT', `/data/${key}`, { value }, keepalive),

  notify: {
    status: () => request<NotifyStatus>('GET', '/notify'),
    subscribe: (subscription: PushSubscriptionJSON) => request<NotifyStatus>('POST', '/notify/push', { subscription }),
    unsubscribe: (endpoint: string) => request<NotifyStatus>('POST', '/notify/push/remove', { endpoint }),
    createNtfy: () => request<NotifyStatus>('POST', '/notify/ntfy', {}),
    removeNtfy: () => request<NotifyStatus>('POST', '/notify/ntfy/remove', {}),
    startWhatsApp: (phone: string) => request<NotifyStatus>('POST', '/notify/whatsapp/start', { phone }),
    verifyWhatsApp: (code: string) => request<NotifyStatus>('POST', '/notify/whatsapp/verify', { code }),
    removeWhatsApp: () => request<NotifyStatus>('POST', '/notify/whatsapp/remove', {}),
    test: (channels: { push: boolean; whatsapp: boolean; ntfy: boolean }) => request<{ sent: number }>('POST', '/notify/test', channels),
  },

  admin: {
    requests: () => request<{ requests: AdminRequest[] }>('GET', '/admin/requests'),
    resolve: (id: string, action: 'reset' | 'reject') =>
      request<{ tempPassword?: string }>('POST', `/admin/requests/${encodeURIComponent(id)}/resolve`, { action }),
    users: () => request<{ users: AdminUser[] }>('GET', '/admin/users'),
    resetUser: (id: string) =>
      request<{ tempPassword: string }>('POST', `/admin/users/${encodeURIComponent(id)}/reset-password`, {}),
  },
};
