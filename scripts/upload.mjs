// Uploads app/ to your Make account: `npm run upload` (a dry run that sends nothing), then
// `npm run upload -- --live`.
//
// It reads MAKE_API_KEY and MAKE_ZONE from the environment or from .env.local (never from the command line, so
// the token stays out of your shell history). The token needs the sdk-apps:read and sdk-apps:write scopes.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Make } from '@makehq/sdk';
import { formatReport, upload } from './upload-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Only bare Make hostnames, such as eu2.make.com or us1.make.com: the token is sent to this host.
const ZONE = /^[a-z0-9-]+\.make\.(?:com|celonis\.com)$/;

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

async function main() {
  const live = process.argv.includes('--live');
  const env = { ...readEnvFile(), ...process.env };
  const token = env.MAKE_API_KEY?.trim();
  const zone = env.MAKE_ZONE?.trim();
  const appDir = join(ROOT, 'app');

  if (!existsSync(join(appDir, 'app.json'))) {
    console.error('There is no app/ to upload. Run "npm run build" first.');
    process.exit(2);
  }

  if (!live) {
    const app = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8'));
    console.log(`Dry run: nothing was sent. With --live this uploads app/ as "${app.name}" (version 1, private) to ${zone ?? 'MAKE_ZONE'}.`);
    console.log(`MAKE_API_KEY is ${token ? 'set' : 'NOT set'}; MAKE_ZONE is ${zone ? (ZONE.test(zone) ? 'set' : 'set but not a Make hostname') : 'NOT set'}.`);
    return;
  }

  if (!token || !zone) {
    console.error('Set MAKE_API_KEY and MAKE_ZONE in .env.local (see README.md).');
    process.exit(2);
  }
  if (!ZONE.test(zone)) {
    console.error('MAKE_ZONE must be a Make hostname such as eu2.make.com, without https:// or a path.');
    process.exit(2);
  }

  const make = new Make(token, zone);
  const icon = readFileSync(join(ROOT, 'assets', 'logo-512.png'));
  const report = await upload(make.sdk, appDir, { icon: new Uint8Array(icon) });
  console.log(formatReport(report));
  process.exit(report.ok ? 0 : 1);
}

await main();
