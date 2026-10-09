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
