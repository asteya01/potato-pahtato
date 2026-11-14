// Copies the real D1 database id into wrangler.jsonc so you never have to edit it by hand.
// Usage: npm run set-db-id            (looks the id up with wrangler)
//        npm run set-db-id -- <id>    (or pass it yourself)
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const NAME = 'potato-pahtato';
let id = process.argv[2];
if (!id) {
  const out = execSync('npx wrangler d1 list --json', { encoding: 'utf8' });
  const list = JSON.parse(out.slice(out.indexOf('[')));
  const db = list.find((d) => d.name === NAME);
  if (!db) { console.error(`No D1 database named "${NAME}" found. Run: npx wrangler d1 create ${NAME}`); process.exit(1); }
  id = db.uuid;
}
if (!/^[0-9a-f-]{36}$/i.test(id)) { console.error(`"${id}" does not look like a database id.`); process.exit(1); }
const file = 'wrangler.jsonc';
const text = readFileSync(file, 'utf8');
const next = text.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${id}$2`);
if (next === text && !text.includes(id)) { console.error('Could not find "database_id" in wrangler.jsonc'); process.exit(1); }
writeFileSync(file, next);
console.log(`wrangler.jsonc now points at database ${id}`);
