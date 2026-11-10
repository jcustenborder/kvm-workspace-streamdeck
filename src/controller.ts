import { KvmApi, redact, validDevice, type ButtonSettings, type Connection, type Kind, type Session } from './api.js';

export type View = { title: string; image: string };
type Button = {
  kind: Kind;
  settings: ButtonSettings;
  render: (view: View) => Promise<void>;
  showError: () => Promise<void>;
};
export type Status = { sessions: Session[]; error: string; commandError: string };

export class Controller {
  private readonly buttons = new Map<string, Button>();
  private readonly commands = new Map<string, Promise<void>>();
  private readonly commandErrors = new Map<string, string>();
  private sessions: Session[] = [];
  private error = '';
  private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private refreshing?: Promise<void>;
  private refreshAgain = false;

  constructor(
    private connection: Connection,
    private readonly onStatus: () => Promise<void>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async show(id: string, button: Button): Promise<void> {
    this.buttons.set(id, button);
    await this.refresh();
  }

  hide(id: string): void {
    this.buttons.delete(id);
    this.commandErrors.delete(id);
    if (this.buttons.size === 0) clearTimeout(this.timer);
  }

  async update(id: string, settings: ButtonSettings): Promise<void> {
    const button = this.buttons.get(id);
    if (button) button.settings = settings;
    this.commandErrors.delete(id);
    await this.refresh(true);
  }

  async setConnection(connection: Connection): Promise<void> {
    this.connection = { ...connection };
    this.epoch++;
    this.sessions = [];
    this.error = '';
    this.commandErrors.clear();
    await this.publish();
    await this.refresh(true);
  }

  status(id: string): Status {
    const button = this.buttons.get(id);
    let error = this.error;
    if (!error && button) {
      if (!validDevice(button.settings.device)) error = 'Select a valid device.';
      else if (!this.sessions.some(session => session.name === button.settings.device)) {
        error = 'Selected device is missing or unavailable in KVM Workspace.';
      }
    }
    return { sessions: this.sessions, error, commandError: this.commandErrors.get(id) ?? '' };
  }

  refresh(force = false): Promise<void> {
    if (this.refreshing) {
      this.refreshAgain ||= force;
      return this.refreshing;
    }
    clearTimeout(this.timer);
    this.refreshing = this.readStatus().finally(() => {
      this.refreshing = undefined;
      if (this.buttons.size > 0) this.timer = setTimeout(() => { void this.refresh(); }, 2000);
    });
    return this.refreshing;
  }

  async press(id: string): Promise<void> {
    const button = this.buttons.get(id);
    if (!button) return;
    const settings = { ...button.settings };
    const connection = { ...this.connection };
    const epoch = this.epoch;
    const device = settings.device ?? '';
    const task = (this.commands.get(device) ?? Promise.resolve()).then(async () => {
      try {
        if (epoch !== this.epoch) throw new Error('API settings changed; press again with the new settings.');
        const status = this.status(id);
        if (status.error) throw new Error(status.error);
        await new KvmApi(connection, this.fetcher).execute(button.kind, settings);
        this.commandErrors.delete(id);
      } catch (error) {
        if (epoch === this.epoch) {
          this.commandErrors.set(id, redact(error instanceof Error ? error.message : 'Command failed.', connection.token));
        }
        await button.showError();
      } finally {
        await this.refresh(true);
      }
    });
    this.commands.set(device, task);
    try {
      await task;
    } finally {
      if (this.commands.get(device) === task) this.commands.delete(device);
    }
  }

  private async readStatus(): Promise<void> {
    do {
      this.refreshAgain = false;
      const epoch = this.epoch;
      try {
        const sessions = await new KvmApi(this.connection, this.fetcher).sessions();
        if (epoch !== this.epoch) { this.refreshAgain = true; continue; }
        this.sessions = sessions;
        this.error = '';
      } catch (error) {
        if (epoch !== this.epoch) { this.refreshAgain = true; continue; }
        this.sessions = [];
        this.error = redact(error instanceof Error ? error.message : 'Status refresh failed.', this.connection.token);
      }
      await this.publish();
    } while (this.refreshAgain);
  }

  private async publish(): Promise<void> {
    await Promise.all([...this.buttons.values()].map(async button => {
      const session = this.sessions.find(item => item.name === button.settings.device);
      const device = button.settings.device || 'Select device';
      if (button.kind === 'speaker') {
        const enabled = session?.speaker.enabled;
        const state = enabled === true ? 'on' : enabled === false ? 'off' : 'unknown';
        await button.render({ title: `${device}\n${state === 'unknown' ? '?' : state === 'on' ? 'On' : 'Off'}`, image: `imgs/speaker-${state}.svg` });
      } else {
        const state = session?.state === 'open' ? 'Open' : session?.state === 'closed' ? 'Closed' : 'Unknown';
        const label = button.kind === 'session' ? state : button.kind === 'end' ? `End · ${state}` : 'Send Keys';
        await button.render({ title: `${device}\n${label}`, image: `imgs/${button.kind}.svg` });
      }
    }));
    await this.onStatus();
  }
}
