// Prints a new admin unlock key and the ADMIN_UNLOCK_HASH value for it.
//   npm run admin-unlock-hash                    -> generates a random key
//   printf %s 'my own key' | npm run admin-unlock-hash   -> hashes your own key (16+ characters)
import { randomBytes } from 'node:crypto';
import { text } from 'node:stream/consumers';
import { hashPassword } from '../security.ts';

const own = process.stdin.isTTY ? '' : (await text(process.stdin)).replace(/\r?\n$/, '');
if (own && own.length < 16) {
  console.error('Use at least 16 characters for your own key.');
  process.exit(1);
}
const key = own || randomBytes(24).toString('base64url');
const hash = await hashPassword(key);

console.log(own ? '' : `\nUnlock key (save it in a password manager; it is not stored anywhere):\n  ${key}\n`);
console.log(`Set this in Vercel → Settings → Environment Variables, then redeploy:\n  ADMIN_UNLOCK_HASH=${hash}\n`);
