# ROOMS continuation checkpoint — 2026-10-10

Read AGENTS.md, docs/OVERNIGHT_DEPLOYMENT_PLAN.md and docs/REMAINING_PHASES_PLAN.md. The owner explicitly disabled Astra/high and requested main-agent-only implementation, including UI and visual QA. Do not spawn design agents. Continue the authorized product work; do not imply completion from tests alone.

## Current core and access

Dedicated core: `https://62.238.119.134`, unmodified pinned Stoat v0.15.5, independent LiveKit and scoped access/Activity services. Sixteen services run. Hoppers is out of scope. SSH owner access uses `/Users/egemenmermer/.ssh/id_ed25519`, IdentitiesOnly/BatchMode, StrictHostKeyChecking and `.local/ssh/known_hosts`. Compose is `/opt/rooms/config/compose.yml`, project `rooms-core`. The `rooms-deploy` account can invoke only the root-owned bounded ROOMS status/restart wrapper; generic root, Docker, other projects and private configuration are denied. Owner access remains intact. Arbitrary code deployment is owner-only.

Private credentials, QA identities and six delivery invitations are in gitignored `.local/production/`. `.local/production/FRIENDS_ACCESS.md` is mode 0600. Never print/commit these contents or use friend identities for QA. Do not expose owner/provider credentials to friends.

## Actual evidence

- Social integration: eight real public checks; production acceptance: ten invite/DM/attachment/authorization/deduplication/revocation checks.
- Native production desktop: actual two-client signup/login/message send/edit/delete/session restart/logout passed, zero renderer errors.
- Public SFU: actual upstream-authorized two-client transport with synthetic media passed. Separate native microphone and exact ROOMS window picker passed received packets and voice across Home/Chat/Cinema/Games. Native hardware checks use development Electron identity and two clients on one physical Mac; camera permission is not determined. Fresh packaged ROOMS TCC onboarding and two physical devices are not certified.
- Seven public full-hand game cases passed: Holdem, Blackjack, four Batak variants, default 101. Hidden hands/history passed. Actual 30-second grace/bot replacement, same cards on returning and host transfer passed. These are API/table-engine checks, not every native game button manually played.
- Full core reboot passed: changed boot ID, preserved session/polls/notes/queue, recovered sixteen services and timers.
- Fresh backup `rooms-20261010T021147Z.tar.age`: consistent writer/MinIO pause, atomic encrypted completion and bounded seven-archive retention implemented. Actual isolated Mongo/PostgreSQL and ten archived-hand recovery, restored TLS keypair matching, isolated MinIO object read plus authenticated AES-GCM decode with restored metadata/configuration passed. Encrypted copies remain off-host. Owned plaintext staging, restore containers and temporary QA attachment message were removed. First scheduled backup and seven-archive retention threshold have not been observed.
- Native Activity commands schema-validate and retry only explicit `409 REVISION_CONFLICT`, at most three writes with unchanged UUID/payload. Same-room and current-session guards apply. Ambiguous network outcomes are never retried. 100 tests / 22 files, typecheck and full build pass.
- Latest two-client official YouTube UI acceptance passed play/pause, pointer seek in both players, keyboard seek, actual participant membership and late rejoin (0.057 seconds observed drift), zero renderer errors. Paused stale SDK positions cannot undo authoritative seeks. Official autoplay remains subject to each viewer's normal player gesture.

Sanitized evidence lives under infra/production and infra/stoat. Actual screenshots are under docs/screenshots/production.

## 2026-10-10 additional acceptance

Actual macOS file picker cancellation preserved the draft; selected owned file upload, UI send, second-client receipt and downloaded byte matching passed. No native picker stubbing. Live dnd/invisible/online changes were observed as real gateway events in the other client (194–9882 ms including upstream request backpressure), zero renderer errors. Native two-client screen presenter exclusion/handoff, logout/session clearing, active membership revocation (7476 ms), denied fresh grant and freed presenter lease passed; owned QA membership was restored. Capture still uses development Electron identity on one Mac, not two physical computers.

Actual packaged YouTube recovery passed an owned-client iframe API interruption, bounded 25-second loading failure, disabled controls, official external fallback, fresh nonce retry preserving selection, recovered official playback and provider error 150. No core/provider mutation. Screenshots were inspected. Disconnected voice now shows translated error and closed transmission instead of ready/microphone hints. Version 0.1.4 packaging/final checks are in progress; do not claim publication until checked.

## Current concrete action

Unsigned Apple Silicon 0.1.3 DMG/ZIP were built. `node scripts/verify-package.mjs` passed matching all 22 bundled renderer/native/assets/notices files, actual packaged launch and local video advancement. `ROOMS_QA_PACKAGED=1 node scripts/verify-shared-youtube.mjs` passed two actual packaged clients against production: playback/pause, both-player pointer seek, keyboard seek, authoritative viewers and late rejoin with 0.055 seconds observed drift, zero renderer errors. The harness removed only its new queue item and logged out/deleted owned profiles. Earlier harness failures compared stale SDK positions and assumed queue count always increases; the new test tracks its unique item, including when starting a new Activity clears the previous queue.

Private v0.1.3 prerelease is published at https://github.com/egemenmermer/rooms/releases/tag/v0.1.3; source through 5e3197a was pushed. Uploaded DMG/ZIP server SHA-256 digests match local checksums. GitHub reports immutable:false; preserve published assets by policy and publish a new version for any change. v0.1.2 predates these changes. Never replace older assets. The installation guide/private handoff now refer to 0.1.3; native hardware TCC scope remains development-only. Check GitHub release state before retrying publication.

## Remaining acceptance and required inputs

Native attachment picker/live presence, presenter/logout/revocation lifecycle and blocked-player recovery passed. Continue every game control, other 101 combinations and whole-network reconnect where useful. Restrictive-network TURN/TLS, physical second-computer audible voice/camera/PTT/device loss/SFU reconnect, packaged permission onboarding, fresh install/update and sustained M1 performance remain unverified. Camera needs explicit OS permission.

Separate Agent host/access and individual model/bot/provider accounts were not supplied. Existing runtime/runbook/local tests do not prove deployed Agent or live providers. Do not cohost privileged workers on core or Hoppers. Apple Developer ID/notarization credentials are missing; releases are unsigned previews. Windows validation is deferred.

## Continuation and quota

Current-thread hourly heartbeat exists and is main-agent-only, quiet on unchanged status. Mac/app must remain online and usage available. Weekly usage displayed 100% while ordinary usage remained allowed. The owner authorized one existing free Full reset only on exhaustion, not a paid purchase. No documented reset mutation is available; CUA explicitly blocks Codex app control. Manual reset was requested asynchronously. No reset has been performed or claimed. Do not bypass the control restriction.

## Useful commands

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm services:build`. Read each verification script's private configuration before running. Use owned QA identities only. Check git status before edits, preserve credentials/pinned images and commit with actual timestamps to the authorized private `egemenmermer/rooms` main branch. No backdating.
