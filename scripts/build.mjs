// Writes the Make app's component files under app/ from scripts/definitions.mjs and the example events in
// samples/events/. `npm run build` writes them; `npm run build -- --check` fails when app/ is out of date.
//
// app/ layout (a convention of this repository, read by scripts/upload.mjs):
//   app.json, base.imljson, groups.imljson, docs.md
//   connections/<key>/{meta.json, api.imljson, parameters.imljson}
//   webhooks/<key>/{meta.json, api.imljson, parameters.imljson, attach.imljson, detach.imljson}
//   modules/<name>/{meta.json, api.imljson, expect.imljson, parameters.imljson, interface.imljson, samples.imljson}

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP,
  BASE,
  CONNECTIONS,
  EVENTS,
  GROUPS,
  MODULES,
  PRODUCT_PARAMETER,
  SANITIZE_KEY,
} from './definitions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const readEvent = (name) => JSON.parse(readFileSync(join(ROOT, 'samples', 'events', `${name}.json`), 'utf8'));

/** The module name of an event's instant trigger, such as watchCaptureSucceeded. */
export const triggerName = (event) => `watch${event.key[0].toUpperCase()}${event.key.slice(1)}`;

const label = (name) =>
  name === 'id'
    ? 'Capture ID'
    : name
    .split('_')
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
    .replace(/\bid\b/g, 'ID')
    .replace(/\burl\b/gi, 'URL')
    .replace(/\bsha256\b/g, 'SHA-256')
    .replace(/\bhttp\b/g, 'HTTP');

/**
 * Make's interface for a value, from example values. Fields seen in any example are listed once; a field that is
 * null in every example is text. Dates are the API's *_at fields.
 */
export function interfaceFor(name, values) {
  const present = values.filter((value) => value !== null && value !== undefined);
  const field = { name, label: label(name) };
  const first = present[0];
  if (first === undefined) return { ...field, type: name.endsWith('_at') ? 'date' : name.endsWith('url') ? 'url' : 'text' };
  if (Array.isArray(first)) {
    const items = present.flat().filter((item) => item && typeof item === 'object');
    return items.length
      ? { ...field, type: 'array', spec: { type: 'collection', spec: collectionSpec(items) } }
      : { ...field, type: 'array' };
  }
  if (typeof first === 'object') return { ...field, type: 'collection', spec: collectionSpec(present) };
  if (typeof first === 'boolean') return { ...field, type: 'boolean' };
  if (typeof first === 'number') return { ...field, type: 'number' };
  if (name.endsWith('_at')) return { ...field, type: 'date' };
  if (name.endsWith('url')) return { ...field, type: 'url' };
  return { ...field, type: 'text' };
}

function collectionSpec(objects) {
  const names = [];
  for (const object of objects) for (const key of Object.keys(object)) if (!names.includes(key)) names.push(key);
  return names.map((key) => interfaceFor(key, objects.map((object) => object[key])));
}

function webhookFor(event) {
  const filter = event.products
    ? `body.type === '${event.event}' && (!parameters.product || body.product === parameters.product)`
    : `body.type === '${event.event}'`;
  return {
    meta: { label: `Website Screenshot World: ${event.label.replace(/^Watch /, '')}`, type: 'web' },
    parameters: event.products ? [PRODUCT_PARAMETER] : [],
    attach: {
      url: '{{connection.apiBase}}/webhook-endpoints',
      method: 'POST',
      headers: { 'x-api-key': '{{connection.apiKey}}' },
      body: {
        url: '{{webhook.url}}',
        events: [event.event],
        name: `Make: ${event.label.replace(/^Watch /, '')}`,
        ...(event.products ? { product: '{{parameters.product}}' } : {}),
      },
      response: { data: { externalHookId: '{{body.id}}' } },
      log: { sanitize: [...SANITIZE_KEY, 'request.body.url', 'response.body.url', 'response.body.signing_secret'] },
    },
    detach: {
      url: '{{connection.apiBase}}/webhook-endpoints/{{webhook.externalHookId}}',
      method: 'DELETE',
      headers: { 'x-api-key': '{{connection.apiKey}}' },
      log: { sanitize: SANITIZE_KEY },
    },
    // Each delivery is one event, kept as the API sent it: id (the event's own, stable across retries), event,
    // product, created_at and data. Other event types (such as the dashboard's test ping) are acknowledged and
    // dropped.
    api: {
      condition: `{{${filter}}}`,
      respond: { status: 200, type: 'json', body: { received: true } },
      output: {
        id: '{{body.id}}',
        event: '{{body.type}}',
        product: '{{body.product}}',
        created_at: '{{body.created_at}}',
        data: '{{body.data}}',
      },
    },
  };
}

function triggerFor(event) {
  const examples = event.samples.map(readEvent);
  const first = examples[0];
  return {
    meta: { typeId: 10, label: event.label, description: event.description, webhook: event.key },
    api: {},
    parameters: [],
    expect: [],
    interface: [
      { name: 'id', type: 'text', label: 'Event ID' },
      { name: 'event', type: 'text', label: 'Event' },
      { name: 'product', type: 'text', label: 'Product' },
      { name: 'created_at', type: 'date', label: 'Created at' },
      { ...interfaceFor('data', examples.map((example) => example.data)), label: 'Data' },
    ],
    samples: { id: first.id, event: first.type, product: first.product, created_at: first.created_at, data: first.data },
  };
}

/** Every file of the app, as relative path -> content. */
export function buildFiles() {
  const files = new Map();
  const put = (path, value) => files.set(path, typeof value === 'string' ? value : json(value));

  put('app.json', APP);
  put('base.imljson', BASE);
  put(
    'groups.imljson',
    GROUPS.map((group) => ({ label: group.label, modules: group.modules })),
  );
  put('docs.md', readFileSync(join(ROOT, 'scripts', 'docs.md'), 'utf8'));

  for (const [key, definition] of Object.entries(CONNECTIONS)) {
    put(`connections/${key}/meta.json`, { label: definition.label, type: definition.type });
    put(`connections/${key}/api.imljson`, definition.api);
    put(`connections/${key}/parameters.imljson`, definition.parameters);
  }

  for (const event of EVENTS) {
    const webhook = webhookFor(event);
    put(`webhooks/${event.key}/meta.json`, {
      ...webhook.meta,
      connection: 'instantSnap',
      altConnection: 'autoSchedule',
    });
    for (const section of ['api', 'parameters', 'attach', 'detach']) {
      put(`webhooks/${event.key}/${section}.imljson`, webhook[section]);
    }

    const trigger = triggerFor(event);
    const name = triggerName(event);
    put(`modules/${name}/meta.json`, trigger.meta);
    for (const section of ['api', 'parameters', 'expect', 'interface', 'samples']) {
      put(`modules/${name}/${section}.imljson`, trigger[section]);
    }
  }

  for (const [name, module] of Object.entries(MODULES)) {
    put(`modules/${name}/meta.json`, {
      typeId: module.typeId,
      label: module.label,
      description: module.description,
      connection: module.connection,
    });
    put(`modules/${name}/api.imljson`, module.api);
    put(`modules/${name}/parameters.imljson`, []);
    put(`modules/${name}/expect.imljson`, module.expect);
    put(`modules/${name}/interface.imljson`, module.interface);
    if (module.samples !== null) put(`modules/${name}/samples.imljson`, module.samples);
  }

  return files;
}

function listExisting(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listExisting(path, found);
    else found.push(relative(join(ROOT, 'app'), path));
  }
  return found;
}

function main() {
  const check = process.argv.includes('--check');
  const files = buildFiles();
  const appDir = join(ROOT, 'app');

  if (check) {
    const stale = [];
    for (const [path, content] of files) {
      const target = join(appDir, path);
      if (!existsSync(target) || readFileSync(target, 'utf8') !== content) stale.push(path);
    }
    for (const path of listExisting(appDir)) if (!files.has(path)) stale.push(`${path} (not generated)`);
    if (stale.length) {
      console.error(`app/ is out of date; run "npm run build":\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`app/ is up to date (${files.size} files).`);
    return;
  }

  rmSync(appDir, { recursive: true, force: true });
  for (const [path, content] of files) {
    mkdirSync(dirname(join(appDir, path)), { recursive: true });
    writeFileSync(join(appDir, path), content);
  }
  console.log(`Wrote ${files.size} files to app/.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
