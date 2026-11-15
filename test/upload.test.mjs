import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { formatReport, upload } from '../scripts/upload-core.mjs';

const APP_DIR = join(import.meta.dirname, '..', 'app');

/**
 * An in-memory stand-in for `make.sdk`: it keeps what was written, names connections and webhooks the way Make
 * does (app name plus a number), and records every call.
 */
function fakeMake({ appPublic = false, changeOnRead = null } = {}) {
  const calls = [];
  const state = { apps: [], sections: new Map(), connections: [], webhooks: [], modules: [] };
  const record = (name, ...args) => calls.push([name, ...args]);
  const store = (key, value) => state.sections.set(key, value);
  const load = (key) => (changeOnRead === key ? '{"changed": true}' : state.sections.get(key));

  const sdk = {
    apps: {
      async list() {
        return state.apps.map(({ name, label, public: isPublic }) => ({ name, label, version: 1, public: isPublic }));
      },
      async get(name, version) {
        record('apps.get', name, version);
        const app = state.apps.find((item) => item.name === name);
        // Make answers 403, not 404, for an app that is not yours.
        if (!app) throw Object.assign(new Error('forbidden'), { statusCode: 403 });
        return { name, version, public: app.public };
      },
      async create(body) {
        record('apps.create', body);
        // Make makes the name unique with a suffix of its own.
        const app = { ...body, name: `${body.name}-hoa0se`, version: 1, public: appPublic };
        state.apps.push(app);
        return { name: app.name, version: 1, public: appPublic };
      },
      async update(name, version, body) {
        record('apps.update', name, version, body);
      },
      async setSection(name, version, section, body) {
        record('apps.setSection', section);
        store(`app/${section}`, body);
      },
      async getSection(name, version, section) {
        return load(`app/${section}`);
      },
      async setDocs() {
        record('apps.setDocs');
        return true;
      },
      async setIcon() {
        record('apps.setIcon');
        return true;
      },
    },
    connections: {
      async list() {
        return state.connections;
      },
      async create(appName, body) {
        record('connections.create', body);
        const connection = { name: `${appName}${state.connections.length + 1}`, ...body };
        state.connections.push(connection);
        return connection;
      },
      async setSection(name, section, body) {
        store(`connection/${name}/${section}`, body);
      },
      async getSection(name, section) {
        return load(`connection/${name}/${section}`);
      },
    },
    webhooks: {
      async list() {
        return state.webhooks;
      },
      async create(appName, body) {
        record('webhooks.create', body);
        const webhook = { name: `${appName}-hook${state.webhooks.length + 1}`, ...body };
        state.webhooks.push(webhook);
        return webhook;
      },
      async update(name, body) {
        record('webhooks.update', name, body);
        Object.assign(state.webhooks.find((hook) => hook.name === name), body);
      },
      async setSection(name, section, body) {
        store(`webhook/${name}/${section}`, body);
      },
      async getSection(name, section) {
        return load(`webhook/${name}/${section}`);
      },
    },
    modules: {
      async list() {
        return state.modules;
      },
      async create(appName, version, body) {
        record('modules.create', body);
        state.modules.push({ ...body });
        return body;
      },
      async update(appName, version, name, body) {
        record('modules.update', name, body);
      },
      async setSection(appName, version, name, section, body) {
        store(`module/${name}/${section}`, body);
      },
      async getSection(appName, version, name, section) {
        return load(`module/${name}/${section}`);
      },
    },
  };
  return { sdk, calls, state };
}

const callsNamed = (calls, name) => calls.filter(([call]) => call === name).map(([, ...args]) => args);

describe('upload', () => {
  test('creates a private app with two connections, six webhooks and thirteen modules, bound together', async () => {
    const { sdk, calls, state } = fakeMake();

    const report = await upload(sdk, APP_DIR, { icon: new Uint8Array([1]) });

    assert.equal(report.ok, true, formatReport(report));
    const [[created]] = callsNamed(calls, 'apps.create');
    assert.equal(created.name, 'website-screenshot-world');
    // Everything after the create uses the name Make gave the app.
    assert.equal(report.app.name, 'website-screenshot-world-hoa0se');
    assert.deepEqual(callsNamed(calls, 'apps.get')[0], ['website-screenshot-world-hoa0se', 1]);
    assert.equal(created.private, true);
    assert.equal(created.audience, 'global');

    assert.deepEqual(
      state.connections.map((connection) => [connection.type, connection.label]),
      [
        ['basic', 'Website Screenshot World (Auto Schedule)'],
        ['basic', 'Website Screenshot World (Instant Snap)'],
      ],
    );
    const instantSnap = state.connections.find((connection) => connection.label.includes('Instant Snap')).name;
    const autoSchedule = state.connections.find((connection) => connection.label.includes('Auto Schedule')).name;

    assert.equal(state.webhooks.length, 6);
    for (const hook of state.webhooks) {
      assert.equal(hook.type, 'web');
      assert.equal(hook.connection, instantSnap);
      assert.equal(hook.altConnection, autoSchedule);
    }

    assert.equal(state.modules.length, 13);
    const trigger = state.modules.find((module) => module.name === 'watchCaptureSucceeded');
    assert.equal(trigger.typeId, 10);
    assert.equal(trigger.webhook, state.webhooks.find((hook) => hook.label.endsWith('Captures Succeeded')).name);
    assert.equal(state.modules.find((module) => module.name === 'takeScreenshot').connection, instantSnap);
    assert.equal(state.modules.find((module) => module.name === 'captureScheduledPageNow').connection, autoSchedule);

    // Groups name modules, so they are written after the last module.
    const order = calls.map(([name, section]) => (name === 'apps.setSection' ? `app ${section}` : name));
    assert.ok(order.lastIndexOf('modules.create') < order.indexOf('app groups'));

    // An instant trigger has no mappable parameters, so its expect section is not written.
    assert.equal(state.sections.has('module/watchCaptureSucceeded/expect'), false);
    assert.ok(state.sections.has('module/takeScreenshot/expect'));
    assert.match(formatReport(report), /Nothing was published/);
  });

  test('a second run creates nothing new', async () => {
    const make = fakeMake();
    await upload(make.sdk, APP_DIR);
    make.calls.length = 0;

    const report = await upload(make.sdk, APP_DIR);

    assert.equal(report.ok, true, formatReport(report));
    for (const name of ['apps.create', 'connections.create', 'webhooks.create', 'modules.create']) {
      assert.deepEqual(callsNamed(make.calls, name), [], `${name} on the second run`);
    }
    assert.equal(callsNamed(make.calls, 'modules.update').length, 13);
    assert.equal(make.state.connections.length, 2);
    assert.equal(make.state.webhooks.length, 6);
  });

  test('stops before writing anything else when Make does not confirm the new app is private', async () => {
    const { sdk, calls } = fakeMake({ appPublic: true });

    const report = await upload(sdk, APP_DIR);

    assert.equal(report.ok, false);
    assert.deepEqual(callsNamed(calls, 'apps.setSection'), []);
    assert.match(formatReport(report), /FAILED app: Make did not confirm/);
    assert.ok(report.steps.slice(1).every((step) => step.status === 'not attempted'));
  });

  test('stops, creating nothing, when Make already has several apps with the label', async () => {
    const { sdk, calls, state } = fakeMake();
    state.apps.push(
      { name: 'website-screenshot-world-aaaaaa', label: 'Website Screenshot World', public: false },
      { name: 'website-screenshot-world-bbbbbb', label: 'Website Screenshot World', public: false },
      { name: 'someone-else', label: 'Website Screenshot World', public: false },
    );

    const report = await upload(sdk, APP_DIR);

    assert.equal(report.ok, false);
    assert.match(
      formatReport(report),
      /FAILED app: Make has 2 apps labelled "Website Screenshot World" \(website-screenshot-world-aaaaaa, website-screenshot-world-bbbbbb\); delete all but one/,
    );
    assert.deepEqual(callsNamed(calls, 'apps.create'), []);
  });

  test('stops when a section reads back differently', async () => {
    const { sdk } = fakeMake({ changeOnRead: 'app/base' });

    const report = await upload(sdk, APP_DIR);

    assert.equal(report.ok, false);
    const failed = report.steps.find((step) => step.status === 'failed');
    assert.equal(failed.name, 'app base');
    assert.equal(failed.detail, 'what Make stored differs from what was sent');
  });

  test('describes a Make error by its status only', async () => {
    const { sdk } = fakeMake();
    sdk.apps.list = async () => {
      const error = new Error('token wsw_secret in body');
      error.statusCode = 403;
      throw error;
    };

    const report = await upload(sdk, APP_DIR);

    const text = formatReport(report);
    assert.match(text, /HTTP 403: the token lacks the sdk-apps:read or sdk-apps:write scope/);
    assert.doesNotMatch(text, /wsw_secret/);
  });
});
