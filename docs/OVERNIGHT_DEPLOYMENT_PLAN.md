# ROOMS — overnight product completion and continuation

Updated 2026-10-10. Owner instruction: deliver a usable private desktop product for 3–6 friends, continue overnight, and resume after a usage reset. Follow AGENTS.md, the full master brief and docs/REMAINING_PHASES_PLAN.md. Technical documentation is English; user communication and product UI are Turkish.

## Outcome and completion rule

Finish the actual product, not a demonstration or a container installation. A friend must be able to install ROOMS on Apple Silicon/macOS 14+, accept a private invitation, authenticate against the real core, exchange messages and attachments, join persistent voice, start a shared Activity and recover after reconnect. Only mark a capability VERIFIED WORKING when its specified acceptance actually passes. Unavailable accounts, signing identities and a second physical computer remain explicit prerequisites, never invented successes. Do all independent work while prerequisites remain unavailable. Do not silently change the approved separate-Agent-host requirement.

## Verified checkpoint

- Dedicated core: 62.238.119.134, CX23 x86, 4 GB RAM, 40 GB disk, Helsinki, Ubuntu 26.04. The existing Hoppers machine is outside this deployment.
- Existing owner SSH key works with the pinned host-key file `.local/ssh/known_hosts`. No password is stored in Git.
- Docker 29.1.3, Compose 2.40.3, 1 GB persistent swap, bounded logs, private datastore ports, persistent volumes and firewall are configured. Scoped maintenance SSH status/restart and general-root/Docker/other-project/configuration denials passed. Owner access remains intact.
- Public origin: https://62.238.119.134, as requested. Caddy serves a publicly trusted short-lived IP certificate. Certificate renewal timer is installed; Certbot renewal simulation passed. Direct production Caddy reload also passed.
- Unmodified upstream Stoat v0.15.5, access broker, PostgreSQL-backed Activities and independent LiveKit v1.9.12 are running. Actual image digests are pinned on the server. MongoDB 7.0.43 was selected after the upstream default MongoDB 8 refused this host kernel; no existing data was downgraded.
- Private community, owner, isolated QA guest and outsider exist. Six expiring one-use signup invitations are saved privately. Do not publish account credentials or invitation codes.
- Real social acceptance: 8/8 checks, including two-account event delivery, edit/delete, presence, restore and outsider denial (`infra/stoat/INTEGRATION_RESULTS.json`).
- Public production acceptance: 10/10 checks, including invite registration, public raw-registration denial, DM/friends, attachment delivery, authorized queue/poll/whiteboard/game state, deduplication, unsigned webhook denial and immediate membership revocation (`infra/production/ACCEPTANCE_RESULTS.json`).
- Two Electron clients received synthetic audio/video through the public SFU using actual Stoat-authorized grants; mute, screen unpublish and signaling reconnect passed (`infra/production/MEDIA_RESULTS.json`). This does not certify physical microphone/camera/native screen-picker behavior.
- Activity state survived a real writer-process stop/start (`infra/production/PERSISTENCE_RESULTS.json`). This does not certify full-machine recovery.
- 101 tests across 23 files, typecheck, desktop build and service build passed after the production authorization adapter change.
- An encrypted core backup was created, copied to the Mac and decrypted privately. Database dumps were copied to an isolated restore staging directory. Isolated offline Mongo/PostgreSQL database restores passed without modifying production. Daily backup timer is installed (04:30 UTC). Actual isolated object restore with authenticated AES-GCM decode and TLS keypair matching passed; owned plaintext staging was removed.
- Apple Silicon v0.1.5 private DMG/ZIP/checksum publication, uploaded digest matching, 22 bundled files and actual packaged launch/local playback passed; signing remains unavailable. Native production login, invitation signup, send/edit/delete, session restart/logout and screenshots now pass. Packaged shared YouTube synchronization and seven public game hands passed. Ten native game startup/action/closure scenarios also passed; advanced meld/split/all-in and native full-hand coverage, restrictive-network TURN/TLS, personal providers and separate Agent deployment remain incomplete.

## Ordered execution checklist

### 1. Recovery and production foundation

- [x] Run isolated Mongo/PostgreSQL restores with no published ports and no outbound network. Verify restored community/account records and Activity state, then remove only owned restore-test containers.
- [x] Prove the authorization reader cannot read accounts/sessions or perform writes; retain sanitized evidence.
- [x] Install the corrected backup script and daily backup timer; document the brief writer maintenance window and retention. Preserve the owner's only decryption key off-host.
- [x] Verify certificate reload, external port isolation, load/memory/disk and service health. Save nonsecret image-digest evidence.
- [x] Complete scoped maintenance access without removing owner access: fixed ROOMS status/restart wrapper; general root, Docker, other-project and private-configuration access denied. Full core reboot passed with preserved session/state and recovered services/timers. Arbitrary code deployment remains owner-only.

The latest encrypted backup also passed isolated object read with authenticated AES-GCM decoding using restored configuration/file metadata and restored TLS keypair matching. Both encrypted copies remain off-host. Owned plaintext recovery staging and test containers were removed; the first regular 04:30 UTC timer execution and encrypted off-host copy passed; the seven-file retention threshold has not been observed.

### 2. Desktop connected to production

- [x] Run two actual Electron clients against the real origin: native sign-in form, community/chat navigation and UI message send/delivery passed with zero renderer errors.
- [x] Finish native invitation signup, consumed-invite rejection, edit/delete, logout and restart restoration acceptance.
- [x] Actual native macOS attachment picker cancellation/upload/UI delivery/download byte matching passed. Three presence changes reached the other native client through observed gateway events; no renderer errors.
- [x] Capture actual Electron screenshots and record version/platform. Keep fixture labels and honest disabled/error states.
- [ ] Main agent directly implements all UI/interaction/Liquid Glass and engineering work, with running-app visual QA. Owner explicitly disabled Astra/high delegation on 2026-10-10; this supersedes the previous design policy.
- [x] Verify actual native voice remains connected across Home/Chat/Cinema/Games navigation.
- [x] Two real development Electron clients passed native screen publication, precise second-presenter exclusion, presenter handoff, logout, active membership revocation (7.476 seconds in the passing run), denied fresh grant and released presenter lease. Owned QA membership was restored; no renderer errors.

### 3. Shared activities and games

- [ ] Verify two-client queue/playback state, late join, host transfer, command replay/deduplication and recovery after service restart.
- [x] Verify real official YouTube playback, pause and seek on the public HTTPS origin.
- [x] Verify two actual packaged 0.1.4 desktop clients play the official YouTube sample, deliver shared pause and pointer/keyboard seek, join authoritatively and synchronize on late return (0.108 seconds observed drift), zero renderer errors.
- [x] Owned-client iframe API interruption reached a bounded 25-second error; retry created a fresh player, preserved selection and recovered real official playback. Actual provider error 150 disabled controls with a precise explanation. Whole-service/network reconnect remains separate; autoplay depends on each viewer’s normal gesture.
- [x] Public API/table-engine acceptance passed polls, whiteboard, seven full game hands, hidden hands, actual 30-second bot substitution, unchanged returning seats, host transfer and restored game history. Ten actual packaged public game cases now verify startup, bots, common actions and close, including four 101 rule combinations. Advanced meld/pairs/joker processing, Blackjack split/double, other Holdem actions and complete native hands remain separate acceptance.
- [ ] Verify Cinema local-source authorization and screen-sharing workflow; do not distribute provider tokens or personal media URLs through shared state.

### 4. Media acceptance

- [ ] Configure and verify TURN/TLS where appropriate for the selected IP origin and port constraints. Do not claim restrictive-network reliability until tested.
- [x] Verify native microphone and actual ROOMS window selection with received audio/video packets on two development Electron clients on this Mac. Fresh packaged ROOMS permission onboarding remains unverified.
- [ ] Verify camera capture after explicit OS permission; current status is not-determined.
- [ ] Obtain two physical-computer acceptance for audible voice, camera, screen/window capture, mute/deafen/PTT, device loss, navigation, SFU restart and reconnect. A second machine is a real prerequisite.

### 5. Separate Agent and personal connections

- [ ] Prepare reproducible deployment/runbook for the existing Agent runtime, durable jobs, artifacts, cancellation, approval queue, authorized global YOLO mode, manual memory save and scoped per-user model connections.
- [ ] Deploy on a separate Hetzner host only when its access is available. Core IP is not authorization to cohost privileged workers.
- [ ] Connect official per-user OpenRouter/Codex/Claude flows and dedicated bot GitHub/Drive/Discord accounts when supplied; test mentions only, no Discord voice, job restart/no duplicate external effects.
- [ ] Verify personal IPTV and Real-Debrid with authorized individual credentials when supplied. Keep secrets native/private. No credential sharing, rebroadcasting or DRM circumvention.

### 6. Release and handoff

- [x] Produce an updated Apple Silicon installer with the production fixes and complete native onboarding instructions; deliver credentials/invitations only through protected files.
- [ ] Complete Developer ID signing/notarization/stapling and signed updater when the owner's signing identity is available. Clearly label unsigned builds.
- [ ] Run fresh-install/update and sustained M1/8 GB performance checks; keep Windows validation deferred and explicit.
- [x] Update implementation evidence and commit/push source, documentation and sanitized results to the authorized private GitHub repository in meaningful commits with actual current timestamps.
- [ ] Report verified capabilities and remaining prerequisites. Do not mark the product finished while mandatory acceptance is missing.

## Authorized quota-reset and continuation policy

The owner explicitly authorized using the account's existing free full usage reset when the weekly quota is exhausted, then continuing this plan. At the latest checkpoint weekly usage is 100%, while ordinary usage was still allowed and one free Full reset entitlement is available.

1. Continue authorized work while ordinary usage is available. Do not consume the reset prematurely.
2. Before exhaustion, persist completed tasks, failing checks, active operations and the next concrete action in `docs/CONTINUATION_CHECKPOINT.md`. Keep passwords, tokens, private keys and live invitation codes out of documentation/Git.
3. When the weekly limit is actually reached, use at most the existing single free Full reset through an available documented account tool or the official app UI. No purchase, paid credits, subscription changes, extra accounts or limit bypass is authorized. Resetting account usage is unrelated to server access or application data.
4. The current tool inventory exposes usage inspection but no reset mutation. If the official reset UI is inaccessible, record that precise limitation and resume when ordinary usage becomes available; never claim a reset happened without confirmation.
5. The thread continuation checks this plan and checkpoint, resumes unfinished authorized work and updates evidence. It does not redo completed deployment, recreate secrets, overwrite private state or backdate new commits.
6. Notify on meaningful completion, failure or a necessary user input; avoid repeated unchanged status. The local Codex app/Mac must remain running and online for local continuation. Account limits can prevent a scheduled run from executing, so scheduling is not a guarantee of delivery by morning.

## Continuation scheduling

The current-thread hourly continuation is ACTIVE in the Codex app (automation: rooms-r-n-n-tamamla). It requires the local app/Mac to remain online and sufficient account usage. A reset mutation is not exposed by current tools; official UI confirmation is still necessary if the reset is used.

## Inputs still needed for complete acceptance

A separate Agent host/access, individual model/provider and bot account login, authorized personal media, Apple Developer signing identity, and a second physical client. Continue all independent implementation and test work without waking the owner for routine choices. Never substitute mock success for these prerequisites.

## 04:30 UTC acceptance update

Packaged 0.1.4 local-demo playback passed 908 seconds and 15 navigation cycles with zero renderer/process errors. Approximate summed working set peaked at 528.06 MiB in the initial sample and ended at 369.86 MiB; this bounded single-client sample does not certify a full evening with voice/providers. Actual scheduled backup started at 04:30:19 UTC, completed, resumed all writers and matched its encrypted off-host copy. Sanitized evidence is PACKAGED_SOAK_RESULTS.json and SCHEDULED_BACKUP_RESULTS.json under infra/production.

## 0.1.5 preview delivery

The main agent fixed a reproduced native 101 draft-state leak between tables. Packaged 0.1.4 failure and 0.1.5 two-table acceptance are preserved separately. All ten paced public game scenarios passed on the actual 0.1.5 package with zero renderer errors and owned-data cleanup. Private DMG/ZIP/checksum publication, uploaded size/digest matching and exact source tag passed; 0.1.4 assets remain unchanged. Updated protected handoff and public installation guide refer to 0.1.5. Six-client Activity rate-limit headroom, advanced native game controls and external/device/signing prerequisites remain open.

## 2026-10-10 — public Activity transport limits and authorization

`node scripts/verify-activity-load.mjs` first reproduced the shared proxy-IP limit: six public HTTP observers using two existing owned QA identities and one 3-second whiteboard writer received 42 rate-limit rejections over 152 seconds. Baseline failure and exact owned-channel cleanup are preserved in infra/production/ACTIVITY_LOAD_BEFORE_RESULTS.json. This is six connections, not six identities, native clients, voice or full-evening acceptance.

The Activity server now retains a 600/minute anonymous ingress cap and separately limits each upstream-verified user to 120/minute across rooms and rotated sessions. Forwarded headers and unverified bearer strings cannot choose the authenticated key. Current membership is still checked on every request. A separate public outsider check exposed an existing error mapping bug: access was denied but reported as 503. Recognized upstream 401/403/404/429 errors now produce bounded session/access/unavailable/rate codes without upstream details; genuine upstream failures remain 503. The earlier 503 rejection and cleanup are preserved in ACTIVITY_AUTH_ERROR_BEFORE_RESULTS.json.

Three boundary tests and the full 104-test/24-file suite, typecheck and service build passed. Only activities.cjs was atomically deployed and only rooms-core-activities-1 restarted. Final bundle SHA-256: 02dbb4d99c533689a952956ced6198dca24f4a270895866f2ec89190fe9a652e. Original rollback bundle is /opt/rooms/dist-services/activities.cjs.before-20261010T0459; the intermediate pre-mapping bundle is /opt/rooms/dist-services/activities.cjs.before-20261010T0501. No desktop bundle or published asset changed.

The same public load test then PASSed over 151 seconds: all six observers received 48 snapshots, 48 writes succeeded, zero rate-limit rejections/conflicts/failures, outsider 403 and anonymous 401 verified, exact owned channel removed. Public health and all sixteen running core services passed afterward; remote bundle digest matched. One during-load sample measured Activity CPU 5.11% and memory 65.8 MiB; this is a point sample only. Evidence: ACTIVITY_LOAD_RESULTS.json and ACTIVITY_RATE_DEPLOYMENT_RESULTS.json under infra/production. Six distinct identities/native clients, sustained capacity, advanced native game actions and external prerequisites remain open. No QA process remains active.

## 2026-10-10 — native Blackjack advanced actions

`ROOMS_QA_BLACKJACK_ADVANCED=1 node scripts/verify-native-games.mjs` PASSed on actual packaged Apple Silicon 0.1.5 against the public core, with natural server deals and no injected shoe/social fixtures. Four completed rounds verified native double (bet doubled, exactly one added card, hand settled), hit (one added card, double/split disabled afterward), split (two rendered authoritative split hands with preserved bets), stand for each active split hand, and per-hand completed history. Zero renderer errors; exact owned table/channel closure and temporary profile cleanup passed. Actual split screenshot was inspected. Evidence is infra/production/NATIVE_BLACKJACK_ADVANCED_RESULTS.json and docs/screenshots/production/game-blackjack-split.png.

The first harness run passed double but timed out starting another hand because it inspected stale finished state before the preceding asynchronous start completed. Failure and owned cleanup are retained in NATIVE_BLACKJACK_ADVANCED_START_WAIT_RESULTS.json. The observer now waits for authoritative playing state or a newly naturally settled hand before inspecting the next round. No product source, deployment, published asset or production cards changed in this acceptance step. This certifies these controls/settled hands, not every Blackjack rule, multi-player games or physical friends' play.

Visual QA also found the private-hand eyebrow says “your seat is ready” while Blackjack cards are visible: Games.tsx only counts the flat cards/tiles arrays, whereas Blackjack uses nested hands. Record this for the next grouped desktop refinement/release; do not overwrite 0.1.5 assets. Remaining independent gates include advanced native 101 meld/pairs/joker/process actions, native full Batak/101 hands, other Holdem actions, network recovery and six distinct native clients. External prerequisites remain unchanged. No acceptance process remains running.

## 2026-10-10 — scoped Activity recovery and desktop 0.1.6

Two actual packaged 0.1.5 clients on one Mac PASSed native note/poll/guest-vote delivery, observed Activity-process stop, real social message delivery while Activities was stopped, automatic recovery of PostgreSQL-backed note/poll/vote and a post-recovery native shared write. Baseline recovery evidence/screenshots remain separately versioned. This does not certify whole-network interruption, voice/SFU or physical devices.

Visual QA exposed misleading whole-social-server outage copy for an Activity-only interruption. Native Activity reads now check protocol/room/revision and the current authenticated session after asynchronous completion, retain bounded authorization codes, and report an Activity-specific outage without upstream details. Three new boundary tests cover stale sessions, foreign/malformed snapshots and network/HTTP failures; reads do not retry automatically inside the native helper. The existing observer drives normal reconnection. Blackjack now counts its nested private hands when choosing the visible hand label.

107 tests/24 files, typecheck, full desktop build, Apple Silicon DMG/ZIP packaging and actual packaged 0.1.6 launch/local video passed; all 22 bundled files match. Actual two-client 0.1.6 recovery PASSed all six cases with the precise translated Activity-only outage message on both clients, observed disconnect in 3011 ms and automatic recovery in 2832 ms. Original note/poll/guest vote remained byte-equivalent; native post-recovery note reached the other client. Zero renderer errors, exact owned-channel cleanup, temporary profiles removed and Activity resumed. Final public health and all sixteen running core services passed. Hoppers was untouched.

The first 0.1.6 copy check used an exact text locator on a container that also contains the retry button; it timed out after disconnect despite zero renderer errors. Finally restored the service and removed owned data. Failure is retained in NATIVE_ACTIVITY_RECOVERY_0.1.6_COPY_SELECTOR_RESULTS.json. The corrected observer records actual empty-description text and asserts the contained translated message; the passing record includes both strings. No product fix was invented from that selector failure.

Actual packaged 0.1.6 Blackjack PASSed correct private-hand label, native double/hit/split/stand and six naturally dealt settled rounds, including two separately settled split hands. Zero renderer errors; exact owned cleanup. Cards/shoe were never injected or altered by QA. 0.1.5 advanced evidence is preserved separately. Split and outage screenshots were inspected. Evidence: NATIVE_ACTIVITY_RECOVERY_RESULTS.json and NATIVE_BLACKJACK_ADVANCED_RESULTS.json under infra/production, docs/PACKAGE_TEST_RESULTS.json and actual screenshots under docs/screenshots/production. The ten-game suite and 101 draft-isolation checks were accepted on 0.1.5; the 908-second local-playback soak and shared official YouTube were accepted on 0.1.4. Do not imply those bounded historical checks were rerun on 0.1.6.

Remaining: native 101 opening/pairs/joker/processing/full hands, other Holdem actions, native complete Batak hands, whole-network reconnect and six distinct native-client capacity; external Agent/accounts/providers/signing/physical-device prerequisites remain explicit. Preview remains unsigned, not notarized. No QA app/process remains active.

Private v0.1.6 publication then PASSed all three uploaded file size/SHA-256 matches, exact pushed source tag a09f4dac5dba51579c6e1b9fba44b93be2941279 and unchanged v0.1.5 asset digests. Evidence: infra/production/RELEASE_0.1.6_RESULTS.json. Installation guide and protected mode-0600 handoff now refer to 0.1.6 with verified checksums. The protected access file previously contained no version/checksum despite the earlier claim; the preview section was added without altering credentials. GitHub immutable:false; preserve earlier assets by policy. No signed/notarized, Windows, whole-network or physical-device certification is implied.

## 2026-10-10 — complete native Batak hands

`ROOMS_QA_BATAK_FULL=1 node scripts/verify-native-games.mjs` PASSed all four variants on actual packaged Apple Silicon 0.1.6, natural public production deals, one human QA seat and explicitly labelled bots. Ihaleli, esli and koz-maca each played 13 human cards and completed 13 tricks; gommeli buried four own cards, played 16 human cards and completed 16 tricks. Other private hands stayed hidden. Every case verified finished authoritative state, all hand counts zero, matching archived/view scores, actual “El tamamlandı” UI, all per-player scores in native history and exact table closure. Zero renderer errors; uniquely owned channel and temporary profile removed. Final public Activity health and all sixteen core services passed. No service deployment or published asset changed.

The first complete-hand run passed backend/native-card checks, but the koz-maca screenshot captured the renderer before its final update. That passing baseline and transitional screenshot are preserved in NATIVE_BATAK_FULL_BEFORE_UI_WAIT_RESULTS.json and game-full-batak-koz-maca-before-ui-wait.png. The strengthened rerun waited for actual finished UI and verified displayed score history; all four cases PASSed. Actual ihaleli and gommeli history screenshots were inspected. Evidence: infra/production/NATIVE_BATAK_FULL_RESULTS.json and game-full-batak-*.png under docs/screenshots/production. This is native complete-hand acceptance with bots, not four physical friends or all possible rules/round sequences.

Next independent work: native 101 opening/pairs/joker/processing and complete hands; other Holdem actions; real core-network interruption/reconnect; six distinct native clients; approved whiteboard per-user undo/export. Existing Stoat adapter has a Pong watchdog and exponential reconnect, but actual network-blackhole timing is not certified. Any future network test must preserve owner SSH, affect only the dedicated core/test path, install an independently bounded rollback before disruption and never touch Hoppers. The separate Agent host, official account/provider logins, Apple signing, physical-device/camera permission and restrictive TURN/TLS prerequisites remain unchanged. Automation remains active; no reset was performed or claimed. No QA process remains running.
