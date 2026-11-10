# KVM Workspace Stream Deck

Stream Deck controls for [KVM Workspace](https://github.com/jcustenborder/kvm-workspace),
using its authenticated loopback API. API requests run in the plugin backend.

## Requirements

- Node.js 24 or newer for development (CI uses Node.js 24).
- macOS 13 or newer and Stream Deck 7.1 or newer to run the plugin.
  Stream Deck supplies the plugin's Node.js 24 runtime.
- KVM Workspace running locally with its local API enabled and a bearer token.

## Configure

Add an action from **KVM Workspace** to a key. In its property inspector:

1. Enter the API address (default `http://127.0.0.1:53241`) and bearer token from
   the KVM Workspace menu, then click **Save connection**. Only loopback HTTP
   addresses are accepted. These settings are shared by all KVM buttons.
2. Select a saved device from the dropdown populated by the API. If it is missing,
   check KVM Workspace and use **Refresh devices and status**. Invalid or duplicate
   names must be repaired in the desktop device editor.
3. Configure the action-specific options below.

The token field is masked. Credentials live in Stream Deck global settings,
which are not an encrypted credential vault. Do not share settings exports
containing the token. Tokens and API response bodies are not logged by the plugin.

## Actions

| Action | Behavior |
| --- | --- |
| **Session — Start or Focus** | Select an explicit **LAN** or **Tailnet** start route. If closed, start on that route. **Focus window** (enabled by default) focuses after a successful start or focuses an already-open window. An open session is never restarted or switched to another route. With focus unchecked, an already-open session is left alone. |
| **End Session** | Release input and close the selected session. Already closed succeeds. |
| **Speaker** | Toggle once. Distinct speaker icons and titles show observed **On**, **Off**, or **?** (unknown/unavailable) state. |
| **Send Keys** | Send 1–16 unique supported API key codes in press order, separated by `+`, such as `ControlLeft+AltLeft+Delete` or `MetaLeft+KeyL`. The inspector lists supported codes. `MetaLeft` is the Windows key; keys release in reverse order. |

Speaker and Send Keys require an already-open, ready session; they do not start
or focus it. Starting may still require certificate approval or manual login in
the desktop application. **Open** means a session window exists, not proof of
authenticated firmware connectivity. Unknown speaker state is never treated as Off.

Visible buttons share a non-overlapping two-second status poll. Status refreshes
after commands and settings changes; polling stops when no buttons are visible.
Failed reads clear observed state. Errors appear in the inspector; failed presses
also show Stream Deck's error indicator. Requests time out after ten seconds and
commands are never automatically retried. A timeout can leave the command outcome
unknown: check the resulting session state before pressing again. Commands for
the same device run serially. Multi Actions are not supported in this version.

## Build and install

```sh
npm ci
npm run check
npm test
npm run build
npm run validate
npm run package
```

Open `dist/com.github.jcustenborder.kvm-workspace-streamdeck.streamDeckPlugin` to install it in
Stream Deck. Add one of the four **KVM Workspace** actions to a key and configure
its connection and device.

`src/plugin.ts` registers actions with the official Elgato SDK. `src/api.ts` owns
API validation/commands; `src/controller.ts` shares polling and button feedback.
`plugin/` contains the manifest, property inspector and SVG icons. The required
256/512px plugin PNGs are stored as
base64 in `assets/plugin-icons.json` and decoded during the build. Generated
files live entirely in `dist/`; rebuilding replaces that directory.

The Elgato CLI is a locked development dependency. Both validation and packaging
use its bundled schemas (`--no-update-check`) for repeatable builds. Packaging
also validates the plugin and fails on errors.

Tests exercise HTTP and SDK boundaries using fictitious devices and tokens; they
never contact a live KVM. For a manual smoke test after installation:

- Configure the connection and verify device discovery and inspector errors.
- Check Session with Focus window enabled and disabled, for both closed and open
  sessions. An already-open session must preserve its route even when the button
  has a different start route selected.
- Check End Session releases input and closes the window, including a second press.
- Toggle Speaker and confirm its observed On/Off icons. Verify Unknown when
  closed/unavailable, and after an API failure.
- Send an intentional test combination to a ready session. Check invalid
  combinations and failed commands show errors without automatic replay.
- Navigate away from all KVM buttons and verify polling stops; return and verify
  feedback refreshes. Test API unavailability and token replacement.

## Branches and CI

`initial` is the integration branch for the first set of PRs. Feature PRs target
`initial`; a later PR will promote `initial` to `main`.

One workflow, `.github/workflows/build.yml`, checks out the code, installs the
locked dependencies, type-checks, tests, builds, validates, packages, and uploads
an installer artifact for every PR and every push to `initial` or `main`.
Artifacts are retained for seven days.

Only a successful **push to `main`** publishes a GitHub Release. The publishing
job downloads the exact verified installer instead of rebuilding. It uses the
repository's `GITHUB_TOKEN` with `contents: write`; no extra secrets are required.
Main-only version planning also needs `contents: write` because GitHub only
lists reserved draft releases for callers with push access. Verification keeps
read-only permissions, including on PRs.

## Versions and releases

Version selection follows KVM Workspace's `scripts/release-version.cjs` policy:

- Start at `package.json`'s version, initially `0.1.0`.
- Select the next patch after the highest stable `vX.Y.Z` release, including
  reserved drafts. A higher package version establishes a new minimum.
- Reuse a release associated with the same commit on reruns. Published releases
  are left intact; draft releases can have their asset replaced and be published.
- Serialize main builds, verify tags point at the expected commit, and upload
  assets to a draft before publishing it.

GitHub releases use `vX.Y.Z`; the plugin manifest uses `X.Y.Z.0` as required by
Stream Deck. Components must be integers from 0 through 65535. Prerelease and
build-metadata versions are rejected.

To build a specific version locally:

```sh
RELEASE_VERSION=0.2.0 npm run build
npm run validate
npm run package
```

This changes only the generated manifest, leaving the source/package versions
unchanged. Publishing here means attaching an installer to GitHub Releases;
Elgato Marketplace submission is outside this build framework.
