import streamDeck, {
  action, SingletonAction, type DidReceiveSettingsEvent, type KeyDownEvent,
  type PropertyInspectorDidAppearEvent, type SendToPluginEvent,
  type WillAppearEvent, type WillDisappearEvent,
} from '@elgato/streamdeck';
import { KEY_CODES, type ButtonSettings, type Connection, type Kind } from './api.js';
import { Controller } from './controller.js';

// Log only static diagnostics: settings and API responses can contain secrets.
async function communicate(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    streamDeck.logger.error('Stream Deck communication failed');
  }
}

const controller = new Controller({}, async () => {
  const current = streamDeck.ui.action;
  if (current) await communicate(() => streamDeck.ui.sendToPropertyInspector({
    event: 'status', ...controller.status(current.id), keyCodes: KEY_CODES,
  }));
});

streamDeck.settings.onDidReceiveGlobalSettings<Connection>(async ev => {
  streamDeck.logger.info('API connection settings updated');
  await controller.setConnection(ev.settings);
});

class KvmAction extends SingletonAction<ButtonSettings> {
  private readonly visible = new Set<string>();

  constructor(private readonly kind: Kind) { super(); }

  override async onWillAppear(ev: WillAppearEvent<ButtonSettings>): Promise<void> {
    this.visible.add(ev.action.id);
    await ready;
    if (!this.visible.has(ev.action.id)) return;
    const key = ev.action;
    if (!key.isKey()) return;
    await controller.show(key.id, {
      kind: this.kind, settings: ev.payload.settings,
      render: async view => communicate(async () => {
        await key.setImage(view.image);
        await key.setTitle(view.title);
      }),
      showError: async () => communicate(async () => { await key.showAlert(); }),
    });
  }

  override onWillDisappear(ev: WillDisappearEvent<ButtonSettings>): void {
    this.visible.delete(ev.action.id);
    controller.hide(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ButtonSettings>): Promise<void> {
    await ready;
    await controller.update(ev.action.id, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<ButtonSettings>): Promise<void> {
    await ready;
    await controller.press(ev.action.id);
  }

  override async onPropertyInspectorDidAppear(_ev: PropertyInspectorDidAppearEvent<ButtonSettings>): Promise<void> {
    await ready;
    await controller.refresh();
  }

  override async onSendToPlugin(ev: SendToPluginEvent<{ event?: string }, ButtonSettings>): Promise<void> {
    if (ev.payload && typeof ev.payload === 'object' && 'event' in ev.payload && ev.payload.event === 'refresh') {
      await ready;
      await controller.refresh(true);
    }
  }
}

@action({ UUID: 'com.github.jcustenborder.kvm-workspace-streamdeck.session' })
class SessionAction extends KvmAction { constructor() { super('session'); } }

@action({ UUID: 'com.github.jcustenborder.kvm-workspace-streamdeck.end' })
class EndAction extends KvmAction { constructor() { super('end'); } }

@action({ UUID: 'com.github.jcustenborder.kvm-workspace-streamdeck.speaker' })
class SpeakerAction extends KvmAction { constructor() { super('speaker'); } }

@action({ UUID: 'com.github.jcustenborder.kvm-workspace-streamdeck.keys' })
class KeysAction extends KvmAction { constructor() { super('keys'); } }

streamDeck.actions.registerAction(new SessionAction());
streamDeck.actions.registerAction(new EndAction());
streamDeck.actions.registerAction(new SpeakerAction());
streamDeck.actions.registerAction(new KeysAction());
streamDeck.logger.info('Starting KVM Workspace controls');
const ready = streamDeck.connect().then(async () => {
  await controller.setConnection(await streamDeck.settings.getGlobalSettings<Connection>());
});
void ready.catch(() => { streamDeck.logger.error('Could not initialize Stream Deck settings'); });
