'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { KvmApi, parseKeys } = require('./load-ts.cjs')('../src/api.ts');

const connection = { address: 'http://127.0.0.1:53241', token: 'test-secret' };
const session = (state = 'closed', route = null, enabled = null) => ({
  name: 'demo-device', state, route, speaker: { enabled },
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

function harness(responses) {
  const calls = [];
  const api = new KvmApi(connection, async (url, init) => {
    calls.push({ path: new URL(url).pathname, ...init });
    assert.ok(responses.length, 'unexpected extra API request');
    return responses.shift();
  });
  return { api, calls };
}

test('Session starts only closed devices, focuses optionally, and preserves open routes', async () => {
  for (const [state, focus, paths] of [
    ['closed', true, ['/sessions/demo-device', '/sessions/demo-device/start', '/sessions/demo-device/focus']],
    ['closed', false, ['/sessions/demo-device', '/sessions/demo-device/start']],
    ['open', true, ['/sessions/demo-device', '/sessions/demo-device/focus']],
    ['open', false, ['/sessions/demo-device']],
  ]) {
    const { api, calls } = harness([json(session(state, state === 'open' ? 'tailnet' : null)),
      json(session('open', 'lan', true)), json(session('open', 'lan', true))]);
    await api.execute('session', { device: 'demo-device', route: 'lan', focus });
    assert.deepEqual(calls.map(c => c.path), paths);
    for (const call of calls) {
      assert.equal(call.headers.Authorization, 'Bearer test-secret');
      assert.equal(call.redirect, 'error');
      assert.ok(call.signal instanceof AbortSignal);
      if (call.path.endsWith('/start')) assert.deepEqual(JSON.parse(call.body), { route: 'lan' });
      else assert.equal(call.body, undefined, 'focus must not send a route');
    }
  }
});

test('End, speaker toggle and key combinations use the dedicated API commands', async () => {
  const { api, calls } = harness([json(session()), json({ enabled: false }), json(session('open', 'lan', false))]);
  await api.execute('end', { device: 'demo-device' });
  await api.execute('speaker', { device: 'demo-device' });
  await api.execute('keys', { device: 'demo-device', keys: 'ControlLeft + AltLeft + Delete' });
  assert.deepEqual(calls.map(c => [c.method, c.path]), [
    ['POST', '/sessions/demo-device/end'], ['POST', '/sessions/demo-device/speaker/toggle'],
    ['POST', '/sessions/demo-device/send-keys'],
  ]);
  assert.deepEqual(JSON.parse(calls[2].body), { keys: ['ControlLeft', 'AltLeft', 'Delete'] });
});

test('session defaults focus to enabled and does not focus after failed start', async () => {
  const { api, calls } = harness([json(session()), json({ error: 'Route conflict' }, 409)]);
  await assert.rejects(api.execute('session', { device: 'demo-device', route: 'tailnet' }), /409.*Route conflict/);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].body), { route: 'tailnet' });
  const success = harness([json(session()), json(session('open', 'lan')), json(session('open', 'lan'))]);
  await success.api.execute('session', { device: 'demo-device', route: 'lan' });
  assert.equal(success.calls.at(-1).path, '/sessions/demo-device/focus');
});

test('discovery preserves nullable speaker feedback and rejects malformed or ambiguous devices', async () => {
  const { api } = harness([json([session(), session('open', 'lan', true)])]);
  await assert.rejects(api.sessions(), /duplicate/i);
  for (const data of [{}, [{ name: '../bad' }], [{ ...session(), speaker: { enabled: 'true' } }],
    [{ ...session(), state: 'connected' }], [{ ...session(), route: 'other' }]]) {
    await assert.rejects(harness([json(data)]).api.sessions(), /invalid/i);
  }
  assert.deepEqual(await harness([json([session()])]).api.sessions(), [session()]);
});

test('invalid settings and combinations fail before any network traffic', async () => {
  for (const keys of ['', 'Ctrl+KeyA', 'KeyA+KeyA', 'KeyA++KeyB',
    Array.from({ length: 17 }, (_, i) => `Key${String.fromCharCode(65 + i)}`).join('+')]) {
    assert.throws(() => parseKeys(keys), /key|combination/i);
  }
  assert.deepEqual(parseKeys('MetaLeft+KeyL'), ['MetaLeft', 'KeyL']);
  const { api, calls } = harness([]);
  for (const device of ['', '../bad', 'UPPER', 'a'.repeat(64), 'demo-device\n']) {
    await assert.rejects(api.execute('end', { device }), /device/i);
  }
  await assert.rejects(api.execute('session', { device: 'demo-device' }), /route/i);
  await assert.rejects(api.execute('keys', { device: 'demo-device', keys: 'Ctrl+A' }), /key/i);
  assert.equal(calls.length, 0);
  for (const address of ['https://example.com', 'http://127.0.0.1.evil.test',
    'http://user:pass@localhost:123', 'http://localhost:123/path', 'http://[::1]:123/?secret=x']) {
    assert.throws(() => new KvmApi({ ...connection, address }), /loopback/i);
  }
  assert.throws(() => new KvmApi({ ...connection, token: '' }), /token/i);
});

test('HTTP failures are redacted and mutations are not retried', async () => {
  for (const kind of ['speaker', 'keys']) {
    const { api, calls } = harness([json({ error: 'Failed test-secret' }, 500)]);
    await assert.rejects(api.execute(kind, { device: 'demo-device', keys: 'KeyA' }), error => {
      assert.match(error.message, /500/);
      assert.ok(!error.message.includes(connection.token));
      return true;
    });
    assert.equal(calls.length, 1);
  }
  await assert.rejects(harness([new Response('not JSON')]).api.sessions(), /invalid.*JSON/i);
  await assert.rejects(harness([json({ enabled: null })]).api.execute('speaker', { device: 'demo-device' }), /invalid/i);
  const api = new KvmApi(connection, async () => { throw new Error('transport test-secret'); });
  await assert.rejects(api.sessions(), error => !error.message.includes(connection.token));
});

test('timeout aborts a mutation once, without replay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  const api = new KvmApi(connection, async (_url, init) => {
    attempts++;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  });
  const pending = assert.rejects(api.execute('speaker', { device: 'demo-device' }), /timed out/i);
  t.mock.timers.tick(10000);
  await pending;
  assert.equal(attempts, 1);
});
