# KVM Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved four-action plugin and a verified PR to `initial`.

**Architecture:** A small typed API client owns HTTP validation and commands.
A shared controller owns visible actions, serialized commands and status polling.
Thin SDK actions and one browser inspector connect those pieces to Stream Deck.

**Tech Stack:** Existing Elgato SDK 3, TypeScript, Node.js 24 native fetch/test,
esbuild, plain HTML/CSS/JavaScript inspector. No new dependencies.

## Global Constraints

- Retain macOS 13+, Stream Deck 7.1+, Node.js 24 and existing plugin UUID.
- Never include credentials or live device names in repository artifacts.
- Session behavior follows the approved start/focus matrix; no route switching.
- Speaker is toggle-only with observed On/Off/Unknown icons.
- No automatic mutation retries. All API traffic originates in the backend.
- Minimal edits to the existing build/release framework; PR base is `initial`.

---

### Task 1: Client and commands

**Files:** create `src/api.ts`, `tests/api.test.cjs`, `tests/load-ts.cjs`.

**Interfaces:** `Connection {address: string; token: string}`, `Session {name:
string; state: 'open' | 'closed'; route: 'lan' | 'tailnet' | null; speaker:
{enabled: boolean | null}}`; `KvmApi.sessions(): Promise<Session[]>`,
`KvmApi.execute(kind, settings): Promise<void>`.

- [x] Write behavior tests using a fetch stub that returns real Response objects.
  For an open `demo-device` on Tailnet with a LAN setting, assert request paths
  equal `['/sessions/demo-device', '/sessions/demo-device/focus']`. Test all four
  focus/state combinations, with start JSON `{route: 'lan'}` only when closed.
- [x] Run `node --test tests/api.test.cjs`; observe missing implementation fail.
- [x] Implement typed runtime validation, loopback address restrictions,
  bearer headers, redirect rejection and bounded fetch. Parse supported keys;
  dispatch end, speaker toggle and send-keys exactly once per requested command.
- [x] Add failures for HTTP/invalid JSON/invalid session shapes, duplicate names,
  invalid keys, redirects and timeout. Assert secret redaction and no replay.
- [x] Run `npm run check` and `npm test` until green.

### Task 2: Shared runtime and SDK actions

**Files:** create `src/controller.ts`, `tests/controller.test.cjs`; modify
`src/plugin.ts`, `plugin/manifest.json`; create state icons in `plugin/imgs/`.

**Interfaces:** controller consumes API client and exposes visible-action
registration, connection updates, refresh and press handling. SDK adapters supply
render/error callbacks and relay inspector requests. All action settings are
per-button; address/token are global.

- [x] Test shared polling with fake timers, no overlapping polls, stopping after
  last disappearance, immediate refresh after commands and settings changes.
- [x] Test per-device command serialization and ignoring stale connection reads.
- [x] Run `node --test tests/controller.test.cjs` and observe missing behavior fail.
- [x] Implement the shared controller and thin SDK action registrations for
  Session, End Session, Speaker and Send Keys. Render observed state; report
  command errors to the SDK and sanitized status to the inspector.
- [x] Add distinct speaker On/Off/Unknown SVG icons and manifest action entries.
- [x] Run `npm run check` and `npm test` until green.

### Task 3: Inspector and installable artifact

**Files:** create `plugin/ui/inspector.html`, `plugin/ui/inspector.js`,
`plugin/ui/inspector.css`, `tests/inspector.test.cjs`; modify `README.md`.

**Interfaces:** inspector uses Stream Deck WebSocket settings events and
`sendToPlugin`/`sendToPropertyInspector` for backend discovery/status. It saves
global connection settings separately from device/route/focus/key settings.

- [x] Test settings updates and discovery/error rendering with an in-memory DOM
  and WebSocket boundary; assert safe text rendering and retention of missing
  selections. Verify action-specific control visibility and token masking in a
  browser using fictitious settings only.
- [x] Implement a single inspector shared by all four actions, native form
  controls, backend error/status text and API key-code help.
- [x] Replace placeholder README content with configuration, action semantics,
  credentials storage caveat and manual Stream Deck smoke-test instructions.
- [x] Run `npm run check && npm test && npm run build && npm run validate && npm run package`.
- [ ] Review the entire diff and commit only intended files. Push branch and use
  `gh pr create --base initial`; report PR URL and any verification limits.

## Verification results

- Node.js 24.22.2: type checking, all 25 tests, build, official CLI validation,
  and installer packaging passed. No dependencies added.
- Browser preview with fictitious data: masked token field, Session focus
  checkbox persistence, action-specific control visibility and no overflow.
- Independent review found ambiguous-device command dispatch and a startup
  visibility race. Both were reproduced, fixed and verified with regression
  tests; follow-up review found no remaining material issues in those fixes.
- Live discovery used only authenticated GET requests. No live mutation or
  hardware smoke test was performed; no live device names or tokens are stored.
