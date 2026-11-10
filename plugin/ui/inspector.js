'use strict';

(() => {
  const element = id => document.getElementById(id);
  let socket;
  let uuid;
  let actionContext;
  let actionId;
  let kind;
  let settings = {};
  let globalSettings = {};
  let sessions = [];

  function send(event, payload, context = actionContext) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, context, ...(payload === undefined ? {} : { payload }),
        ...(['getSettings', 'setSettings', 'sendToPlugin'].includes(event) ? { action: actionId } : {}) }));
    }
  }

  function renderDevices() {
    const select = element('device');
    const option = (value, text) => {
      const item = document.createElement('option');
      item.value = value;
      item.textContent = text;
      return item;
    };
    select.replaceChildren(option('', 'Select a device'));
    for (const session of sessions) select.append(option(session.name, `${session.name} (${session.state})`));
    if (settings.device && !sessions.some(session => session.name === settings.device)) {
      select.append(option(settings.device, `${settings.device} (unavailable)`));
    }
    select.value = settings.device || '';
    const selected = sessions.find(session => session.name === settings.device);
    element('session-status').textContent = selected
      ? `${selected.state === 'open' ? 'Open' : 'Closed'} · ${selected.route ? selected.route === 'lan' ? 'LAN' : 'Tailnet' : 'No route'} · Speaker: ${selected.speaker.enabled === true ? 'On' : selected.speaker.enabled === false ? 'Off' : 'Unknown'}`
      : 'State unknown';
  }

  function renderSettings() {
    element('session-options').hidden = kind !== 'session';
    element('keys-options').hidden = kind !== 'keys';
    element('route').value = settings.route || '';
    element('focus').checked = settings.focus !== false;
    element('keys').value = settings.keys || '';
    element('action-help').textContent = {
      session: 'Start when closed. When Focus window is checked, focus after starting or focus the existing window. An open session is otherwise left alone.',
      end: 'Release input and close the selected session. Already closed is safe.',
      speaker: 'Toggle the speaker once. The button icon shows observed On, Off or Unknown state. Failed toggles are not retried.',
      keys: 'Send this combination once. The session must already be open and ready. Failed combinations are not retried.',
    }[kind] || '';
    renderDevices();
  }

  window.connectElgatoStreamDeckSocket = (port, pluginUUID, registerEvent, _info, actionInfo) => {
    uuid = pluginUUID;
    const action = JSON.parse(actionInfo);
    actionContext = action.context;
    actionId = action.action;
    kind = actionId.split('.').at(-1);
    settings = action.payload.settings || {};
    renderSettings();
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.onopen = () => {
      socket.send(JSON.stringify({ event: registerEvent, uuid }));
      send('getGlobalSettings', undefined, uuid);
      send('getSettings');
      send('sendToPlugin', { event: 'refresh' });
    };
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); }
      catch { element('status-error').textContent = 'Invalid Stream Deck message.'; return; }
      if (message.event === 'didReceiveGlobalSettings') {
        globalSettings = message.payload.settings || {};
        element('address').value = globalSettings.address || 'http://127.0.0.1:53241';
        element('token').value = globalSettings.token || '';
        element('save-connection').disabled = false;
      } else if (message.event === 'didReceiveSettings') {
        settings = message.payload.settings || {};
        renderSettings();
      } else if (message.event === 'sendToPropertyInspector' && message.payload.event === 'status') {
        const status = message.payload;
        sessions = status.sessions;
        element('status-error').textContent = status.error || '';
        element('command-error').textContent = status.commandError || '';
        element('key-codes').textContent = (status.keyCodes || []).join(', ');
        renderDevices();
      }
    };
    socket.onclose = () => {
      element('status-error').textContent = 'Stream Deck connection closed.';
      element('save-connection').disabled = true;
    };
    socket.onerror = () => { element('status-error').textContent = 'Stream Deck connection failed.'; };
  };

  element('connection-form').addEventListener('submit', event => {
    event.preventDefault();
    globalSettings = { ...globalSettings, address: element('address').value.trim(), token: element('token').value.trim() };
    send('setGlobalSettings', globalSettings, uuid);
  });

  for (const field of ['device', 'route', 'focus', 'keys']) {
    element(field).addEventListener('change', () => {
      settings = { ...settings, [field]: field === 'focus' ? element(field).checked : element(field).value };
      send('setSettings', settings);
      renderDevices();
    });
  }
  element('refresh').addEventListener('click', () => send('sendToPlugin', { event: 'refresh' }));
})();
