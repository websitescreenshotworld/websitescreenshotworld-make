// Sends the app/ directory to Make through the Make SDK (`make.sdk`), and reads every section back.
//
// It is safe to run again: the app, connections, webhooks and modules are looked up first and only created when
// missing (connections and webhooks by their label, because Make names them itself). It never publishes the app,
// requests a review, creates a connection with a key, or runs a scenario.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

/** Module sections in the order they are written. */
const MODULE_SECTIONS = ['api', 'parameters', 'expect', 'interface', 'samples'];
const WEBHOOK_SECTIONS = ['api', 'parameters', 'attach', 'detach'];
const CONNECTION_SECTIONS = ['api', 'parameters'];

class CheckFailure extends Error {}

/** A Make API error, described by its status only: bodies can echo section source. */
export function describeError(error) {
  if (error instanceof CheckFailure) return error.message;
  const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : undefined;
  if (status === undefined) return `the request failed without an answer (${error?.name ?? 'error'}); check the app in Make before running again`;
  const meaning =
    status === 400 || status === 422
      ? 'refused as invalid'
      : status === 401
        ? 'the Make API token was refused'
        : status === 403
          ? 'the token lacks the sdk-apps:read or sdk-apps:write scope'
          : status === 404
            ? 'not found'
            : status === 409
              ? 'conflict (the name may be taken)'
              : status >= 500
                ? 'Make had a problem; check the app in Make before running again'
                : 'unexpected answer';
  return `HTTP ${status}: ${meaning}`;
}

/** Removes // and block comments outside strings, so a section Make returns with comments still parses. */
function stripComments(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i += 1;
      } else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
    } else out += ch;
  }
  return out;
}

const parse = (value) => (typeof value === 'string' ? JSON.parse(stripComments(value)) : value);

function readApp(appDir) {
  const read = (path) => readFileSync(join(appDir, path), 'utf8');
  const readJson = (path) => JSON.parse(read(path));
  const dirs = (path) => (existsSync(join(appDir, path)) ? readdirSync(join(appDir, path)).sort() : []);
  const sections = (path, names) =>
    Object.fromEntries(
      names.filter((name) => existsSync(join(appDir, path, `${name}.imljson`))).map((name) => [name, read(`${path}/${name}.imljson`)]),
    );

  return {
    app: readJson('app.json'),
    base: read('base.imljson'),
    groups: read('groups.imljson'),
    docs: read('docs.md'),
    connections: dirs('connections').map((key) => ({
      key,
      meta: readJson(`connections/${key}/meta.json`),
      sections: sections(`connections/${key}`, CONNECTION_SECTIONS),
    })),
    webhooks: dirs('webhooks').map((key) => ({
      key,
      meta: readJson(`webhooks/${key}/meta.json`),
      sections: sections(`webhooks/${key}`, WEBHOOK_SECTIONS),
    })),
    modules: dirs('modules').map((name) => ({
      name,
      meta: readJson(`modules/${name}/meta.json`),
      sections: sections(`modules/${name}`, MODULE_SECTIONS),
    })),
  };
}

/**
 * Uploads app/ through `sdk` (a `make.sdk` from @makehq/sdk). Returns the steps taken; stops at the first failure,
 * leaving what was already written in place.
 */
export async function upload(sdk, appDir, { icon } = {}) {
  const source = readApp(appDir);
  const { app } = source;
  const steps = [];
  let failed = false;

  async function step(name, action) {
    if (failed) {
      steps.push({ name, status: 'not attempted' });
      return undefined;
    }
    try {
      const result = await action();
      steps.push({ name, status: 'ok', ...(typeof result === 'string' ? { detail: result } : {}) });
      return result;
    } catch (error) {
      failed = true;
      steps.push({ name, status: 'failed', detail: describeError(error) });
      return undefined;
    }
  }

  async function writeAndCheck(name, write, read, expected) {
    await step(name, async () => {
      await write();
      const actual = parse(await read());
      if (!isDeepStrictEqual(actual, parse(expected))) {
        throw new CheckFailure('what Make stored differs from what was sent');
      }
    });
  }

  // The app: version 1, created private when it does not exist yet.
  let version = 1;
  await step(`app ${app.name}`, async () => {
    let existing;
    try {
      existing = await sdk.apps.get(app.name, version, { cols: ['name', 'version', 'public'] });
    } catch (error) {
      if (error?.statusCode !== 404) throw error;
    }
    if (existing) {
      await sdk.apps.update(app.name, version, {
        label: app.label,
        description: app.description,
        theme: app.theme,
        language: app.language,
      });
      return `updated (${existing.public ? 'public' : 'private'})`;
    }
    const created = await sdk.apps.create({ ...app, private: true });
    version = created.version;
    const full = await sdk.apps.get(app.name, version, { cols: ['name', 'version', 'public'] });
    if (full.public !== false) throw new CheckFailure('Make did not confirm that the new app is private; nothing else was written');
    return 'created (private)';
  });

  await writeAndCheck(
    'app base',
    () => sdk.apps.setSection(app.name, version, 'base', source.base),
    () => sdk.apps.getSection(app.name, version, 'base'),
    source.base,
  );
  await writeAndCheck(
    'app groups',
    () => sdk.apps.setSection(app.name, version, 'groups', source.groups),
    () => sdk.apps.getSection(app.name, version, 'groups'),
    source.groups,
  );
  await step('app docs', () => sdk.apps.setDocs(app.name, version, source.docs));
  if (icon) await step('app icon', () => sdk.apps.setIcon(app.name, version, icon));

  // Connections, looked up by label because Make names them.
  const connectionNames = {};
  const existingConnections = (await step('list connections', () => sdk.connections.list(app.name))) ?? [];
  for (const connection of source.connections) {
    const name = await step(`connection ${connection.key}`, async () => {
      const found = existingConnections.find((item) => item.label === connection.meta.label);
      if (found) return found.name;
      return (await sdk.connections.create(app.name, { type: connection.meta.type, label: connection.meta.label })).name;
    });
    connectionNames[connection.key] = name;
    for (const [section, text] of Object.entries(connection.sections)) {
      await writeAndCheck(
        `connection ${connection.key} ${section}`,
        () => sdk.connections.setSection(name, section, text),
        () => sdk.connections.getSection(name, section),
        text,
      );
    }
  }

  // Webhooks, also looked up by label; each takes either connection.
  const webhookNames = {};
  const existingWebhooks = (await step('list webhooks', () => sdk.webhooks.list(app.name))) ?? [];
  for (const webhook of source.webhooks) {
    const binding = {
      connection: connectionNames[webhook.meta.connection],
      altConnection: connectionNames[webhook.meta.altConnection],
    };
    const name = await step(`webhook ${webhook.key}`, async () => {
      const found = existingWebhooks.find((item) => item.label === webhook.meta.label);
      const hookName = found
        ? found.name
        : (await sdk.webhooks.create(app.name, { type: webhook.meta.type, label: webhook.meta.label, connection: binding.connection })).name;
      await sdk.webhooks.update(hookName, { label: webhook.meta.label, ...binding });
      return hookName;
    });
    webhookNames[webhook.key] = name;
    for (const [section, text] of Object.entries(webhook.sections)) {
      await writeAndCheck(
        `webhook ${webhook.key} ${section}`,
        () => sdk.webhooks.setSection(name, section, text),
        () => sdk.webhooks.getSection(name, section),
        text,
      );
    }
  }

  // Modules: a capture or call module is bound to its connection, an instant trigger to its webhook.
  const existingModules = (await step('list modules', () => sdk.modules.list(app.name, version))) ?? [];
  for (const module of source.modules) {
    const { meta } = module;
    const connection = meta.connection ? connectionNames[meta.connection] : undefined;
    const webhook = meta.webhook ? webhookNames[meta.webhook] : undefined;
    await step(`module ${module.name}`, async () => {
      const found = existingModules.find((item) => item.name === module.name);
      if (found) {
        if (found.typeId !== undefined && found.typeId !== meta.typeId) {
          throw new CheckFailure(`exists in Make as another module type (${found.typeId}); a type cannot change`);
        }
        await sdk.modules.update(app.name, version, module.name, {
          label: meta.label,
          description: meta.description,
          ...(connection ? { connection } : {}),
        });
        return 'updated';
      }
      await sdk.modules.create(app.name, version, {
        name: module.name,
        typeId: meta.typeId,
        label: meta.label,
        description: meta.description,
        moduleInitMode: 'blank',
        ...(connection ? { connection } : {}),
        ...(webhook ? { webhook } : {}),
      });
      return 'created (private)';
    });
    for (const [section, text] of Object.entries(module.sections)) {
      // An instant trigger takes no mappable parameters.
      if (section === 'expect' && meta.typeId === 10) continue;
      await writeAndCheck(
        `module ${module.name} ${section}`,
        () => sdk.modules.setSection(app.name, version, module.name, section, text),
        () => sdk.modules.getSection(app.name, version, module.name, section),
        text,
      );
    }
  }

  return { ok: !failed, app: { name: app.name, version }, steps };
}

export function formatReport(report) {
  const lines = [`App: ${report.app.name}, version ${report.app.version}`];
  for (const step of report.steps) {
    lines.push(`  ${step.status === 'ok' ? 'ok    ' : step.status === 'failed' ? 'FAILED' : 'skip  '} ${step.name}${step.detail ? `: ${step.detail}` : ''}`);
  }
  lines.push(
    report.ok
      ? 'Done. Everything was written and read back. Nothing was published, and no review was requested.'
      : 'Stopped at the failure above. What was written before it stays in Make; fix the cause and run again.',
  );
  return lines.join('\n');
}
