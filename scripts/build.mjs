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
  CAPTURE_INTERFACE,
  CONNECTIONS,
  EVENTS,
  GROUPS,
  MODULES,
  PRODUCT_PARAMETER,
  SANITIZE_KEY,
  dateOf,
} from './definitions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const readEvent = (name) => JSON.parse(readFileSync(join(ROOT, 'samples', 'events', `${name}.json`), 'utf8'));

/** The module name of an event's instant trigger, such as watchCaptureSucceeded. */
export const triggerName = (event) => `watch${event.key[0].toUpperCase()}${event.key.slice(1)}`;

/** Labels that say more than the field's name, the same in every module. */
const LABELS = Object.fromEntries(
  [
    ...CAPTURE_INTERFACE,
    ...CAPTURE_INTERFACE.flatMap((field) => field.spec ?? []),
  ].map((field) => [field.name, field.label]),
);

const label = (name) =>
  LABELS[name] ??
  name
    .split('_')
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
    .replace(/\bid\b/g, 'ID')
    .replace(/\burl\b/gi, 'URL')
    .replace(/\bhttp\b/g, 'HTTP')
    .replace(/ (ms|bytes)$/, ' ($1)');

/** A field's type wherever it appears: the capture's own fields, as GET /captures/{id} returns them. */
const KNOWN = Object.fromEntries(CAPTURE_INTERFACE.map((field) => [field.name, field]));

/** Dates inside an array (such as a delivery's destinations) stay ISO 8601 text: parsing them needs a custom IML
 * function, which Make has not enabled for this app. Their label says so. */
const TEXT_DATE = (name) => ({ name, type: 'text', label: `${label(name)} (ISO 8601)` });

/**
 * Make's interface for a value, from example values. A field the capture also has gets the capture's type and
 * label, so every module and trigger types it the same way (a field that is null in one event's examples is not
 * left as text). Otherwise the type comes from the first example value that is not null; dates are the API's *_at
 * fields. `inArray` marks fields inside an array, whose dates stay text.
 */
export function interfaceFor(name, values, { inArray = false } = {}) {
  const present = values.filter((value) => value !== null && value !== undefined);
  const known = KNOWN[name];
  const first = present[0];
  if (inArray && name.endsWith('_at')) return TEXT_DATE(name);
  // page_source and s3_delivery list the same fields in every module and trigger, even where an event carries
  // only some of them.
  if (known) return { ...known };
  const field = { name, label: label(name) };
  if (first === undefined) return { ...field, type: name.endsWith('_at') ? 'date' : name.endsWith('url') ? 'url' : 'text' };
  if (Array.isArray(first)) {
    const items = present.flat().filter((item) => item && typeof item === 'object');
    return items.length
      ? { ...field, type: 'array', spec: { type: 'collection', spec: collectionSpec(items, { inArray: true }) } }
      : { ...field, type: 'array' };
  }
  if (typeof first === 'object') return { ...field, type: 'collection', spec: collectionSpec(present, { inArray }) };
  if (typeof first === 'boolean') return { ...field, type: 'boolean' };
  if (typeof first === 'number') return { ...field, type: Number.isInteger(first) ? 'uinteger' : 'number' };
  if (name.endsWith('_at')) return { ...field, type: 'date' };
  if (name.endsWith('url')) return { ...field, type: 'url' };
  return { ...field, type: 'text' };
}

function collectionSpec(objects, options) {
  const names = [];
  for (const object of objects) for (const key of Object.keys(object)) if (!names.includes(key)) names.push(key);
  return names.map((key) => interfaceFor(key, objects.map((object) => object[key]), options));
}

/** The *_at fields at the top of an event's data, in any of its examples: the dates the trigger parses. */
const dataDates = (examples) => [
  ...new Set(examples.flatMap((example) => Object.keys(example.data).filter((key) => key.endsWith('_at')))),
];

function webhookFor(event) {
  const filter = event.products
    ? `body.type === '${event.event}' && (!parameters.product || body.product === parameters.product)`
    : `body.type === '${event.event}'`;
  const examples = event.samples.map(readEvent);
  return {
    meta: { label: `Website Screenshot World: ${event.webhookName}`, type: 'web' },
    parameters: event.products ? [PRODUCT_PARAMETER] : [],
    // The Base gives these requests the API address and the key.
    attach: {
      url: '/webhook-endpoints',
      method: 'POST',
      body: {
        url: '{{webhook.url}}',
        events: [event.event],
        name: `Make: ${event.webhookName}`,
        ...(event.products ? { product: '{{parameters.product}}' } : {}),
      },
      response: { data: { externalHookId: '{{body.id}}' } },
      log: { sanitize: [...SANITIZE_KEY, 'request.body.url', 'response.body.url', 'response.body.signing_secret'] },
    },
    detach: {
      url: '/webhook-endpoints/{{webhook.externalHookId}}',
      method: 'DELETE',
    },
    // Each delivery is one event, output as the API sent it, with its dates parsed. Other event types (such as the
    // dashboard's test ping) are acknowledged and dropped.
    api: {
      condition: `{{${filter}}}`,
      respond: { status: 200, type: 'json', body: { received: true } },
      output: {
        '{{...}}': '{{body}}',
        created_at: dateOf('body.created_at'),
        data: {
          '{{...}}': '{{body.data}}',
          ...Object.fromEntries(dataDates(examples).map((key) => [key, dateOf(`body.data.${key}`)])),
        },
      },
    },
  };
}

function triggerFor(event) {
  const examples = event.samples.map(readEvent);
  return {
    meta: { typeId: 10, label: event.label, description: event.description, webhook: event.key },
    api: {},
    parameters: [],
    expect: [],
    interface: [
      { name: 'id', type: 'text', label: 'Event ID' },
      { name: 'type', type: 'text', label: 'Event type' },
      { name: 'created_at', type: 'date', label: 'Created at' },
      { name: 'product', type: 'text', label: 'Product' },
      { ...interfaceFor('data', examples.map((example) => example.data)), label: 'Data' },
    ],
    samples: examples[0],
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
