# Repository guidance

- For property inspector WebSocket changes, check the official Stream Deck UI command contract. Action-scoped `getSettings`, `setSettings`, and `sendToPlugin` messages require both `action` and `context`.
- Outgoing property inspector commands use the UUID passed to `connectElgatoStreamDeckSocket` as `context`, not `actionInfo.context`. Check Elgato's reference client and Stream Deck logs when the documentation is ambiguous; wrong-context commands are rejected.
- Inspector regression tests should check outgoing message envelopes as well as payloads; payload-only checks miss commands Stream Deck cannot route.
- Before opening a PR, run `npm run check`, `npm test`, and `npm run build`.
- Verify the PR base against the branch containing the current implementation; do not assume the repository default branch is up to date.
