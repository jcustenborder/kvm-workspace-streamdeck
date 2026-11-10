'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Controller } = require('./load-ts.cjs')('../src/controller.ts');
const connection = { address: 'http://127.0.0.1:53241', token: 'test-secret' };
const session = (enabled = null, state = 'open') => ({
  name: 'demo-device', state, route: state === 'open' ? 'tailnet' : null, speaker: { enabled },
});
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const flush = () => new Promise(resolve => setImmediate(resolve));

function button(kind = 'speaker', settings = { device: 'demo-device' }) {
  const views = [];
  let errors = 0;
  return {
    kind, settings, views, get errors() { return errors; },
    render: async view => { views.push(view); }, showError: async () => { errors++; },
  };
}

test('visible buttons share a non-overlapping poll and polling stops when hidden', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let release;
  const controller = new Controller(connection, async () => {}, async () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { release = resolve; });
    return json([session(false)]);
  });
  const a = button();
  const b = button('end');
  const first = controller.show('a', a);
  const second = controller.show('b', b);
  assert.equal(calls, 1);
  t.mock.timers.tick(4000);
  assert.equal(calls, 1);
  release(json([session(true)]));
  await Promise.all([first, second]);
  assert.equal(a.views.at(-1).image, 'imgs/speaker-on.svg');
  assert.match(b.views.at(-1).title, /Open/);
  t.mock.timers.tick(2000);
  await flush();
  assert.equal(calls, 2);
  assert.equal(a.views.at(-1).image, 'imgs/speaker-off.svg');
  controller.hide('a');
  controller.hide('b');
  t.mock.timers.tick(6000);
  assert.equal(calls, 2);
});

test('poll failures clear stale state and surface a safe inspector error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fail = false;
  const controller = new Controller(connection, async () => {}, async () => fail
    ? json({ error: 'Failure test-secret' }, 401) : json([session(true)]));
  const a = button();
  await controller.show('a', a);
  fail = true;
  await controller.refresh();
  assert.equal(a.views.at(-1).image, 'imgs/speaker-unknown.svg');
  assert.deepEqual(controller.status('a').sessions, []);
  assert.match(controller.status('a').error, /401/);
  assert.ok(!controller.status('a').error.includes(connection.token));
  controller.hide('a');
});

test('commands for one device serialize and refresh observed speaker state', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let enabled = false;
  let toggleCount = 0;
  let release;
  const controller = new Controller(connection, async () => {}, async (url) => {
    if (url.endsWith('/toggle')) {
      toggleCount++;
      if (toggleCount === 1) await new Promise(resolve => { release = resolve; });
      enabled = !enabled;
      return json({ enabled });
    }
    return json([session(enabled)]);
  });
  const a = button();
  await controller.show('a', a);
  const one = controller.press('a');
  const two = controller.press('a');
  await flush();
  assert.equal(toggleCount, 1);
  release();
  await Promise.all([one, two]);
  assert.equal(toggleCount, 2);
  assert.equal(a.views.at(-1).image, 'imgs/speaker-off.svg');
  controller.hide('a');
});

test('failed command is not replayed, signals error, and remains visible after refresh', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let toggles = 0;
  const controller = new Controller(connection, async () => {}, async url => {
    if (url.endsWith('/toggle')) { toggles++; return json({ error: 'Unready' }, 409); }
    return json([session()]);
  });
  const a = button();
  await controller.show('a', a);
  await controller.press('a');
  assert.equal(toggles, 1);
  assert.equal(a.errors, 1);
  assert.match(controller.status('a').commandError, /409.*Unready/);
  assert.equal(a.views.at(-1).image, 'imgs/speaker-unknown.svg');
  controller.hide('a');
});

test('connection changes discard stale discovery and refresh using new settings', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  const controller = new Controller(connection, async () => {}, async (_url, init) => {
    if (init.headers.Authorization === 'Bearer test-secret') {
      return new Promise(resolve => { release = resolve; });
    }
    return json([session(false)]);
  });
  const a = button();
  const pending = controller.show('a', a);
  const changed = controller.setConnection({ ...connection, token: 'new-test-secret' });
  release(json([session(true)]));
  await Promise.all([pending, changed]);
  assert.equal(a.views.at(-1).image, 'imgs/speaker-off.svg');
  assert.ok(!a.views.some(view => view.image === 'imgs/speaker-on.svg'));
  controller.hide('a');
});

test('command completion supersedes a poll that started before the command', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reads = 0;
  let release;
  let enabled = false;
  const controller = new Controller(connection, async () => {}, async url => {
    if (url.endsWith('/toggle')) { enabled = true; return json({ enabled }); }
    reads++;
    if (reads === 2) return new Promise(resolve => { release = resolve; });
    return json([session(enabled)]);
  });
  const a = button();
  await controller.show('a', a);
  const poll = controller.refresh();
  const press = controller.press('a');
  await flush();
  release(json([session(false)]));
  await Promise.all([poll, press]);
  assert.equal(reads, 3);
  assert.equal(a.views.at(-1).image, 'imgs/speaker-on.svg');
  controller.hide('a');
});

test('missing device is explicit and prevents command dispatch', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let mutations = 0;
  const controller = new Controller(connection, async () => {}, async (_url, init) => {
    if (init.method !== 'GET') mutations++;
    return json([]);
  });
  const a = button('keys', { device: 'missing-device', keys: 'KeyA' });
  await controller.show('a', a);
  assert.match(controller.status('a').error, /missing|available/i);
  await controller.press('a');
  assert.equal(a.errors, 1);
  assert.match(controller.status('a').commandError, /missing|available/i);
  assert.equal(mutations, 0);
  controller.hide('a');
});

test('ambiguous discovery prevents mutations for all actions', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let mutations = 0;
  const controller = new Controller(connection, async () => {}, async (_url, init) => {
    if (init.method !== 'GET') mutations++;
    return json([session(), session()]);
  });
  for (const kind of ['session', 'end', 'speaker', 'keys']) {
    const a = button(kind, { device: 'demo-device', route: 'lan', keys: 'KeyA' });
    await controller.show(kind, a);
    await controller.press(kind);
    assert.equal(a.errors, 1);
    assert.match(controller.status(kind).commandError, /duplicate/i);
    controller.hide(kind);
  }
  assert.equal(mutations, 0);
});
