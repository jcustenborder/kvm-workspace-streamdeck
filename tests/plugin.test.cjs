'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTs = require('./load-ts.cjs');

test('SDK actions render observed state, report failed commands and send safe inspector feedback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const actions = [];
  const messages = [];
  const logs = [];
  let globalSettings;
  const sdk = {
    connect: async () => {},
    actions: { registerAction: action => actions.push(action) },
    logger: { info: message => logs.push(message), error: message => logs.push(message) },
    settings: {
      getGlobalSettings: async () => ({ token: 'test-secret' }),
      onDidReceiveGlobalSettings: listener => { globalSettings = listener; },
    },
    ui: { action: { id: 'speaker-button' }, sendToPropertyInspector: async payload => { messages.push(payload); } },
  };
  t.mock.method(globalThis, 'fetch', async url => new Response(JSON.stringify(
    url.endsWith('/toggle') ? { error: 'Unready test-secret' } : [{
      name: 'demo-device', state: 'open', route: 'tailnet', speaker: { enabled: true },
    }]), { status: url.endsWith('/toggle') ? 409 : 200 }));
  loadTs('../src/plugin.ts', {
    '@elgato/streamdeck': {
      __esModule: true, default: sdk, SingletonAction: class {},
      action: ({ UUID }) => target => class extends target { manifestId = UUID; },
    },
  });
  assert.deepEqual(actions.map(a => a.manifestId.split('.').at(-1)), ['session', 'end', 'speaker', 'keys']);
  const speaker = actions[2];
  const titles = [];
  const images = [];
  let alerts = 0;
  const action = {
    id: 'speaker-button', isKey: () => true,
    setTitle: async title => { titles.push(title); },
    setImage: async image => { images.push(image); },
    showAlert: async () => { alerts++; },
  };
  await speaker.onWillAppear({ action, payload: { settings: { device: 'demo-device' } } });
  assert.equal(images.at(-1), 'imgs/speaker-on.svg');
  assert.match(titles.at(-1), /On/);
  await speaker.onKeyDown({ action, payload: { settings: { device: 'demo-device' } } });
  assert.equal(alerts, 1);
  assert.match(messages.at(-1).commandError, /409.*Unready/);
  assert.ok(!JSON.stringify(messages).includes('test-secret'));
  await globalSettings({ settings: {} });
  assert.equal(images.at(-1), 'imgs/speaker-unknown.svg');
  assert.match(messages.at(-1).error, /token/i);
  assert.ok(!JSON.stringify(logs).includes('test-secret'));
  speaker.onWillDisappear({ action });
});

test('a button hidden during startup is not registered later or left polling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const actions = [];
  let release;
  let reads = 0;
  let renders = 0;
  const sdk = {
    connect: async () => {},
    actions: { registerAction: action => actions.push(action) },
    logger: { info() {}, error() {} },
    settings: {
      getGlobalSettings: async () => ({ token: 'test-secret' }),
      onDidReceiveGlobalSettings() {},
    },
    ui: { action: undefined },
  };
  t.mock.method(globalThis, 'fetch', async () => {
    reads++;
    return new Promise(resolve => { release = () => resolve(new Response('[]')); });
  });
  loadTs('../src/plugin.ts', { '@elgato/streamdeck': {
    __esModule: true, default: sdk, SingletonAction: class {},
    action: ({ UUID }) => target => class extends target { manifestId = UUID; },
  } });
  const action = {
    id: 'transient-button', isKey: () => true,
    setTitle: async () => { renders++; }, setImage: async () => { renders++; }, showAlert: async () => {},
  };
  const appearing = actions[0].onWillAppear({ action, payload: { settings: {} } });
  actions[0].onWillDisappear({ action });
  await new Promise(resolve => setImmediate(resolve));
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1, 'hidden appearance must not trigger another discovery');
  await appearing;
  t.mock.timers.tick(2000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1, 'no visible buttons means no polling');
  assert.equal(renders, 0);
});
