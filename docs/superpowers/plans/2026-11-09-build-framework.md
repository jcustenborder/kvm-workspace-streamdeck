# Stream Deck Build Framework Implementation Plan

> Execute inline with the executing-plans skill, task by task.

**Goal:** Deliver a verified plugin skeleton in a PR targeting `initial`.

**Architecture:** Bundle a minimal Elgato SDK entry point with esbuild. Stage
the manifest and assets in `dist`, then validate/package with Elgato's CLI.
One workflow verifies every PR and integration push, publishing only on main.

**Tech Stack:** Node.js 24, TypeScript, Elgato SDK/CLI, esbuild, node:test,
GitHub Actions and GitHub Releases.

## Global constraints

- Start at `0.1.0`; release tags `vX.Y.Z`; manifest versions `X.Y.Z.0`.
- macOS 13+, Stream Deck 7.1+, UUID `com.github.jcustenborder.kvm-workspace-streamdeck`.
- PR base `initial`; only main pushes publish. No live KVM control yet.
- Pin dependencies, commit the lockfile, fail on invalid versions/build errors.

## Task 1: Plugin and local build

Files: `package.json`, `package-lock.json`, `tsconfig.json`, `src/plugin.ts`,
`plugin/manifest.json`, `plugin/imgs/*`, `scripts/build.mjs`,
`scripts/plugin-version.cjs`, `tests/plugin-version.test.cjs`, `.gitignore`.

- [x] Add a Node test for `pluginVersion(version: string): string` converting
  `0.1.0` to `0.1.0.0` and rejecting prereleases, leading zeros, negative values,
  nonstrings, and components above 65535. Run it before implementation.
- [x] Implement that conversion, then stage a clean plugin directory and bundle
  the entry point with `target: 'node24'`, `platform: 'node'`, `format: 'cjs'`.
  Read `RELEASE_VERSION` when supplied, otherwise the package version.
- [x] Register one empty `SingletonAction` with the matching manifest UUID;
  give it the visible name `Placeholder` and tooltip explaining its scope.
- [x] Add required icons and strict TypeScript settings. Use official CLI
  `streamdeck validate ... --no-update-check` and
  `streamdeck pack ... --output dist --force --no-update-check`.
- [x] Run `npm ci`, `npm run check`, `npm test`, `npm run build`,
  `npm run validate`, and `npm run package`.

## Task 2: Release selection and CI

Files: `scripts/release-version.cjs`, `tests/release-version.test.cjs`,
`.github/workflows/build.yml`, `README.md`.

- [x] Test `planRelease(baseVersion: string, releases: Release[], commit: string)`
  for no releases, unordered patch/minor/major versions, irrelevant tags,
  same-commit published/draft releases, invalid base versions/missing commits.
  Return `{version, tag, exists, published}` as in the existing KVM project.
- [x] Copy the existing KVM selector, with validation via the four-part version
  converter so unsupported plugin versions fail before packaging.
- [x] Add one workflow with verification and main-only planning/publishing jobs.
  Select versions with draft visibility before building on main; pass job outputs.
  Upload the verified `.streamDeckPlugin`, then download that same artifact
  for publication. Inspect tag targets and publish draft-first with GitHub CLI.
- [x] Document local commands, installation, runtime floors, placeholder behavior,
  branch/release policy, and retry/version behavior.
- [x] Run the full local pipeline, inspect the package contents and version,
  review the diff, commit only intended files, push, and open a PR to `initial`.
- [x] Inspect GitHub Actions results, fix any failures, and report the PR URL
  with the observed checks. Do not create the `initial` → `main` PR yet.
