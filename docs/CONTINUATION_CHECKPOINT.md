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
- Native Activity commands schema-validate and retry only explicit `409 REVISION_CONFLICT`, at most three writes with unchanged UUID/payload. Same-room and current-session guards apply. Ambiguous network outcomes are never retried. 101 tests / 23 files, typecheck and full build pass.
- Latest two-client official YouTube UI acceptance passed play/pause, pointer seek in both players, keyboard seek, actual participant membership and late rejoin (0.057 seconds observed drift), zero renderer errors. Paused stale SDK positions cannot undo authoritative seeks. Official autoplay remains subject to each viewer's normal player gesture.

Sanitized evidence lives under infra/production and infra/stoat. Actual screenshots are under docs/screenshots/production.

## 2026-10-10 additional acceptance

Actual macOS file picker cancellation preserved the draft; selected owned file upload, UI send, second-client receipt and downloaded byte matching passed. No native picker stubbing. Live dnd/invisible/online changes were observed as real gateway events in the other client (194–9882 ms including upstream request backpressure), zero renderer errors. Native two-client screen presenter exclusion/handoff, logout/session clearing, active membership revocation (7476 ms), denied fresh grant and freed presenter lease passed; owned QA membership was restored. Capture still uses development Electron identity on one Mac, not two physical computers.

Actual packaged YouTube recovery passed an owned-client iframe API interruption, bounded 25-second loading failure, disabled controls, official external fallback, fresh nonce retry preserving selection, recovered official playback and provider error 150. No core/provider mutation. Screenshots were inspected. Disconnected voice now shows translated error and closed transmission instead of ready/microphone hints. Final version 0.1.4 package checks and private publication are verified below.

## Current release and next action

Private unsigned Apple Silicon v0.1.4 prerelease is published at https://github.com/egemenmermer/rooms/releases/tag/v0.1.4, source through fb7adaa pushed. Uploaded DMG/ZIP/checksum SHA-256 digests match local bytes. GitHub reports immutable:false; preserve published assets by policy and issue a new version for changes. The installation guide and protected handoff refer to 0.1.4.

Final actual package checks pass: appVersion 0.1.4, all 22 current bundled renderer/native/assets/notices files match, actual launch and local video advancement. Two actual packaged clients pass official YouTube play/pause, pointer and keyboard seek, authoritative membership and late return with 0.108 seconds observed drift, zero renderer errors. Owned queue item and profiles removed. Latest native media lifecycle passing run revoked the active presenter in 7476 ms and restored owned QA membership in finally. Sixteen core services remained running after acceptance. Those verification clients were cleaned up; see the current bounded soak below.

Ten native game cases/101 rule variants now passed; remaining independent work includes advanced 101 meld/pair/joker staging, Blackjack split/double, other Holdem actions, native full hands, reconnect and sustained M1 performance. Existing ui-games-qa.mjs uses explicitly labeled local social fixtures and must not be reported as production acceptance. Any production game harness must assert no unrelated active table, operate only owned QA data, and close only the table it created. Do not run membership-revocation acceptance concurrently with other harnesses using the same QA accounts. Capture actual current UI and record limits. Do not replace published release assets.

## Remaining acceptance and required inputs

Native attachment picker/live presence, presenter/logout/revocation lifecycle and blocked-player recovery passed. Continue every game control, other 101 combinations and whole-network reconnect where useful. Restrictive-network TURN/TLS, physical second-computer audible voice/camera/PTT/device loss/SFU reconnect, packaged permission onboarding, fresh install/update and sustained M1 performance remain unverified. Camera needs explicit OS permission.

Separate Agent host/access and individual model/bot/provider accounts were not supplied. Existing runtime/runbook/local tests do not prove deployed Agent or live providers. Do not cohost privileged workers on core or Hoppers. Apple Developer ID/notarization credentials are missing; releases are unsigned previews. Windows validation is deferred.

## Continuation and quota

Current-thread hourly heartbeat exists and is main-agent-only, quiet on unchanged status. Mac/app must remain online and usage available. Weekly usage displayed 100% while ordinary usage remained allowed. The owner authorized one existing free Full reset only on exhaustion, not a paid purchase. No documented reset mutation is available; CUA explicitly blocks Codex app control. Manual reset was requested asynchronously. No reset has been performed or claimed. Do not bypass the control restriction.

## Useful commands

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm services:build`. Read each verification script's private configuration before running. Use owned QA identities only. Check git status before edits, preserve credentials/pinned images and commit with actual timestamps to the authorized private `egemenmermer/rooms` main branch. No backdating.

## Active 2026-10-10 04:11 UTC operation

Actual packaged game acceptance uses a newly created uniquely named `qa-games-*` Stoat text channel, never an existing primary Activity. Cleanup checks exact owned channel name/server before deletion and closes only the primary it created. Current harness includes Holdem raise/fold/history, Blackjack bet/stand/result, four Batak variants and four 101 rule combinations. Earlier harness failures used a stale CSS selector, assumed bidding always occurs before default bot passes, raced command results and timed out at 25 seconds while six bot actions required 30 seconds. No unrelated table was overwritten; owned channels were removed after each run.

Games exposed a production 5-second sweep delay. Activities now sweep every second and advance retained games only when they are the active primary. Closing a table or selecting another primary freezes that retained hand; explicit seat return can resume without redealing. Unit acceptance preserves authenticated viewer heartbeat separately from idle-turn timeout. 101 tests / 23 files, typecheck and service bundle build passed. Only activities.cjs was atomically replaced on core; its previous bundle is `/opt/rooms/dist-services/activities.cjs.before-20261010T0411`. Only `rooms-core-activities-1` was restarted. Public health passed afterward. Desktop 0.1.4 assets are unchanged.

Native acceptance passed all ten cases with zero renderer errors and exact owned-channel cleanup. Closed 101 state stayed unchanged across multiple sweeps; observed bot round trips were 7881–13933 ms. The separate packaged local-playback soak is RUNNING for 900 seconds (`scripts/verify-packaged-soak.mjs`, exec session 26367). It writes incremental infra/production/PACKAGED_SOAK_RESULTS.json and cleans only its fresh profile. Check PASS/FAIL and actual elapsed time before claiming completion. Do not start another QA app during this measurement. No physical voice, personal provider or complete-evening performance claim follows from it.
