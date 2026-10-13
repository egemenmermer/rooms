# Development and release
## Workstation baseline
Audited tooling: Node22.22.0, pnpm11.25.0; Electron44.7.0, React19.3.0, TypeScript5.9.3, Vite7.3.7, Vitest3.2.7.
macOS14+ ARM64 comes first. Windows-compatible source and packaging configuration exist, but this audit did not validate Windows. Read repository AGENTS.md and applicable owner scope before changes.

## Install and run
```sh
pnpm install --frozen-lockfile
pnpm dev
```
Development starts Vite on the controlled loopback origin and Electron with native boundaries. A browser-only preview is not voice/provider/native acceptance.
Production-style renderer/native startup:
```sh
pnpm build
pnpm start
```
Use an explicitly isolated ROOMS_PROFILE for disposable QA; do not modify owner account data to manufacture test fixtures.

## Services
```sh
pnpm services:build
```
Builds access, Activities, Agent and music bundles. Runtime needs its own approved private configuration/dependencies. Stoat setup is distinct from runtime start and clean production bootstrap.
A healthy Docker runtime, upstream/service configuration, required databases and actual accounts are necessary for full-stack verification. The audit workstation’s Docker was unavailable; a successful bundle build is not full setup acceptance.
Avoid legacy Spacebar verification commands when checking current Stoat behavior.

## Local and actual verification
```sh
pnpm typecheck
pnpm test
pnpm test:desktop
```
Inspect harness source before execution: production acceptance scripts can create users/messages/channels, disrupt services or operate media. Fixtures, actual loopback services, actual social authority and physical two-computer transport are different levels.
Initial audit: typecheck/build/services builds passed; unit suite663/665 passed; two DJ tests and obsolete desktop .hero smoke failed; no lint script existed. This is a dated baseline, not a current green CI assertion.
Owner instructions may reserve QA to the owner unless explicitly authorized. Never silently patch a failed audit check.

## Signed Mac delivery
Unsigned local packaging is distinct from public signed delivery. The selected Developer ID identity, notarization Keychain profile and signing key must belong to the owner-authorized release process.
The current release pipeline prepares a verified pinned Sparkle framework/addon, builds assets/native bundles, signs with hardened runtime, submits notarization, requires Accepted, staples/validates and assesses Gatekeeper. ZIP is regenerated from the stapled app; appcast is signed.
Publishing updates is an explicit external operation. Merely changing source does not automatically build/notarize/publish.
Test actual fresh installation and old-to-new update with preserved data and interrupted/low-disk recovery. A downloaded hash/signature and healthy feed do not close those user journeys.

## Version/provenance
Bind desktop semantic version/build number, audited source SHA/tag, server bundle/image digests, configuration/schema compatibility and published artifact hashes.
At the audit, package.json0.1.14 differed from installed preview0.1.17-preview.4 through explicit build metadata. The documentation baseline is06f5477 on reference-package; main had not merged its newest14 branch-only commits.
Do not merge implementation through a documentation delivery inadvertently. Review source changes separately; a documentation PR can explain an implementation that is still on its feature branch.

## Contribution discipline
Prefer scoped fixes after a precise reproduced failure. Preserve social/media/Activity boundaries, real-data-only production UI and protected private credentials.
No framework rewrite, provider growth or exhaustive reference-state redesign is required to explain or stabilize the product. Release work follows the maintained private audit scope/critical path.
Update docs when contracts/lifecycle/configuration change; keep evidence versioned and avoid declaring fixture-based success as production acceptance.
