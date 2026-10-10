# Current implementation and acceptance evidence

Date: 2026-10-08. Approved scope: `REMAINING_PHASES_PLAN.md`, phases A–G. Main owns architecture/native security/integrations; GPT-6 Astra/high directly implements substantial UI changes and running-app visual QA. Earlier Spacebar evidence is historical, not Stoat acceptance.

## Delivered code

- Turkish premium Electron shell, native navigation/fullscreen/file controls, keyboard interactions, stateful launcher/menus, reduced motion/transparency, signed-update controls, opt-in content-free OS notifications and actual login-item state.
- Unmodified Stoat typed native adapter, encrypted session vault, REST/events, friends/profile/DMs/messages/reactions/attachments/moderation, actual read-marker/mention restoration and conservative permissions. Separate single-use expiring account invitation broker, community invitations and native invitation deep links.
- Persistent replaceable LiveKit transport, source permissions, single-presenter reservation, signed webhook validation and reauthorization. Voice lifetime remains independent of navigation and Activities.
- Authoritative Activity service with versioned commands/revisions, idempotency, server clock, leases, host transfer, shared queue/timeline, poll and whiteboard. PostgreSQL persistence is available; one authoritative writer is required.
- Hidden-state game engines for Holdem, Blackjack, four Batak variants and 101; valid actions, bot takeover/return, hand history and statistics. Public history excludes private cards; protected active recovery state necessarily contains live hands.
- Native personal M3U/HLS/Xtream/XMLTV, favorites, opaque playback and encrypted vault; documented Real-Debrid device flow, own library and private resume. No personal URLs/tokens enter shared state or bot memory.
- Source-message reminders with no model execution or automatic ordinary-message memory; per-user bot/source authorization, durable scheduling/outbox, cancellation and uncertain-delivery handling. Dedicated Drive OAuth refresh credentials stay service-private.
- Separate Linux agent kernel with own per-user OpenRouter/official CLI connections, encrypted state, scoped GitHub/Drive/persistent browser tools, concrete operation approval, global YOLO, stop/artifacts/addressed memory/manual save, durable single-shot schedules and mention response outbox. Uncertain external outcomes pause for reconciliation.
- ARM64 packaging, own-identity signing/notarization path, signature-gated opt-in updater and bundled installed production license notices.

## Commands and actual results

| Command / exercise | Actual result and scope |
|---|---|
| `pnpm typecheck` | PASS after final UI/native integration changes |
| `pnpm test` | 94 tests / 21 files PASS including authoritative read restoration, Drive refresh and reminders; protocol/domain/HTTP tests, not live provider acceptance |
| `pnpm build` | PASS: production renderer, native main/preload and notices for 126 installed production dependencies |
| `pnpm services:build` | PASS: access, Activity and agent service bundles |
| `pnpm test:desktop --grep 'desktop shell'` | Actual Electron API isolation, invalid IPC rejection, command menu, original 30-second video, seek and native fullscreen entry/exit PASS in final rerun (1 test, 3.5 seconds) |
| `node scripts/ui-premium-qa.mjs` | Actual Electron Home/Cinema/Agent/Games/Together/YouTube/provider/Agent/update settings and launcher screenshots; 1440/1280/900 widths, no horizontal overflow or renderer errors |
| `node scripts/ui-activity-qa.mjs` | Two actual Electron clients + actual Activity HTTP service: Holdem create/seat/private hands/fold/history, cross-client poll vote and whiteboard note, Cinema play/pause/seek. Social identity is explicitly QA fixture, not Stoat login |
| `node scripts/verify-personal-hls.mjs` | PASS: native provider, rewritten opaque HLS resources, actual 1280×720 video readyState4 and >2-second playback, no public source URL in renderer element attributes, no renderer errors. Public maintainers' test stream only; no protected IPTV account acceptance |
| `node scripts/verify-performance.mjs` | Apple M1 / 8 GB, 120 seconds looping local video: peak summed process working set 380.2 MiB; sampled CPU 1.26–2.08%; initial dropped frames7, final7/2911. Home five-second RAF sample302 frames, none >33ms, max18.6ms; idle sampled CPU0.23%. Shared working pages make process sums approximate. Short development sample with other QA work, not physical transport/full-evening soak |
| `node scripts/ui-games-qa.mjs` | PASS: actual Activity service + Electron UI, Blackjack, four Batak variants and 101 with folding/teams; bots labeled, legal actions, no renderer errors |
| `pnpm exec electron-builder --mac dmg zip --arm64` | PASS: current unsigned DMG/ZIP. Code signing explicitly skipped; no notarization claim |
| `node scripts/verify-package.mjs` | PASS: current packaged ARM64 app opens and bundled video advances. Main/preload/index/notices in app.asar exactly match current build; SHA256 in RELEASE_SHA256.txt |
| `node scripts/verify-postgres-activity.mjs` | PASS: actual owned loopback PostgreSQL16 and two HTTP clients with QA authorization; service/database-pool restart preserves vote and command deduplication. Temporary test database stopped/removed; no other database altered |
| `node scripts/ui-reminder-qa.mjs` | PASS: actual Electron UI with visibly simulated Agent bridge; exact source/note/time, no model/memory calls, reminder kind/cancel and missing-capability state. Not live bot delivery |
| Generated Stoat `docker compose ... config --quiet` | PASS: configuration syntax only. Actual container startup blocked by absent Docker daemon/socket |

The public HLS source is explicitly supplied in the [hls.js basic usage demo](https://github.com/video-dev/hls.js/blob/master/demo/basic-usage.html), hosted for tests by [Mux](https://test-streams.mux.dev/). It is not bundled or advertised as ROOMS content. Actual testing found and fixed Node22 DNS lookup callback incompatibility: requests now pin the validated address and explicit address family. The source test does not prove paid IPTV/RD credentials or every codec.

Evidence: `docs/screenshots/tr/`, `PERFORMANCE_CURRENT.json`, `POSTGRES_ACTIVITY_RESULTS.json`, `PACKAGE_TEST_RESULTS.json`, `VISUAL_QA.md`, `infra/stoat/README.md`, `AGENT_DEPLOYMENT.md`. Screenshots are application captures, not design renders.

## Remaining external acceptance gates

1. A healthy Docker/core host and two actual Stoat accounts plus an unauthorized identity. Exercise auth/signup, invitations, DMs/friends/profiles/attachments/reactions, presence/read restoration, events/reconnect and actual access decisions.
2. Two physical Macs with current Stoat-authorized LiveKit grants: microphone audibility, camera/TCC, selected screen/window receipt, OS stop/device change, mute/deafen/PTT, SFU restart/network loss and real Internet TURN/TLS. Historical synthetic transport tests are insufficient. System audio stays disabled.
3. Public HTTPS core/player domain, durable database deployment and Internet shared-Activity late join/drift/recovery. Actual YouTube playback, provider-block/autoplay/referrer behavior needs this deployed origin.
4. Authorized personal IPTV/Xtream/XMLTV and Real-Debrid account, ROOMS registered public RD client ID, personal-library/resume and codecs. Public HLS demo acceptance is narrower.
5. Separate Hetzner/Linux agent host, actual own model logins/API calls, dedicated GitHub/Drive/Discord/ROOMS bot accounts, allowlisted network proof, remote browser/code/files, mention progress/result delivery and scheduled restart/approval cases. No Mac execution is substituted for the separate host.
6. Owner Apple Developer ID and notarization credentials, actual signed ARM64 fresh install/update/staple cycle. Current development distribution is unsigned and not notarized. OS notification delivery also needs actual event/OS acceptance.
7. Encrypted off-host backup and isolated restore drill; full evening M1/8 GB performance with voice/Activities; friends' rules/play sessions. Windows is preserved in source and has not been validated here.

The user deferred servers, domain, signing and external accounts until later. These are missing deployment inputs, not permission questions. No production deployment, signed release or complete first-friends acceptance is claimed.

## Actual dedicated-core deployment — 2026-10-10

This checkpoint supersedes the earlier absent-core/public-origin gates. The authorized dedicated core is running at `https://62.238.119.134` with trusted IP TLS, unmodified pinned Stoat v0.15.5, independent LiveKit, scoped access broker and PostgreSQL-backed Activities. Hoppers was not used for this deployment. Application/database image digests are recorded in `infra/production/IMAGE_DIGESTS.json`.

Actual production checks:

| Command / exercise | Observed result |
|---|---|
| `ROOMS_STOAT_TEST_ACCOUNTS=.local/production/test-accounts.json node scripts/stoat-integration.mjs` | 8 actual public-deployment social checks PASS; two identities plus outsider, events/presence/restore |
| `node scripts/verify-production.mjs` with owned private QA configuration | 10 PASS: invite registration, DM/read markers, attachment upload/download, membership-based Activity authorization, hidden Holdem view, deduplication, unsigned webhook denial and membership revocation. Served YouTube iframe is not real playback acceptance |
| `node scripts/livekit-verify.mjs` with real QA account file | Two Electron clients PASS through public SFU with actual upstream-authorized grants; synthetic audio/video, mute, screen unpublish and signaling reconnect. Native devices/picker not certified |
| `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm services:build` | PASS after fresh find-only authorization adapter; 94 tests/21 files. Existing renderer chunk-size warning remains |
| `python3 /opt/rooms/backup.py` | Encrypted backup generated with owner's SSH public key recipient, writer services resumed; backup copied/decrypted privately on the Mac |
| `python3 /opt/rooms/verify-restore.py` | Offline isolated Mongo/PostgreSQL dump restores PASS: 4 users, 1 community, 3 channels, Activity schema restored; disposable containers removed. No production restore or upload/TLS restore acceptance |
| `python3 /opt/rooms/verify-authorization.py` | Membership find allowed; accounts/sessions find and membership writes denied by actual database role |
| Certbot renewal dry run and Caddy reload | PASS for the short-lived trusted IP certificate; recurring renewal timer installed |
| Daily backup timer installation | ACTIVE, 04:30 UTC; brief authoritative-writer pause. Scheduled first execution not yet observed |
| External Mac TCP probes | Datastore/raw API/broker/internal SFU ports 27017/5432/5672/6379/9000/3022/3002/7880 not reachable; UDP not assessed by these probes |
| Activity process stop/start | Actual previously written revision, poll, whiteboard and game result retained; full-host reboot not yet tested |

Production adapters authenticate via upstream REST and read fresh channel/server/membership context through a database role limited to find on those three collections. This resolved an observed upstream five-server-reads/ten-second throttle without permission caching or modifying upstream Stoat. The schema adapter is explicitly pinned to the deployed version.

Remaining full-product gates are tracked in `OVERNIGHT_DEPLOYMENT_PLAN.md`: real native desktop production acceptance/screenshots, complete multiplayer games, actual YouTube playback, physical devices and restrictive-network relay, separate Agent host/accounts, personal providers and signed distribution. The current-thread hourly continuation is enabled; the owner authorized the one existing free usage reset at weekly exhaustion, not paid purchases. This authorization does not prove an automatic reset is available or that the product is finished.

Native production desktop acceptance: `node scripts/verify-production-desktop.mjs` passed on darwin/arm64: two actual Electron clients sign in through the application form against the public core and send/receive a message through the chat UI, with zero renderer errors. Screenshots are `docs/screenshots/production/{owner-chat,guest-chat,home}.png`; test message was removed. Native device and session-restart checks remain unverified.

## 2026-10-10 — production desktop and unsigned 0.1.1

The owner disabled Astra delegation; all subsequent design and engineering belong to the main agent. The completed onboarding changes include a production origin preset, working invitation registration/login, keyboard focus and precise Turkish errors. Actual native production acceptance passed invitation signup, consumed-ticket rejection, two-client message send/edit/delete, session restoration after process restart and logout cleanup, with zero renderer errors.

Native editing exposed upstream channel-bucket HTTP 429 responses after rapid read-marker traffic. The typed adapter now serializes matching REST buckets, respects bounded upstream reset metadata and only retries explicit pre-route 429 rejection. It does not retry ambiguous network or server failures. Tests cover exhausted bucket backpressure and mutation retry boundaries. `pnpm typecheck`, `pnpm test` (96 tests / 21 files), `pnpm build` and `pnpm services:build` passed. Rebuilt access and Activity bundles were deployed and healthy.

The actual official YouTube documentation sample on the public HTTPS player reached playback, pause and seek. Shared synchronization remains unverified. Database restore evidence now includes persisted polls and whiteboard notes. Apple Silicon unsigned v0.1.1 DMG/ZIP built successfully; `node scripts/verify-package.mjs` passed actual packaged launch, matching bundled source and local video advancement. Developer ID, notarization, physical-device acceptance and separate Agent host remain prerequisites. Private credentials and six single-use delivery invitations are in a gitignored 0600 handoff file.

## 2026-10-10 — shared playback and core reboot

Two real desktop clients passed official YouTube playback and shared pause delivery with zero renderer errors. An observed polling-induced re-seek/pause loop was fixed by decoupling clock sampling from synchronization triggers and comparing state feedback against elapsed authoritative position. Unsigned v0.1.2 includes this fix and passed actual packaged launch/source matching/local video verification. The 96-test suite passed again. v0.1.1 remains an immutable earlier preview.

A fresh encrypted backup completed at 01:51:10Z. Plaintext staging cleanup now survives a writer restart failure. Full core reboot acceptance passed with a changed boot ID, existing authenticated session, preserved Activity polls/whiteboard/queue, 16 running services and active backup/certificate timers. Startup service-state checks now wait for convergence; an earlier immediate assertion encountered transient startup state. Physical media reconnect is not inferred from core recovery.

## 2026-10-10 — real devices and seven public game hands

Two actual desktop clients on the same Mac passed native microphone publication/received audio packets, actual ROOMS window-picker capture/received video packets, and voice persistence across Home/Chat/Cinema/Games. Camera remains untested with OS permission not determined; two physical-computer audible acceptance is still outstanding.

All seven real public API full-hand cases passed: Holdem, Blackjack, four approved Batak variants and 101. Private hands stayed hidden from the other authorized participant, and completed-hand history was recorded. A real-clock lifecycle check passed 30-second disconnect bot substitution, the same cards on returning to the existing seat and automatic host transfer. These are public API/table-engine checks, not a claim that every native game control has been played manually.

Scoped maintenance SSH passed permitted ROOMS status and denial of general root, direct Docker, other projects and private deployment reads. The owner keeps root access; arbitrary code deployment is intentionally not delegated through the status/restart wrapper. Native evidence and the 0.1.2 private unsigned installation guide are committed.

## 2026-10-10 — complete encrypted recovery and conflict handling

The latest encrypted backup quiesces MinIO together with authoritative writers, completes atomically and retains seven complete archives. Actual isolated recovery passed Mongo/PostgreSQL community and Activity state, ten completed archived game hands, TLS certificate/private-key matching, and a restored object read followed by authenticated AES-256-GCM decoding with restored Stoat metadata/configuration. Both encrypted copies were preserved off-host. All owned plaintext recovery staging and disposable containers were removed; the owned temporary attachment message was deleted. The seven-archive retention threshold and first scheduled backup execution remain unobserved.

Native Activity IPC validates command schemas and bounds revision-conflict recovery to three writes. Only an explicit `409 REVISION_CONFLICT` refreshes the same room and retries the same command UUID/payload. Ambiguous network outcomes, unrelated conflicts, and server errors are never retried. Fresh/result snapshots must match the room and the initiating authentication session must remain current. Four focused tests cover these boundaries; 100 tests across 22 files passed.

Hardware capture evidence explicitly applies to development Electron, with two clients on one physical Mac. It does not certify fresh packaged ROOMS permission prompts, camera capture, restrictive-network TURN/TLS or two physical-computer audible calls.

## 2026-10-10 — packaged shared YouTube 0.1.3

Actual two packaged Apple Silicon 0.1.3 clients passed official YouTube playback, shared pause, pointer seeks received by both players, keyboard seek, authoritative two-viewer membership and late rejoin with 0.055 seconds observed drift and zero renderer errors. The paused timeline displays authoritative room state; stale paused SDK positions do not overwrite accepted seeks. SDK duration is reported by the public player and timeline controls disable until ready.

`pnpm build` (including typecheck), `pnpm test` (100 tests / 22 files), packaging and `node scripts/verify-package.mjs` passed. Packaging verification compares all 22 bundled files, then launches the actual package and checks bundled local playback. `ROOMS_QA_PACKAGED=1 node scripts/verify-shared-youtube.mjs` recorded the public UI checks and removed only its newly created queue item. Earlier harness assumptions about queue count after a new Activity and lagging SDK positions were corrected. Sixteen core services were running at final scoped maintenance status. Actual screenshots are preserved; camera, fresh TCC onboarding, physical second-client and signing gates remain open.

## 2026-10-10 — real native recovery and lifecycle

Friends now use observed gateway presence instead of waiting for the list refresh; disconnected presence is unknown. Actual two-client dnd/invisible/online event acceptance passed with no renderer errors. Actual macOS attachment picker cancellation preserved the draft, native selection/upload/UI send and second-client download matched owned bytes. The picker was operated through native UI, not stubbed.

YouTube loads have a bounded 25-second state and fresh-player retry. Official errors 2/5/100/101/150/153 receive precise explanations; unusable playback controls disable. An actual packaged client recovered official playback after its iframe API request was deliberately interrupted; actual provider code 150 was rendered below the unobscured official player. Queue selection and independent voice are preserved.

Media broker IPC exposes only allowlisted grant reasons and guards changed authentication sessions. Two real development Electron clients passed actual window publication, second-presenter exclusion, presenter handoff, logout, active revocation in 7.476 seconds, fresh-grant denial and presenter lease release. Owned QA membership was restored in cleanup. Earlier harness failures used the wrong Turkish cancel label and exposed an untranslated disconnect snapshot; both were corrected. No renderer errors. Same-Mac development capture does not certify fresh packaged TCC, camera or two physical computers.

Visual inspection found disconnected voice still said ready/microphone available and an English empty-roster pseudo-element. The page now reports closed transmission and reconnection state, renders its empty text explicitly and permits reselecting a disconnected room. Final package acceptance follows below when complete.

Unsigned Apple Silicon 0.1.4 built successfully. Final actual package verification compared all 22 current bundled files and checked packaged launch/local playback. Two actual packaged 0.1.4 clients passed official shared playback/pause, pointer/keyboard seek, authoritative membership and late return with 0.108 seconds observed drift, zero renderer errors. Owned queue data and profiles were cleaned. Earlier packaged blocked-player recovery also passed; final small voice-state text changes do not alter that player implementation. The latest complete suite passed 100 tests / 22 files. Existing Vite large-chunk/dynamic-import warnings remain; this is not a full-evening performance certification.

Private v0.1.4 prerelease was published against fb7adaa; uploaded DMG/ZIP/checksum digests match local bytes. GitHub reports immutable:false, so published assets are preserved by policy. The private installation handoff points to 0.1.4. Final scoped maintenance status returned all sixteen core services running. No QA process remains active. Remaining physical-device, signing, restrictive-network and separate-Agent/provider prerequisites are unchanged.

## 2026-10-10 — native game controls and retained-table suspension

Actual packaged 0.1.4 ran against a uniquely created disposable Stoat text channel, with real public authorization and no social fixtures. All ten native cases passed: Holdem create/bot/start/raise/fold/completed history; Blackjack virtual bet/start/stand/result; four Batak variants with appropriate bidding/trump/bury/legal-card actions; all four 101 folding/team combinations with server-confirmed rules and select/draw/discard. Every case confirmed table closure. A retained playing 101 table remained byte-equivalent across multiple post-close server sweeps. Zero renderer errors; the exact owned channel was removed. This does not certify every game action, complete native Batak/101 hands, pairs/meld/joker processing or Internet reconnect.

The original five-second sweep required at least thirty seconds for three 101 bots to draw/discard. Default sweep is now one second and retained games advance only while selected as the primary Activity. Explicit seat return can resume the same retained hand without redealing. The passing native 101 runs measured 7.881–13.933 seconds including bot decisions, public authorization and UI delivery. Closed/inactive hands no longer produce background game mutations. One regression verifies close, unrelated primary selection and explicit return with unchanged private cards. Local full-hand tests now renew the authenticated viewer's lease separately from its idle-turn deadline instead of relying on a closed table continuing in the background.

`pnpm test` passed 101 tests / 23 files; `pnpm typecheck` and `pnpm services:build` passed. Only the Activity bundle was atomically replaced and only its service restarted. Remote SHA-256 matches the local bundle; the previous bundle is retained for bounded rollback. Public health passed. A during-acceptance single sample reported Activity CPU 1.33%, memory 72.45 MiB of its 256 MiB limit; this is a point measurement, not a stress-test guarantee. Desktop release assets remain unchanged. Actual screenshots are preserved under docs/screenshots/production/game-*.png.

## 2026-10-10 — bounded packaged performance and scheduled backup

`ROOMS_QA_SOAK_SECONDS=900 node scripts/verify-packaged-soak.mjs` passed 908 actual seconds on M1/8 GB, real packaged 0.1.4, one fresh profile, silent looping original local demo and 15 Home/Settings/Cinema cycles. Zero renderer errors/process crashes. Summed process working set: initial/peak 528.06 MiB, final 369.86 MiB (shared pages are counted more than once). Sampled CPU median 1.887%, maximum 2.557%; one initial observed dropped video frame and zero in later playback sessions. The actual screenshot was inspected and the owned profile removed. This is bounded local playback, not live voice/provider/network or full-evening certification. Evidence: infra/production/PACKAGED_SOAK_RESULTS.json.

`node scripts/verify-scheduled-backup.mjs` observed the real 04:30 UTC timer start at 04:30:19, successful archive `rooms-20261010T043031Z.tar.age`, all eight paused writers resumed and sixteen running services. Its encrypted mode-0600 off-host copy matched size and SHA-256. No manual backup invocation; no new restore is inferred. The seven-archive retention threshold remains unobserved. Evidence: infra/production/SCHEDULED_BACKUP_RESULTS.json.

## 2026-10-10 — native 101 draft isolation regression

A new optional `ROOMS_QA_GAME_STAGING=1` mode uses two successive owned 101 tables on a uniquely created disposable upstream channel. Actual packaged 0.1.4 failed: a staged two-tile group survived table closure and remained in the next table. Group creation/removal passed, zero renderer errors, both owned tables/channel were cleaned. The failure evidence is preserved separately in infra/production/NATIVE_GAME_STAGING_0.1.4_RESULTS.json.

Games now clears selected cards/tiles, staged groups, target meld/joker, history and dialogs when authenticated seat/room/table or hand status changes. Draft groups containing a tile no longer in the private hand are removed as whole groups, preventing stale submission. Actual packaged 0.1.5 passed both successive-table staging cases, native grouping/removal, draw/discard and closure with zero renderer errors; the owned channel was removed. This verifies the reproduced table-switch failure, not all meld/pair/joker rules or complete native hands. Typecheck/build, Apple Silicon packaging and actual launch/local playback with all 22 bundled files matching passed. The general ten-case game regression and private release publication follow only after actual acceptance.

The first general 0.1.5 native run reached the configured 120/minute Activity rate limit from rapid QA snapshot reads after six passing games. It rendered the precise rate error and cleaned its owned table/channel; evidence is NATIVE_GAMES_0.1.5_RATE_LIMIT_RESULTS.json. The harness now spaces read observations by 1.5 seconds and successive cases by five seconds, without changing production limits or retrying mutations. The paced run passed all ten actual packaged 0.1.5 game cases, including Blackjack stand and four 101 combinations, zero renderer errors, unchanged closed-table state and exact owned-channel cleanup. Observed 101 bot round trips were 6234–6339 ms. Six-client rate-limit headroom remains an independent load gate.
