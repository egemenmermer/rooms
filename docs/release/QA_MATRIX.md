# User journey health and QA matrix
Current audit uses disposable profiles; no actual production account/channel state was modified. WORKING means implemented with scoped historical evidence, not current end-to-end acceptance. UNKNOWN means exact verification remains required.
| Journey / screens | Dependencies and persistence | Current status | Loading/error/edge evidence and gap | Gate |
|---|---|---|---|---|
| New user: download → install → welcome → invite/register → home | Apple artifacts, broker ledger, Mongo Stoat, native vault | PARTIAL | Fresh welcome/register render; old invite one-use acceptance; clean friend installation and latest registration/restart/partial-signup unknown | REL-006/010 |
| Returning user: launch → restore/login → open history | encrypted vault/cache, Stoat REST/gateway | WORKING historically | New signed-out startup verified; latest multi-account restore/logout/revocation/cache fencing needs packaged test | REL-006 |
| Invite handling and community management | account broker vs upstream community invites, Mongo role authority | PARTIAL | consume lock/expiry code exists; description/icon/invite management incomplete; test expired/used/cancel/permission and uncertain creation | REL-006/014 |
| Chat/DM/friends: select → send/edit/delete/upload → navigate → restart | Stoat, Autumn objects, encrypted cache, relationship queries | WORKING historically / current UNKNOWN | Local cache and friend tests pass; history-flicker repairs recent; verify two real accounts, deleted channel, revoked access, offline send and logout | REL-006 |
| Voice: join → talk → mute/deafen → navigation → device loss → reconnect → leave | access grants/webhook/sweep, SFU, OS device permissions | PARTIAL; P0 evidence gate | Transport history on one Mac; owner mic failure record; newest fallback unaccepted; physical audibility/PTT/restrictive TURN unknown | REL-001 |
| Camera/screen/system audio: consent → publish → receive → stop/logout | native source capability, LiveKit, actual OS settings | PARTIAL | code/local capture history; two physical Macs, stereo vs mic, revoked permission and delivered quality not certified | REL-001 |
| Poll/board: create → other member acts → navigate/rejoin → restart | single Activity writer, PostgreSQL state/receipts | WORKING scoped | 2026-10-10 native history + fresh fixture-authorized PostgreSQL restart; current six-user/cache/permission acceptance open | REL-008/012 |
| Games: create → legal actions → settlement/history → rejoin | rules/projections, Activity persistence | PARTIAL | extensive older engine/native evidence; advanced 101/poker and current UX open | Defer; optional game gates |
| Together watching/local Cinema | opaque personal file, timeline/readiness, SFU screen or official player | PARTIAL | shared personal-source sync uses local intercepted IPC/social fixtures; official player route replaced by DJ; personal codec/DRM errors need scoped acceptance | Defer complex sync |
| DJ: link/playlist → bot joins → audible playback → pause/remove | music worker, yt-dlp/ffmpeg, private session, SFU | PARTIAL | two current local tests fail; historical server decoded PCM/Node RTC; cookie rotation and blank animation reported; rights and two-Mac playback open | REL-002/004; CUT |
| Password recovery: email → trusted link → reset → login | Stoat SMTP, native clipboard scoped handle, session removal | PARTIAL | 25 reset-broker/13 IPC and associated UI local tests pass; actual deployed email/new login/session invalidation not verified | REL-007 |
| Settings/notifications/profile → save/discard → restart | renderer preferences, native settings, OS notifications | PARTIAL | scoped tests/history; native controls partly immediate, profile privacy switches unsupported; verify errors/persistence keyboard/close | REL-014 |
| Data request/account deletion | upstream data, objects/cache/backups/Activity history | MISSING user-visible workflow | No application delete/export/retention request process found; inventory and supervised verified operations required | REL-003 |
| Agent/reminders/connectors | separate Linux, keys/grants, bot accounts/egress/remote side effects | PARTIAL | local scoped fixture/service tests; actual host/login/delivery not established | Defer |
| Upgrade/recovery: old client → new signed update → restart/rollback | Sparkle, Keychain signing, appcast, data schema/backups | PARTIAL | current installed signatures/Apple ticket/feed pass; actual old-to-new update not accepted, plain pnpm build version differs | REL-009/010 |

## Fresh verification executed
- pnpm typecheck: PASS (exit 0).
- pnpm test: FAIL (exit 1): 95 passed files / 1 failed, 663 passed / 2 failed tests; DJPanel MusicDJ.tsx:31 reads participants.find but test realtime mock omits participants. Production state defines participants; do not infer a reproduced production crash.
- pnpm lint: FAIL: no lint command. Baseline absence, not a lint diagnostic against source.
- pnpm build: PASS: renderer, notices (126 installed production dependencies), Electron; chunk/import warnings.
- pnpm services:build: PASS: access/activities/agent/music.
- pnpm test:desktop --grep 'desktop shell': FAIL: .hero timeout 30s, obsolete onboarding selector; native startup independently works.
- pnpm dev via owned profile/process-group wrapper: HTTP 200, process alive, graceful termination observed. No long-session acceptance.
- Real disposable PostgreSQL fixture-authorized HTTP poll/restart/idempotency test: first pg_ctl startup FAIL, diagnostic shorter temporary socket retry PASS; fresh initialization and service/pool restart only, no Mongo/full-stack upgrade.
- Installed /Applications/ROOMS.app: codesign --verify --deep --strict, spctl assess and xcrun stapler validate PASS. No update installed or new signing submission.
- Anonymous live HTTPS access/activities health and appcast: 200. No authenticated journey proof.
- pnpm audit --prod --json: PASS, zero advisory entries. pnpm audit --json: FAIL exit 1, three moderate/two critical entries in development toolchain.
- Current/historical credential-signature scan: no matches; limited scope.
- Fresh pnpm install, complete Docker/Mongo setup, new package generation, all provider/agent/Windows workflows: NOT RUN. Existing dependencies used; Docker socket missing and disk constrained.
No failure was repaired. Pending checks are explicit, not silently skipped.


## Private production continuation — 2026-10-12

Local baseline now passes: full 666-test suite, lint/type/build/four service bundles and isolated signed-out Electron smoke. DJ remains retained in the private scope; its local listener gain/mute regression passes, provider/audible/animation acceptance remains open. Actual preview.3 → preview.4 native Sparkle update and next launch passed in main PR #3; immediate relaunch, next RC and recovery remain open. No authenticated, two-Mac or 413-reference acceptance is inferred.

## Current private source follow-up

Hosted Ubuntu/native Mac smoke PASS at191bd37. Phase-two full672-test and signed-out desktop baseline PASS. New local checks cover delayed mic completion/permission error after leave, reaction refresh across account change and simultaneous gateway message, warm conversation visibility, and Recep poster/retry/native DEMO loop. Existing installed preview.4 visual decodes locally, but the owner's intermittent failure and next packaged candidate remain unaccepted. Two physical Macs and actual provider/ordinary-account/reset/restore/soak journeys remain open.


## Continuation result — 2026-10-13

RC0.1.18-rc.1 has notarized archive/isolated signed-out launch evidence and101files/685tests + exact-source hosted CI. Current backup Activity subset preserves27rooms/60game archives/1,255receipts and projects without changes. These are separate from full Mongo/object/ledger recovery, actual normal-user/outsider/reset-mail, private data requests, physical two-Mac media, next-candidate signed update/recovery, alert drills and six-identity soak; those stay OPEN. Recep local decode/retry passed; actual signed-in candidate popup and physical DJ/microphone remain owner acceptance.
