// Checks the Make API token in .env.local without changing anything: `npm run diagnose`.
// Prints the token's scopes and organization binding, the custom apps it can see, and whether the app name
// in app/app.json (and any names given after --) is free, yours, or someone else's. Never prints the token.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Make } from '@makehq/sdk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnvFile() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

const status = (error) => (typeof error?.statusCode === 'number' ? `HTTP ${error.statusCode}` : (error?.name ?? 'error'));

const env = { ...readEnvFile(), ...process.env };
const token = env.MAKE_API_KEY?.trim();
const zone = env.MAKE_ZONE?.trim();
if (!token || !zone || !/^[a-z0-9-]+\.make\.(?:com|celonis\.com)$/.test(zone)) {
  console.error('Set MAKE_API_KEY and MAKE_ZONE (such as eu1.make.com) in .env.local first.');
  process.exit(2);
}

const make = new Make(token, zone);
const appName = JSON.parse(readFileSync(join(ROOT, 'app', 'app.json'), 'utf8')).name;

try {
  const auth = await make.users.currentAuthorization();
  console.log(`Token scopes: ${auth.scope.join(', ') || '(none)'}`);
  console.log(
    `Bound to an organization: ${auth.organizationId === undefined ? 'unknown' : auth.organizationId === null ? 'no (all organizations)' : `yes (${auth.organizationId})`}`,
  );
} catch (error) {
  console.log(`Reading the token's authorization failed: ${status(error)}`);
}

try {
  const apps = await make.sdk.apps.list({ cols: ['name', 'label', 'version', 'public'] });
  console.log(`Custom apps this token can see: ${apps.length}${apps.length ? ` (${apps.map((app) => app.name).join(', ')})` : ''}`);
} catch (error) {
  console.log(`Listing custom apps failed: ${status(error)}`);
}

// Names to check: app/app.json's, plus any given on the command line (npm run diagnose -- name-a name-b).
for (const name of [appName, ...process.argv.slice(2)]) {
  try {
    const app = await make.sdk.apps.get(name, 1, { cols: ['name', 'public'] });
    console.log(`App "${name}": exists and is yours (${app.public ? 'public' : 'private'}).`);
  } catch (error) {
    const code = error?.statusCode;
    console.log(
      `App "${name}": ${code === 404 ? 'free' : code === 403 ? 'not one of your apps (Make answers 403 both for a name nobody uses and for someone else\'s app)' : status(error)}.`,
    );
  }
}
