import { createStore } from '../store/index.ts';

const [username, flag] = process.argv.slice(2);
if (!username) {
  console.error('Usage: npm run make-admin -- <username> [--revoke]');
  process.exit(1);
}

const store = await createStore();
const user = await store.getUserByUsername(username.trim().toLowerCase());
if (!user) {
  console.error(`No user named "${username}". Sign up in the app first, then run this again.`);
  await store.close();
  process.exit(1);
}

const isAdmin = flag !== '--revoke';
await store.updateUser(user.id, { isAdmin });
console.log(`${user.username} is ${isAdmin ? 'now an admin' : 'no longer an admin'} (storage: ${store.kind}).`);
await store.close();
