export const DEFAULT_ADDRESS = 'http://127.0.0.1:53241';

export type Kind = 'session' | 'end' | 'speaker' | 'keys';
export type Route = 'lan' | 'tailnet';
export type Connection = { address?: string; token?: string };
export type ButtonSettings = { device?: string; route?: Route; focus?: boolean; keys?: string };
export type Session = {
  name: string;
  state: 'open' | 'closed';
  route: Route | null;
  speaker: { enabled: boolean | null };
};

export const KEY_CODES = [
  'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete',
  'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight',
  'ArrowDown', 'CapsLock', 'PrintScreen', 'ScrollLock', 'Pause', 'Backquote', 'Minus',
  'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma',
  'Period', 'Slash',
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
];

export function parseKeys(value: string | undefined): string[] {
  const keys = typeof value === 'string' ? value.split('+').map(key => key.trim()) : [];
  if (keys.length < 1 || keys.length > 16 || new Set(keys).size !== keys.length ||
      keys.some(key => !KEY_CODES.includes(key))) {
    throw new Error('Key combination requires 1–16 unique supported key codes.');
  }
  return keys;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validDevice(name: unknown): name is string {
  return typeof name === 'string' && name.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name);
}

function sessionResponse(value: unknown, expectedName?: string): Session {
  if (!object(value) || !validDevice(value.name) ||
      (expectedName !== undefined && value.name !== expectedName) ||
      (value.state !== 'open' && value.state !== 'closed') ||
      (value.route !== null && value.route !== 'lan' && value.route !== 'tailnet') ||
      !object(value.speaker) ||
      (value.speaker.enabled !== null && typeof value.speaker.enabled !== 'boolean')) {
    throw new Error('Invalid session response from API. Repair invalid device names in KVM Workspace.');
  }
  return value as Session;
}

export function redact(message: string, token: string | undefined): string {
  return (token ? message.split(token).join('[redacted]') : message)
    .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
}

export class KvmApi {
  private readonly address: string;
  private readonly token: string;

  constructor(connection: Connection, private readonly fetcher: typeof fetch = fetch) {
    let url: URL;
    try {
      url = new URL(connection.address || DEFAULT_ADDRESS);
    } catch {
      throw new Error('API address must be a loopback HTTP URL.');
    }
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('API address must be a loopback HTTP URL without credentials, path or query.');
    }
    if (typeof connection.token !== 'string' || !connection.token.trim() || /\s/.test(connection.token)) {
      throw new Error('Enter the API bearer token from KVM Workspace.');
    }
    this.address = url.origin;
    this.token = connection.token;
  }

  async sessions(): Promise<Session[]> {
    const value = await this.request('/sessions');
    if (!Array.isArray(value)) throw new Error('Invalid sessions response from API.');
    const sessions = value.map(item => sessionResponse(item));
    if (new Set(sessions.map(item => item.name)).size !== sessions.length) {
      throw new Error('Duplicate device names; repair them in KVM Workspace before targeting.');
    }
    return sessions;
  }

  async execute(kind: Kind, settings: ButtonSettings): Promise<void> {
    if (!validDevice(settings.device)) throw new Error('Select a valid device.');
    const path = `/sessions/${encodeURIComponent(settings.device)}`;
    if (kind === 'session') {
      if (settings.route !== 'lan' && settings.route !== 'tailnet') throw new Error('Select a LAN or Tailnet start route.');
      if (settings.focus !== undefined && typeof settings.focus !== 'boolean') throw new Error('Invalid Focus window setting.');
      const current = sessionResponse(await this.request(path), settings.device);
      if (current.state === 'closed') {
        sessionResponse(await this.request(`${path}/start`, 'POST', { route: settings.route }), settings.device);
      }
      if (settings.focus !== false) sessionResponse(await this.request(`${path}/focus`, 'POST'), settings.device);
    } else if (kind === 'speaker') {
      const value = await this.request(`${path}/speaker/toggle`, 'POST');
      if (!object(value) || typeof value.enabled !== 'boolean') throw new Error('Invalid speaker response from API.');
    } else if (kind === 'end') {
      sessionResponse(await this.request(`${path}/end`, 'POST'), settings.device);
    } else if (kind === 'keys') {
      const keys = parseKeys(settings.keys);
      sessionResponse(await this.request(`${path}/send-keys`, 'POST', { keys }), settings.device);
    } else {
      throw new Error('Unknown action.');
    }
  }

  private async request(path: string, method = 'GET', body?: object): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      let response: Response;
      let text: string;
      try {
        response = await this.fetcher(`${this.address}${path}`, {
          method, redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${this.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        text = await response.text();
      } catch {
        throw new Error(controller.signal.aborted
          ? 'API request timed out; command outcome may be unknown. Commands are not retried.'
          : 'Cannot reach the local API. Check KVM Workspace and the API address. Commands are not retried.');
      }
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON from API (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        const message = object(value) && typeof value.error === 'string' ? value.error : 'Request failed.';
        throw new Error(`HTTP ${response.status}: ${redact(message, this.token)}`);
      }
      return value;
    } finally {
      clearTimeout(timeout);
    }
  }
}
