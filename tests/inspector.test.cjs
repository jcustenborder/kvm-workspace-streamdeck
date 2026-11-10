'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function inspector(kind = 'session', settings = {}) {
  const elements = new Map();
  class Element {
    value = ''; textContent = ''; checked = false; hidden = false; disabled = false;
    children = []; listeners = {};
    addEventListener(event, listener) { this.listeners[event] = listener; }
    replaceChildren(...children) { this.children = children; }
    append(child) { this.children.push(child); }
    emit(event) { this.listeners[event]?.({ preventDefault() {} }); }
  }
  class WebSocket {
    static OPEN = 1;
    readyState = 1; sent = [];
    constructor() { WebSocket.instance = this; }
    send(data) { this.sent.push(JSON.parse(data)); }
  }
  const context = vm.createContext({
    window: {}, WebSocket,
    document: {
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
      },
      createElement: () => new Element(),
    },
  });
  vm.runInContext(readFileSync(new URL('../plugin/ui/inspector.js', `file://${__filename}`), 'utf8'), context);
  context.window.connectElgatoStreamDeckSocket('1234', 'inspector-id', 'registerPropertyInspector', '{}', JSON.stringify({
    action: `com.github.jcustenborder.kvm-workspace-streamdeck.${kind}`,
    context: 'button-id', payload: { settings },
  }));
  const socket = WebSocket.instance;
  socket.onopen();
  return {
    elements, socket,
    receive: (event, payload) => socket.onmessage({ data: JSON.stringify({ event, payload }) }),
  };
}

test('inspector separates shared credentials from button settings and persists focus choices', () => {
  const { elements, socket, receive } = inspector('session', { device: 'demo-device', route: 'tailnet' });
  assert.equal(socket.sent[0].event, 'registerPropertyInspector');
  assert.equal(elements.get('focus').checked, true);
  assert.equal(elements.get('session-options').hidden, false);
  assert.equal(elements.get('keys-options').hidden, true);
  receive('didReceiveGlobalSettings', { settings: { address: 'http://localhost:1234', token: 'test-secret' } });
  assert.equal(elements.get('token').value, 'test-secret');
  elements.get('address').value = 'http://localhost:4321';
  elements.get('connection-form').emit('submit');
  const global = socket.sent.findLast(message => message.event === 'setGlobalSettings');
  assert.deepEqual(global.payload, { address: 'http://localhost:4321', token: 'test-secret' });
  elements.get('focus').checked = false;
  elements.get('focus').emit('change');
  const local = socket.sent.findLast(message => message.event === 'setSettings');
  assert.deepEqual(local.payload, { device: 'demo-device', route: 'tailnet', focus: false });
  assert.ok(!JSON.stringify(local).includes('test-secret'));
  elements.get('refresh').emit('click');
  assert.equal(socket.sent.at(-1).event, 'sendToPlugin');
  assert.deepEqual(socket.sent.at(-1).payload, { event: 'refresh' });
});

test('inspector retains unavailable selection and renders status/errors as text', () => {
  const { elements, receive } = inspector('speaker', { device: 'missing-device' });
  receive('sendToPropertyInspector', {
    event: 'status', sessions: [{ name: 'demo-device', state: 'open', route: 'lan', speaker: { enabled: null } }],
    error: 'Selected device is missing.', commandError: '<img src=x onerror=alert(1)>', keyCodes: ['KeyA', 'MetaLeft'],
  });
  const options = elements.get('device').children;
  assert.equal(options.at(-1).value, 'missing-device');
  assert.match(options.at(-1).textContent, /unavailable/i);
  assert.equal(elements.get('device').value, 'missing-device');
  assert.equal(elements.get('command-error').textContent, '<img src=x onerror=alert(1)>');
  assert.match(elements.get('status-error').textContent, /missing/);
  assert.equal(elements.get('session-options').hidden, true);
  assert.equal(elements.get('keys-options').hidden, true);
  assert.match(elements.get('action-help').textContent, /toggle/i);
  receive('didReceiveSettings', { settings: { device: 'demo-device' } });
  assert.match(elements.get('session-status').textContent, /Open.*LAN.*Unknown/i);
  receive('sendToPropertyInspector', { event: 'status', sessions: [], error: 'API unavailable', commandError: '' });
  assert.match(elements.get('session-status').textContent, /unknown/i);
  assert.match(elements.get('status-error').textContent, /API unavailable/);
});

test('Send Keys inspector saves an ordered combination without unrelated controls', () => {
  const { elements, socket } = inspector('keys', { device: 'demo-device' });
  assert.equal(elements.get('keys-options').hidden, false);
  assert.equal(elements.get('session-options').hidden, true);
  elements.get('keys').value = 'MetaLeft+KeyL';
  elements.get('keys').emit('change');
  assert.deepEqual(socket.sent.at(-1).payload, { device: 'demo-device', keys: 'MetaLeft+KeyL' });
});
