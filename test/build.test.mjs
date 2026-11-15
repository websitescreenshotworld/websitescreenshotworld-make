import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildFiles, triggerName } from '../scripts/build.mjs';
import { EVENTS, GROUPS, MODULES } from '../scripts/definitions.mjs';

const ROOT = join(import.meta.dirname, '..');
const files = buildFiles();
const read = (path) => {
  const text = files.get(path);
  assert.ok(text !== undefined, `${path} is generated`);
  return JSON.parse(text);
};
const requests = (api) => (Array.isArray(api) ? api : [api]);
const moduleNames = [...new Set([...files.keys()].filter((p) => p.startsWith('modules/')).map((p) => p.split('/')[1]))];

describe('the committed app/', () => {
  test('is what the definitions generate', () => {
    for (const [path, content] of files) {
      assert.equal(readFileSync(join(ROOT, 'app', path), 'utf8'), content, `app/${path} is out of date: run npm run build`);
    }
  });
});

describe('the API key', () => {
  test('is not in the Base, so a request to another host never carries it', () => {
    const base = read('base.imljson');
    assert.equal(JSON.stringify(base).includes('apiKey'), false);
  });

  test('is hidden in the log of every request that sends it', () => {
    // A webhook's api is the receiver, not a request.
    const sections = [...files.keys()].filter(
      (path) => /\/(api|attach|detach)\.imljson$/.test(path) && !/^webhooks\/[^/]+\/api\.imljson$/.test(path),
    );
    for (const path of sections) {
      for (const request of requests(read(path))) {
        const headers = request.headers ?? {};
        if (!Object.keys(headers).some((name) => name.toLowerCase() === 'x-api-key')) continue;
        assert.ok(request.log?.sanitize?.includes('request.headers.x-api-key'), `${path} hides the key in its log`);
      }
    }
  });

  test('is never sent to a capture download link', () => {
    for (const name of ['takeScreenshot', 'createPdf', 'recordVideo', 'getPageContent']) {
      const download = read(`modules/${name}/api.imljson`).at(-1);
      assert.match(download.url, /^\{\{temp\.capture\.download_url\}\}$/);
      assert.equal(download.headers, undefined, `${name} downloads without headers`);
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

describe('capture modules', () => {
  const cases = { takeScreenshot: 'image', createPdf: 'pdf', recordVideo: 'video', getPageContent: 'content' };

  for (const [name, mediaCategory] of Object.entries(cases)) {
    test(`${name} starts an async ${mediaCategory} capture, polls it with a limit and outputs what its interface lists`, () => {
      const [start, poll, download] = read(`modules/${name}/api.imljson`);
      assert.equal(start.method, 'POST');
      assert.equal(start.url, '/captures');
      assert.equal(start.body.media_category, mediaCategory);
      assert.equal(start.body.async, true);
      assert.equal(start.body.url, '{{parameters.url}}');

      assert.equal(poll.url, '/captures/{{temp.id}}');
      assert.equal(typeof poll.repeat.limit, 'number');
      assert.equal(typeof poll.repeat.delay, 'number');
      assert.match(poll.repeat.condition, /temp\.status/);
      assert.match(poll.response.valid, /'failed'/);

      assert.match(download.condition, /temp\.status === 'succeeded'/);

      const names = read(`modules/${name}/interface.imljson`).map((field) => field.name);
      for (const output of [poll.response.output, download.response.output]) {
        for (const key of Object.keys(output)) assert.ok(names.includes(key), `${name} lists ${key} in its interface`);
      }
      for (const key of Object.keys(read(`modules/${name}/samples.imljson`))) {
        assert.ok(names.includes(key), `${name}'s sample field ${key} is in its interface`);
      }
    });
  }

  test('every mappable field is used in the request body', () => {
    for (const name of Object.keys(cases)) {
      const body = JSON.stringify(read(`modules/${name}/api.imljson`)[0].body);
      for (const field of read(`modules/${name}/expect.imljson`)) {
        assert.ok(body.includes(`parameters.${field.name}`), `${name} sends ${field.name}`);
      }
    }
  });

  test('the proxy block is sent only with a country, since the API refuses it without one', () => {
    for (const name of Object.keys(cases)) {
      const [start] = read(`modules/${name}/api.imljson`);
      assert.equal(start.body.proxy, undefined, name);
      assert.equal(
        start.body['{{...}}'],
        "{{if(parameters.proxy.country, pick(parameters, 'proxy'), pick(parameters, 'proxyNotGiven'))}}",
      );
    }
  });

  test('a document PDF is never asked for as a scrolling capture', () => {
    const [start] = read('modules/createPdf/api.imljson');
    assert.equal(start.body.scroll_mode, "{{if(parameters.full_page && parameters.format === 'image_pdf', 'scroll', 'viewport')}}");
  });
});

describe('events', () => {
  for (const event of EVENTS) {
    test(`${event.event}: the webhook registers the event, detach deletes what attach saved, the trigger is bound`, () => {
      const attach = read(`webhooks/${event.key}/attach.imljson`);
      const detach = read(`webhooks/${event.key}/detach.imljson`);
      const api = read(`webhooks/${event.key}/api.imljson`);

      assert.deepEqual(attach.body.events, [event.event]);
      assert.equal(attach.body.url, '{{webhook.url}}');
      assert.equal(attach.method, 'POST');
      assert.ok(attach.log.sanitize.includes('response.body.signing_secret'));

      const saved = Object.keys(attach.response.data);
      for (const [, used] of detach.url.matchAll(/webhook\.(\w+)/g)) assert.ok(saved.includes(used), `detach reads ${used}, which attach saved`);
      assert.equal(detach.method, 'DELETE');

      assert.ok(api.condition.includes(`'${event.event}'`));
      assert.equal(api.respond.status, 200);

      const meta = read(`modules/${triggerName(event)}/meta.json`);
      assert.equal(meta.typeId, 10);
      assert.equal(meta.webhook, event.key);
      const names = read(`modules/${triggerName(event)}/interface.imljson`).map((field) => field.name);
      assert.deepEqual(names, Object.keys(api.output));
    });
  }

  test('only the capture events can be limited to one product', () => {
    for (const event of EVENTS) {
      const parameters = read(`webhooks/${event.key}/parameters.imljson`);
      assert.equal(parameters.length, event.products ? 1 : 0, event.key);
    }
  });
});

describe('groups', () => {
  test('list every module exactly once', () => {
    const grouped = GROUPS.flatMap((group) => group.modules);
    assert.deepEqual([...grouped].sort(), [...moduleNames].sort());
    assert.equal(new Set(grouped).size, grouped.length);
    assert.ok(Object.keys(MODULES).every((name) => grouped.includes(name)));
  });
});
