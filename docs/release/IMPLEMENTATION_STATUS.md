# Private release implementation — 2026-10-12

Owner approved the private-friends plan. Preserve DJ/current features and the full reference inventory; do not implement the public scope cuts automatically. The public audit remains NO-GO and its public-only gates are not silently closed. Root alone implements; source branch codex/reference-package.

Two physical Macs will be tested by the owner and friend later. REL-001 stays OPEN. Independent software/test/operating work continues while that gate is pending. No production disruption, main merge or public V1 publication is implied.

## Baseline reconciliation

- Source/local and remote branch:06f5477. Installed0.1.17-preview.4, build1791819276.
- Read-only production health/feed:HTTP200; installed version appears in appcast.
- Local/deployed access SHA256c986093062f308456ee8f327c6876505f1e6c95b5f0e8fd67b1743de6594d9a0 and activities49e05edc9389c291aec4cfc0840b89667354fcabfa8fbda1dd43444187c86349 match. Health/hash equality is not authenticated acceptance.
- Fresh REL-004 reproduction48413:2/2 DJ tests fail at MusicDJ.tsx:31; realtime test mock omits participants. Production snapshot includes participants. No production crash inferred.
- REL-005 remains OPEN: desktop acceptance waits for removed .hero and obsolete sign-in/voice labels.
- pnpm lint/CI absent; package source version0.1.14 differs from installed override.

## Task protocol

Record failure/version/steps/evidence before repair. Record actual validation after repair and preserve prior failures. Local verification and physical acceptance are separate statuses. Update RELEASE_BLOCKERS, QA_MATRIX/EVIDENCE and this ledger after meaningful groups. Commit coherent changes and push the reference branch. Never promote the413 reference records from coarse release checks.

## Execution order

1. REL-004/005/015/009: meaningful DJ regression, current isolated desktop smoke, lint/CI, toolchain risk disposition.
2. REL-001/006/014: microphone/capture/animation/chat defects; real two-Mac acceptance remains owner-dependent.
3. REL-006/007/008/003: latest normal-user/outsider/recovery, versioned durable data, isolated current restore and private user data operations.
4. REL-009/010/011/013:0.1.18-rc.1 provenance, low-disk preflight, signed install/update/recovery, sanitized operator signals/docs.
5. REL-012: six real identities/current2h session, measured UX/performance, immutable private artifact acceptance.

## Current work

REL-004 local repair verified: complete typed realtime fixture and local bot gain/mute regression. Current Vitest 4.1.11 suite passes 96 files / 666 tests. Lint and typecheck pass. Frozen install passes after targeted age-compliant transitive pins; see DEPENDENCY_TRIAGE.md. Build/services completed successfully. Desktop smoke and hosted CI results follow below. Physical acceptance remains open. Production services/accounts, installed app and retained releases remain unchanged during baseline work.


## Reconciled updater and retention evidence

Main 0bd1a7e contains PRs #2–#4; this branch is intentionally not blindly merged/reset. Main's SPARKLE_UPDATE_ACCEPTANCE.md / RESULTS.json certify signed preview.3 → preview.4 native install-on-quit and next normal launch with profile sentinels preserved. Immediate relaunch was not observed. REL-010 remains open for fresh friend install, next RC, signed-in separate-device acceptance and interruption/low-disk recovery. Missing generated outputs were deliberate cleanup and have now been rebuilt. release/retained holds current preview.4 and rollback preview.3 signed archives; both are preserved.


## Private production continuation — 2026-10-12

Phase-one local baseline PASS; see PHASE_ONE_RESULTS.md. Hosted CI execution still pending. Next: microphone selection/device recovery, packaged Recep playback, chat navigation/refresh and stale responses. Physical REL-001, authenticated REL-006/007, data REL-008/003, RC/operations REL-009/010/011/013 and soak REL-012 stay open.

## Phase-one hosted completion and phase-two repairs

191bd37 hosted GitHub run38312614543 PASS: Ubuntu baseline and macOS native smoke. OAuth workflow scope was granted by the owner through the normal Brave device flow after initial push rejection. CI is now executed, not merely configured. REL-009 still needs RC provenance/packaging.

Phase-two software repairs pass29 focused tests and full672 tests (98 files), lint/type/build/services. Delayed microphone completion/error after leave is fenced; obsolete room capture stopped. Reaction history refresh preserves gateway changes and cannot overwrite another account/channel. Recep playback failure retains poster and explicit retry; actual isolated native DEMO loop/retry passed. Existing preview.4 decodes in an isolated local probe; intermittent owner failure remains unaccepted. Two physical Macs, provider playback/source renewal and authenticated social/permission journeys remain open. Next independent work: versioned durable Activity reading and isolated data compatibility, followed by RC/operating gates in approved order.

## Phase-three independent local data work

Durable Activity version1 codec implemented with pure supported-v0 reading, explicit version/nested-structure checks, extension/game/history preservation and fail-without-reset behavior. Eight focused compatibility checks and full99 files /680 tests pass; build/services pass. Disposable actual PostgreSQL persistence, unknown-version row preservation and custom dump → separate database restore pass with identical state hash. Production archived snapshots/current backup/uploads/Mongo/ledger, ordinary QA accounts/outsider, real reset-mail/session revocation and private export/deletion remain OPEN; no disposable authenticated desktop fixture is configured. See PHASE_THREE_DATA.md. Local phase-four pipeline preparation can proceed without closing those gates.


## Continuation result — 2026-10-13

Local continuation completed through the independent data/RC preparation:101files/685tests and exact-source hosted CI PASS. Local notarized0.1.18-rc.1/build1791842324/sourceab03fe0 archives prepared and separate signed-out launch verified. Actual latest encrypted-backup Activity subset27rooms/60archives/1,255receipts restored/read/projected without mutation. Full Mongo/objects/ledger restore, ordinary QA/mail/data requests, two physical Macs, next-candidate update/recovery, alert delivery and six-identity2h acceptance remain OPEN. No installed/feed/production/Hoppers change. See RC_0_1_18_RESULTS.json and PRIVATE_ACCEPTANCE.md. Next required evidence is a named disposable QA community/mailbox and owner/friend physical participation; existing accounts are not substitutes.


## Owner-approved minimal UI — 2026-10-13

Conversation-first shell and local room-event sounds implemented;105files/705tests, lint/typecheck/build and exact-source hosted CI PASS. Separate notarizedRC.2/build1791845627 from30ffd42 prepared/extracted/launched with disposable profile, with no account/data mutation. InstalledRC.1 preserved, feed and services unchanged. See MINIMAL_ROOM_UI.md and RC_0_1_18_2_RESULTS.json. Owner visual/sound and physical two-Mac acceptance remain OPEN. SMTP deferred; password not changed.


## Owner Kıraathane/speaking refinement — 2026-10-13

Supplied interior image, transparent HTML labels and existing-game entry implemented; current table uses authoritative seats, unsupported chess/backgammon disabled and one-primary-game constraint preserved. Existing microphone tracks provide visual metering without new capture/playback/publication. Local107files/711tests, focused24checks and exact-source CI38322060530 PASS. Separate Apple-notarizedRC.3/build1791847538/source7b69962 packaged, copied/extracted and launched on a disposable profile; actual packaged image loads under file://. InstalledRC.1, RC.2, profiles and retained archives preserved; no feed/services/accounts/Hoppers changes. Physical speech timing, owner visual acceptance and real friend matches remain OPEN. See KIRAATHANE_SPEAKING_UI.md and RC_0_1_18_3_RESULTS.json.


## Owner-authorized RC.3 publication — 2026-10-13

Owner requested release only and withdrew local installation work. Published v0.1.18-rc.3 as a prerelease in the existing private GitHub repository, targeting verified source7b69962, with accepted DMG/ZIP, manifest and Apple receipt. GitHub asset SHA256 digests match the manifest. Existing Sparkle channel updated only after archive upload; prior feed entries and archives preserved, with pre-publication feed backup retained locally. Trusted HTTPS public archive download matches manifest SHA256 and its Ed25519 signature verifies with the installed public key. No owner installer/update invocation or backend service/account/data/SMTP/Hoppers mutation. This explicit prerelease publication authorization does not close physical two-Mac, owner visual, friend-game, update/recovery or final freeze acceptance gates. Trello delivery card marked complete; feature/physical acceptance remains open. See RC_0_1_18_3_PUBLICATION.json and https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.3.


## Owner-requested installation — 2026-10-13

Owner subsequently requested RC.3 installed for inspection. Exact retained ZIP SHA256 verified, release space gate PASS, staged app strict signature/ticket/Gatekeeper/version PASS. Existing app normally closed when running; previousRC.1 preserved at /Applications/.ROOMS-before-0.1.18-rc.3-rc.1.app, stagedRC.3 atomically moved to /Applications/ROOMS.app and post-install verification PASS. Build1791847538 opened; existing owner sign-in visibly retained. Installer did not edit profile files or invoke login/logout, microphone, room/game commands or messages. Owner actively changed UI during native observation; inspection stopped rather than interrupting their session. Physical two-Mac/real match acceptance remains OPEN. Native AX showed a Lounge heading with a General composer placeholder; actual message destination not verified, no message sent, follow-up recorded. See RC_0_1_18_3_INSTALLATION.json. Distributed-device architecture discussed later is not implemented in this release.


## Voice-room correction — RC.4 published

Voice-room clicks now show real participant cards and visible room controls per latest owner screenshots, superseding chat-first voice navigation. Existing DJ/Kıraathane/chat/media actions retained. Local109files/716tests and exact-source CI38372221748 PASS; signed/notarizedRC.4/build1791881544/source4b38a86 published to private GitHub prerelease and signed Sparkle feed with public archive SHA256/Ed25519 verification. App installation staged but not completed: native control guard refused normal quit during owner UI changes; no bypass. Owner asked to close ROOMS. InstalledRC.3 and all profiles/archives remain preserved. Physical two-Mac acceptance OPEN. See DISCORD_ROOM_VIEW.md and RC_0_1_18_4_RESULTS.json.


## RC5 follow-up publication — 2026-10-13

Owner's duplicate old/new room presence report corrected: old capture/playback/transport departure begins immediately on room selection/leave, without waiting for target grant; serialized latest-target/account fences retained. Pending view masks old media and own stale directory presence is excluded outside actual current connection, without removing friends. RC4 participant cards and visible share/camera/mic/activity controls retained. Local109files/720tests, final focused30checks, lint/type/build/services PASS; exact-source CI38375215353 Ubuntu/macOS PASS. Native disposable DEV DEMO wide and actual900×700 checked after fullscreen resize settles; dock bounds within viewport and screenshots inspected. Earlier harness captured a resize transition before layout settled; evidence now waits for viewport/dock layout, not just setSize. No owner real media commands.

Sourcea9911cb259bc0a5ccff2948103100ca2b0e1d29e, RC5/build1791883043 Apple Accepted f18724bb-7345-408f-9749-0e5f8799734f. Strict signatures/staple/Gatekeeper, retained artifact hash parity and signed isolated launch PASS. Published https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.5; GitHub artifact digests and trusted HTTPS archive SHA256+Ed25519 PASS; prior feed entries/archives preserved. Installation staged/verified but NOT performed; current app remains RC3 because native UI guard blocked normal quit and owner close is pending. Guard not bypassed. RC4 stage retained too; use RC5 for next install, preserving RC3 rollback. Accounts/data/Hoppers untouched. Physical two-Mac acceptance remains OPEN. See ROOM_SWITCH_FOLLOWUP.md and RC_0_1_18_5_RESULTS.json.
