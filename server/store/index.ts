import { config } from '../config.ts';
import { FileStore } from './file.ts';
import { PgStore } from './postgres.ts';
import type { Store } from './types.ts';

export class ConfigError extends Error {}

export async function createStore(): Promise<Store> {
  if (!config.databaseUrl && config.isVercel) {
    throw new ConfigError('DATABASE_URL is not set. Add your Neon connection string in Vercel → Settings → Environment Variables, then redeploy.');
  }
  const store: Store = config.databaseUrl ? new PgStore(config.databaseUrl) : new FileStore(config.localDbFile);
  await store.init();
  return store;
}
