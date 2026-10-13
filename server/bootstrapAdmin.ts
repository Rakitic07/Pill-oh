import { randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { generateRecoveryCode, hashPassword, hashRecoveryCode } from './security.ts';
import type { Store } from './store/types.ts';
import { parsePassword, parseUsername, PASSWORD_RULE, USERNAME_RULE } from './validation.ts';

/**
 * If ADMIN_USERNAME / ADMIN_PASSWORD are set, makes sure that account exists and is an admin.
 * An existing account keeps its current password; ADMIN_PASSWORD is only used when creating it.
 */
export async function bootstrapAdmin(store: Store) {
  if (!config.adminUsername && !config.adminPassword) return;

  const username = parseUsername(config.adminUsername);
  if (!username) {
    console.warn(`ADMIN_USERNAME ignored: ${USERNAME_RULE}`);
    return;
  }

  const existing = await store.getUserByUsername(username.toLowerCase());
  if (existing) {
    if (!existing.isAdmin) {
      await store.updateUser(existing.id, { isAdmin: true });
      console.log(`Admin access granted to existing account "${existing.username}".`);
    }
    return;
  }

  const password = parsePassword(config.adminPassword);
  if (!password) {
    console.warn(`Admin account not created — ADMIN_PASSWORD: ${PASSWORD_RULE}`);
    return;
  }

  const now = new Date().toISOString();
  await store.createUser({
    id: randomUUID(),
    username,
    usernameLower: username.toLowerCase(),
    passwordHash: await hashPassword(password),
    // Unknown to anyone; the admin can generate a fresh recovery code from the account menu.
    recoveryHash: hashRecoveryCode(generateRecoveryCode()),
    isAdmin: true,
    createdAt: now,
    lastSeenAt: now,
  });
  console.log(`Admin account "${username}" created. Remove ADMIN_PASSWORD from .env now if you like; it isn't needed again.`);
}
