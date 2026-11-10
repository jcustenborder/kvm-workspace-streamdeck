import streamDeck, { action, SingletonAction } from '@elgato/streamdeck';

@action({ UUID: 'com.jcustenborder.kvm-workspace.placeholder' })
class Placeholder extends SingletonAction {}

streamDeck.actions.registerAction(new Placeholder());
streamDeck.logger.info('Starting KVM Workspace plugin skeleton');
streamDeck.connect();
