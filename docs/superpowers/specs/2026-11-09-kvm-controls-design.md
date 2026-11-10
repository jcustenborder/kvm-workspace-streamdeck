# KVM Workspace controls

Approved design: extend the existing official Elgato SDK 3, strict TypeScript,
Node.js 24 plugin with four keypad actions. Retain macOS 13+, Stream Deck 7.1+,
the existing UUID and build/release framework. Feature PR targets `initial`.

## Actions

- **Session (Start or Focus):** select a saved device and explicit LAN or Tailnet
  start route. Read current session state on each press. If closed, start using
  that route, then focus only when the Focus window checkbox is enabled (default
  enabled). If already open, only focus when enabled; otherwise leave it alone.
  Never start an already-open session or switch its route. Surface race/conflict
  errors without retrying or falling back to another command.
- **End Session:** call the end endpoint, which releases input and closes the
  window. An already-closed session succeeds.
- **Speaker:** toggle only. Use distinct On, Off and Unknown icons from observed
  speaker state, not the requested state. Unknown includes closed/unavailable
  sessions. Never automatically retry a toggle.
- **Send Keys:** configure an ordered `+`-separated combination of API key codes,
  for example `ControlLeft+AltLeft+Delete`. Require 1–16 unique supported keys.
  Never automatically retry a combination or implicitly start/focus a session.

## API, settings and feedback

All HTTP runs in the plugin backend with native fetch; the inspector exchanges
messages over the Stream Deck SDK. Shared API address (default
`http://127.0.0.1:53241`) and token use Stream Deck global settings. The inspector
masks the token, but these settings are not an encrypted credential vault.
Require a loopback HTTP API address; reject redirects so credentials cannot be
forwarded elsewhere. Never log credentials, request headers, settings or raw
responses. Never embed real tokens or live device names in repository artifacts.

Populate the device dropdown from `GET /sessions`; reject ambiguous/invalid
names and retain a missing selection so configuration errors remain visible.
One non-overlapping two-second poll serves all visible buttons; stop when none
are visible. Refresh after settings changes and commands, including failures.
Discard responses for superseded connection settings. Commands to a given device
run serially. Bound requests with a timeout; never replay mutations.

Render window Open/Closed/Unknown without claiming authentication or firmware
connectivity. Clear stale observed state on discovery failure. Display sanitized
errors in the inspector and the Stream Deck error indicator for failed presses.
Treat response JSON as untrusted and report invalid response shapes explicitly.

## Verification

Use Node's built-in test runner and existing esbuild to exercise TypeScript
without adding dependencies. Mock HTTP and SDK boundaries only; test real client,
command, rendering, polling and inspector behavior. Cover the start/focus matrix,
route preservation, separate end, key validation, speaker tri-state feedback,
request errors/timeouts/no replay, shared polling and settings invalidation.
Run `npm run check`, `npm test`, `npm run build`, `npm run validate`, and
`npm run package`. Live API discovery is read-only; hardware interaction requires
a manual Stream Deck smoke test.
