import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, ApiError, type DataKey } from './api';

export type SyncStatus = 'saved' | 'saving' | 'error';

const SAVE_DELAY_MS = 600;
const RETRY_DELAY_MS = 5_000;

const pending = new Map<DataKey, unknown>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
let status: SyncStatus = 'saved';
const listeners = new Set<() => void>();

function setStatus(next: SyncStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l());
}

function schedule(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

export function queueSave(key: DataKey, value: unknown) {
  pending.set(key, value);
  setStatus('saving');
  schedule(SAVE_DELAY_MS);
}

export async function flush(keepalive = false): Promise<void> {
  clearTimeout(timer);
  if (inFlight) await inFlight;
  if (pending.size === 0) return;

  const batch = [...pending];
  pending.clear();
  inFlight = (async () => {
    try {
      await Promise.all(batch.map(([key, value]) => api.putData(key, value, keepalive)));
      setStatus(pending.size ? 'saving' : 'saved');
    } catch (err) {
      // A 401 means this device was signed out (e.g. an admin reset the password).
      if (err instanceof ApiError && err.status === 401) {
        window.location.reload();
        return;
      }
      for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
      setStatus('error');
      schedule(RETRY_DELAY_MS);
    }
  })();
  await inFlight;
  inFlight = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush(true);
  });
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

/** Like useState, but every change is saved to the server for the signed-in user. */
export function useSyncedState<T>(key: DataKey, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const lastSaved = useRef(value);

  useEffect(() => {
    if (value === lastSaved.current) return;
    lastSaved.current = value;
    queueSave(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
