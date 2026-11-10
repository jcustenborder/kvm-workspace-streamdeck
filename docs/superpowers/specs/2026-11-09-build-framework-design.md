# Stream Deck build framework

Approved scope: an installable TypeScript/Elgato SDK plugin skeleton and one
GitHub Actions workflow, with versioning matching `jcustenborder/kvm-workspace`.

## Plugin

- Use Node.js 24, the official `@elgato/streamdeck` SDK, strict TypeScript,
  and a bundled entry point. Pin dependencies and commit the npm lockfile.
- Use UUID `com.github.jcustenborder.kvm-workspace-streamdeck`, macOS 13+, and Stream Deck 7.1+.
  KVM Workspace currently targets macOS, so advertise only that platform.
- Include one clearly labeled placeholder keypad action. It has no KVM API,
  credentials, settings UI, or hardware-control behavior.
- Build into `dist/com.github.jcustenborder.kvm-workspace-streamdeck.sdPlugin`; use Elgato's CLI
  for validation and `.streamDeckPlugin` packaging. Include required icon sizes.
- Keep release tags as `vX.Y.Z` and encode manifest versions as `X.Y.Z.0`.
  Invalid/unsupported version components fail explicitly.

## Workflow and releases

- One workflow runs for pull requests and pushes to `initial` and `main`.
- Install with `npm ci`, type-check, run Node's built-in tests, build, validate,
  package, and upload the installer as an artifact.
- Only pushes to `main` may publish GitHub Releases. `initial` is the integration
  branch; this PR targets `initial`, and its later promotion to `main` is separate.
- Reuse the KVM project's next-patch release selector, starting at `0.1.0`,
  including same-commit reruns and draft recovery. Read all release pages.
- Serialize main builds, avoid cancelling a running publication, and scope write
  permissions to main-only planning/publishing jobs (draft visibility requires
  push access). Publish the already verified installer.
- Create a draft with assets before marking it published; reject conflicting tags.
  Propagate all verification and publication errors.

## Success criteria

- A clean locked install passes type checking and tests on Node.js 24.
- Official CLI validation and packaging produce an installable artifact.
- Tests cover next-patch selection, draft/published reruns, invalid versions,
  and conversion to Stream Deck's four-part version.
- CI passes on the PR targeting `initial`; no release is created by that PR.
- README documents local build/install, the placeholder, branch policy, and
  automatic release versioning. Hardware integration is deferred to later PRs.
