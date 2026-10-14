# Open-source publication candidate

Prepared 2026-10-14 from the RC8 owner-trial source (59dee89), including the latest committed DJ completion/seek/search implementation. The maintainer selected MIT. This candidate remains private and has not been installed, deployed, merged into the live product or published as a release.

## Changes
- MIT license and discoverable contribution/security/release/development/self-hosting docs.
- Original static ImageGen music character; no private-community poster/clip in the source or build. Per-server name/poster/optional animation configuration, with bounded same-origin, no-credential asset loading and safe fallback.
- Existing music identity, queue commands, seek/search contracts, volume controls and transport lifecycle retained. Optional participant display name is operator-configured.
- Personal deployment defaults, private readiness receipts, screenshots, reference packages, historical personal-host/legacy setup commands and one-off release-upload workflows separated from the candidate. The original private repository/history and an external private archive retain them.
- Empty default community URL; saved preferences/invitations still work. Explicit fork signing/updater/feed/deployment settings; ordinary signed packaging no longer implicitly publishes.
- Shared alias map derived from TypeScript configuration, consistent Prettier formatting in separate commits, dependency maintenance and a checksum-pinned source secret-scan gate.

## Verification
- Frozen-lockfile installation in an independent dependency directory.
-119test files /801tests PASS in the complete local suite.
-Lint, typecheck, renderer/native build,128production dependency notices and all service bundles PASS.
-Format check and publication-tree policy PASS.
-Current Electron signed-out onboarding shell smoke PASS after selecting a test community explicitly. Invalid invite validation remains local; no real account invitation was consumed.
-Actual sandboxed Electron component fixture captured at1440x900 and900x700: generated static image decoded, no renderer errors, no real room/account/media transport. Temporary fixture source and profile removed.
-Source-only Gitleaks scan PASS with exact fixture-value exclusions, not blanket test/path exclusions. Existing private history is a separate publication boundary.

Initial checks caught two old unit expectations and a native smoke assumption that depended on the removed production default. They were updated to exercise explicit community selection; empty-server recovery now fails closed. A17-file second formatting pass stabilized the formatter's output. The final build was rerun on stable source, rather than using a concurrent formatting/build artifact.

The existing large-chunk/dependency-comment warnings remain visible. No physical Mac/Windows media session, provider permission, remote load, recovery or new signed release acceptance is inferred from these checks. No server credentials, signing keys, user data or live Hoppers/ROOMS services were changed.

## Publication boundary and final review

The existing `egemenmermer/rooms` repository remains the publication target. Original history is retained unchanged in a PRIVATE archive; the reviewed redacted history preserves development commits and graph structure with changed IDs. See [publication/README.md](publication/README.md) and its complete file/release tables. The earlier fresh snapshot is not the authoritative continuation. Visibility remains private pending retained GitHub-view cleanup and owner approval. No live application or server deployment is included.
