import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildFiles, triggerName } from '../scripts/build.mjs';
import { EVENTS, GROUPS, MODULES, PARAMETERS_BODY } from '../scripts/definitions.mjs';

const ROOT = join(import.meta.dirname, '..');
const files = buildFiles();
const read = (path) => {
  const text = files.get(path);
  assert.ok(text !== undefined, `${path} is generated`);
  return JSON.parse(text);
};
const requests = (api) => (Array.isArray(api) ? api : [api]);
const moduleNames = [...new Set([...files.keys()].filter((p) => p.startsWith('modules/')).map((p) => p.split('/')[1]))];
const CAPTURE_MODULES = { takeScreenshot: 'image', createPdf: 'pdf', recordVideo: 'video', getPageContent: 'content' };
const DATE = /^\{\{if\(([\w.]+), parseDate\(\1, 'YYYY-MM-DDTHH:mm:ss\.SSSZ'\), \1\)\}\}$/;

/** Every request the app makes: module requests, webhook attach and detach (a webhook's api is its receiver). */
const allRequests = () =>
  [...files.keys()]
    .filter((path) => /^(modules\/[^/]+\/api|webhooks\/[^/]+\/(attach|detach))\.imljson$/.test(path))
    .flatMap((path) => requests(read(path)).map((request) => [path, request]))
    // An instant trigger's api is empty: its webhook does the work.
    .filter(([, request]) => Object.keys(request).length > 0);

describe('the committed app/', () => {
  test('is what the definitions generate', () => {
    for (const [path, content] of files) {
      assert.equal(readFileSync(join(ROOT, 'app', path), 'utf8'), content, `app/${path} is out of date: run npm run build`);
    }
  });
});

describe('the API key', () => {
  test('is set once, in the Base, and hidden in its log', () => {
    const base = read('base.imljson');
    assert.equal(base.headers['x-api-key'], '{{connection.apiKey}}');
    assert.ok(base.log.sanitize.includes('request.headers.x-api-key'));
  });

  test('no module or webhook request sets the key again', () => {
    for (const [path, request] of allRequests()) {
      assert.equal(JSON.stringify(request).includes('connection.apiKey'), false, `${path} inherits the key`);
    }
  });

  test('is never sent to a capture download link: that request blanks the inherited header', () => {
    for (const name of Object.keys(CAPTURE_MODULES)) {
      const download = read(`modules/${name}/api.imljson`).at(-1);
      assert.match(download.url, /^\{\{temp\.capture\.download_url\}\}$/);
      assert.deepEqual(download.headers, { 'x-api-key': '' }, `${name} downloads without the key`);
    }
  });

  test('every other request goes to the connection’s API: a relative path, or the fixed Instant Snap address', () => {
    for (const [path, request] of allRequests()) {
      if (request.url === '{{temp.capture.download_url}}') continue;
      assert.ok(
        request.url.startsWith('/') || request.url.startsWith('https://api.websitescreenshotworld.com/instant-snap/v1/'),
        `${path}: ${request.url}`,
      );
    }
  });
});

describe('connections', () => {
  test('check the key with GET /account and label the connection without the key', () => {
    for (const [key, base] of [
      ['instantSnap', 'https://api.websitescreenshotworld.com/instant-snap/v1'],
      ['autoSchedule', 'https://autoapi.websitescreenshotworld.com/auto-schedule/v1'],
    ]) {
      const api = read(`connections/${key}/api.imljson`);
      assert.equal(api.url, `${base}/account`);
      assert.equal(api.method, 'GET');
      assert.equal(api.response.data.apiBase, base);
      assert.equal(api.response.metadata.value.includes('apiKey'), false);
      assert.equal(read(`connections/${key}/parameters.imljson`)[0].type, 'password');
    }
  });
});

describe('Make an API call', () => {
  test('can only reach the Instant Snap API, whatever the user types', () => {
    const api = read('modules/makeApiCall/api.imljson');
    assert.equal(api.url, 'https://api.websitescreenshotworld.com/instant-snap/v1/{{parameters.url}}');
    assert.equal(read('modules/makeApiCall/meta.json').label, 'Make an API call');
    assert.equal(read('modules/makeApiCall/meta.json').description, 'Performs an arbitrary authorized API call.');
  });
});

describe('capture modules', () => {
  for (const [name, mediaCategory] of Object.entries(CAPTURE_MODULES)) {
    test(`${name}: an async ${mediaCategory} capture, polled with a limit, an error unless it succeeded, then the file`, () => {
      const [start, poll, check, download] = read(`modules/${name}/api.imljson`);
      assert.equal(start.method, 'POST');
      assert.equal(start.url, '/captures');
      assert.equal(Object.keys(start.body)[0], '{{...}}', 'the parameters spread comes first');
      assert.equal(start.body['{{...}}'], PARAMETERS_BODY);
      assert.equal(start.body.media_category, mediaCategory);
      assert.equal(start.body.async, true);
      assert.equal(start.body.response_type, 'json');

      assert.equal(poll.url, '/captures/{{temp.id}}');
      assert.equal(typeof poll.repeat.limit, 'number');
      assert.equal(typeof poll.repeat.delay, 'number');
      assert.match(poll.repeat.condition, /temp\.status/);
      // An HTTP error while polling keeps the Base's message.
      assert.equal(poll.response.error, undefined);
      assert.equal(poll.response.valid, undefined);

      // Any capture that did not succeed (failed, timed_out, expired, still running, or final in the first answer)
      // stops the module with the capture's own reason; HTTP errors keep the Base's message.
      assert.equal(check.condition, "{{temp.status !== 'succeeded'}}");
      assert.equal(check.response.valid.condition, "{{body.status === 'succeeded'}}");
      assert.match(check.response.valid.message, /body\.error_code/);
      assert.equal(check.response.error, undefined);

      assert.equal(download.condition, "{{temp.status === 'succeeded'}}");
      const output = download.response.output;
      assert.equal(Object.keys(output)[0], '{{...}}', 'the capture spread comes first');
      assert.equal(output['{{...}}'], '{{temp.capture}}');
      assert.match(output.captured_at, DATE);
      assert.match(output.expires_at, DATE);

      const names = read(`modules/${name}/interface.imljson`).map((field) => field.name);
      for (const key of Object.keys(output).filter((key) => key !== '{{...}}')) {
        assert.ok(names.includes(key), `${name} lists ${key} in its interface`);
      }
      for (const key of Object.keys(read(`modules/${name}/samples.imljson`))) {
        assert.ok(names.includes(key), `${name}'s sample field ${key} is in its interface`);
      }
    });
  }

  test('each sample describes its own kind of capture', () => {
    const extensions = { takeScreenshot: '.png', createPdf: '.pdf', recordVideo: '.mp4' };
    for (const [name, mediaCategory] of Object.entries(CAPTURE_MODULES)) {
      const sample = read(`modules/${name}/samples.imljson`);
      assert.equal(sample.media_category, mediaCategory, name);
      if (extensions[name]) assert.ok(sample.fileName.endsWith(extensions[name]), `${name} sample file name`);
      if (name !== 'takeScreenshot') assert.doesNotMatch(sample.content_type, /^image\//, name);
    }
  });

  test('every parameter reaches the API under its own name, except full_page (scroll_mode) and an empty proxy', () => {
    assert.equal(
      PARAMETERS_BODY,
      "{{if(parameters.proxy.country, omit(parameters, 'full_page'), omit(parameters, 'full_page', 'proxy'))}}",
    );
    for (const name of Object.keys(CAPTURE_MODULES)) {
      const [start] = read(`modules/${name}/api.imljson`);
      const own = Object.keys(start.body).filter((key) => key !== '{{...}}');
      const parameters = read(`modules/${name}/expect.imljson`).map((field) => field.name);
      for (const key of own) assert.equal(parameters.includes(key), false, `${name}: ${key} is the app's own, not a parameter`);
      if (parameters.includes('full_page')) assert.ok(own.includes('scroll_mode'), name);
    }
  });

  test('a document PDF is never asked for as a scrolling capture', () => {
    const [start] = read('modules/createPdf/api.imljson');
    assert.equal(start.body.scroll_mode, "{{if(parameters.full_page && parameters.format === 'image_pdf', 'scroll', 'viewport')}}");
  });
});

describe('Get a capture and Capture a scheduled page now', () => {
  test('output the API’s answer as it is, with its dates parsed', () => {
    const getCapture = read('modules/getCapture/api.imljson').response.output;
    assert.equal(Object.keys(getCapture)[0], '{{...}}');
    assert.equal(getCapture['{{...}}'], '{{body}}');
    assert.match(getCapture.captured_at, DATE);
    assert.match(getCapture.expires_at, DATE);

    const trigger = read('modules/captureScheduledPageNow/api.imljson').response.output;
    assert.deepEqual(Object.keys(trigger), ['{{...}}', 'triggered_at']);
    assert.match(trigger.triggered_at, DATE);
  });

  test('list every field of the API’s answer in their interface', () => {
    const capture = JSON.parse(readFileSync(join(ROOT, 'samples', 'api', 'capture.json'), 'utf8'));
    const triggerNow = JSON.parse(readFileSync(join(ROOT, 'samples', 'api', 'trigger-now.json'), 'utf8'));
    for (const [name, example] of [
      ['getCapture', capture],
      ['captureScheduledPageNow', triggerNow],
      ...Object.keys(CAPTURE_MODULES).map((module) => [module, capture]),
    ]) {
      const names = read(`modules/${name}/interface.imljson`).map((field) => field.name);
      for (const key of Object.keys(example)) assert.ok(names.includes(key), `${name} lists ${key}`);
    }
  });
});

describe('events', () => {
  for (const event of EVENTS) {
    test(`${event.event}: the webhook registers the event, detach deletes what attach saved, the trigger outputs the event`, () => {
      const attach = read(`webhooks/${event.key}/attach.imljson`);
      const detach = read(`webhooks/${event.key}/detach.imljson`);
      const api = read(`webhooks/${event.key}/api.imljson`);

      assert.equal(attach.url, '/webhook-endpoints');
      assert.deepEqual(attach.body.events, [event.event]);
      assert.equal(attach.body.url, '{{webhook.url}}');
      assert.equal(attach.method, 'POST');
      assert.ok(attach.log.sanitize.includes('response.body.signing_secret'));

      const saved = Object.keys(attach.response.data);
      for (const [, used] of detach.url.matchAll(/webhook\.(\w+)/g)) assert.ok(saved.includes(used), `detach reads ${used}, which attach saved`);
      assert.equal(detach.method, 'DELETE');
      assert.ok(detach.url.startsWith('/webhook-endpoints/'));

      assert.ok(api.condition.includes(`'${event.event}'`));
      assert.equal(api.respond.status, 200);
      assert.equal(Object.keys(api.output)[0], '{{...}}');
      assert.equal(api.output['{{...}}'], '{{body}}');
      assert.match(api.output.created_at, DATE);
      assert.equal(Object.keys(api.output.data)[0], '{{...}}');
      assert.equal(api.output.data['{{...}}'], '{{body.data}}');

      const meta = read(`modules/${triggerName(event)}/meta.json`);
      assert.equal(meta.typeId, 10);
      assert.equal(meta.webhook, event.key);
      const fields = read(`modules/${triggerName(event)}/interface.imljson`);
      assert.deepEqual(fields.map((field) => field.name), ['id', 'type', 'created_at', 'product', 'data']);

      // Every top-level date in the event's data is parsed, and typed as a date.
      const data = fields.find((field) => field.name === 'data').spec;
      for (const field of data.filter((field) => field.name.endsWith('_at'))) {
        assert.equal(field.type, 'date', `${event.key}: ${field.name}`);
        assert.match(api.output.data[field.name], DATE, `${event.key} parses ${field.name}`);
      }
      // Every field of the example event is in the interface.
      const sample = read(`modules/${triggerName(event)}/samples.imljson`);
      for (const key of Object.keys(sample.data)) assert.ok(data.some((field) => field.name === key), `${event.key}: ${key}`);
    });
  }

  test('a field is typed and labelled the same way in every trigger and module', () => {
    const seen = new Map();
    const visit = (where, fields) => {
      for (const field of fields) {
        const shape = JSON.stringify({ type: field.type, label: field.label, spec: field.spec });
        const before = seen.get(field.name);
        if (before && field.name !== 'id' && field.name !== 'status' && field.name !== 'format') {
          assert.equal(shape, before.shape, `${field.name} in ${where} differs from ${before.where}`);
        }
        if (!before) seen.set(field.name, { shape, where });
      }
    };
    for (const event of EVENTS) {
      const fields = read(`modules/${triggerName(event)}/interface.imljson`);
      visit(event.key, fields.find((field) => field.name === 'data').spec);
    }
    visit('getCapture', read('modules/getCapture/interface.imljson'));
  });

  test('dates inside an array stay text and say they are ISO 8601', () => {
    const fields = read('modules/watchDeliveryCompleted/interface.imljson');
    const destinations = fields.find((field) => field.name === 'data').spec.find((field) => field.name === 'destinations');
    const completedAt = destinations.spec.spec.find((field) => field.name === 'completed_at');
    assert.deepEqual(completedAt, { name: 'completed_at', type: 'text', label: 'Completed at (ISO 8601)' });
  });

  test('only the capture events can be limited to one product', () => {
    for (const event of EVENTS) {
      const parameters = read(`webhooks/${event.key}/parameters.imljson`);
      assert.equal(parameters.length, event.products ? 1 : 0, event.key);
    }
  });

  test('the webhooks keep their first names, so an upload finds them instead of creating new ones', () => {
    const names = EVENTS.map((event) => read(`webhooks/${event.key}/meta.json`).label);
    assert.deepEqual(names, [
      'Website Screenshot World: Captures Succeeded',
      'Website Screenshot World: Captures Failed',
      'Website Screenshot World: Page Changes',
      'Website Screenshot World: Deliveries Completed',
      'Website Screenshot World: Schedules Paused',
      'Website Screenshot World: Sitemap Runs Completed',
    ]);
  });
});

describe('labels', () => {
  test('modules are labelled in sentence case', () => {
    for (const name of moduleNames) {
      const words = read(`modules/${name}/meta.json`).label.split(' ').slice(1);
      for (const word of words) {
        assert.ok(word === word.toLowerCase() || ['PDF', 'API'].includes(word), `${name}: "${word}"`);
      }
    }
  });
});

describe('groups', () => {
  test('list every module exactly once, events first', () => {
    const grouped = GROUPS.flatMap((group) => group.modules);
    assert.deepEqual([...grouped].sort(), [...moduleNames].sort());
    assert.equal(new Set(grouped).size, grouped.length);
    assert.ok(Object.keys(MODULES).every((name) => grouped.includes(name)));
    assert.deepEqual(
      GROUPS.map((group) => group.label),
      ['Events', 'Captures', 'Auto Schedule', 'Other'],
    );
  });
});
