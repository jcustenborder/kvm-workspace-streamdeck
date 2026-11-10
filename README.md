# KVM Workspace Stream Deck

Stream Deck plugin skeleton for [KVM Workspace](https://github.com/jcustenborder/kvm-workspace).
The **Placeholder** keypad action is intentionally inactive. KVM API integration
and controls will be added in subsequent PRs.

## Requirements

- Node.js 24 or newer for development (CI uses Node.js 24).
- macOS 13 or newer and Stream Deck 7.1 or newer to run the plugin.
  Stream Deck supplies the plugin's Node.js 24 runtime.

## Build and install

```sh
npm ci
npm run check
npm test
npm run build
npm run validate
npm run package
```

Open `dist/com.jcustenborder.kvm-workspace.streamDeckPlugin` to install it in
Stream Deck. Add **KVM Workspace → Placeholder** to a key; it displays
“Skeleton” and does not perform KVM operations.

`src/plugin.ts` registers actions with the official Elgato SDK. `plugin/` contains
the manifest and SVG icons. The required 256/512px plugin PNGs are stored as
base64 in `assets/plugin-icons.json` and decoded during the build. Generated
files live entirely in `dist/`; rebuilding replaces that directory.

The Elgato CLI is a locked development dependency. Both validation and packaging
use its bundled schemas (`--no-update-check`) for repeatable builds. Packaging
also validates the plugin and fails on errors.

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
