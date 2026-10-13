# Private release remaining acceptance

Root-only implementation. Preserve existing accounts, production data, Hoppers and release/retained. Local automation and mock fixtures cannot close the gates below. Notarized candidate0.1.18-rc.1/build1791842324 is installed on the owner Mac. Separate notarized0.1.18-rc.2/build1791845627 includes recovery-origin and owner-approved minimal UI changes, with local checks recorded in RC_0_1_18_2_RESULTS.json; it is not installed or physically accepted. Separate notarizedRC.3/build1791847538 adds Kıraathane and speaking metering, with scoped local evidence in RC_0_1_18_3_RESULTS.json; it is also not installed or physically accepted. No private distribution/freeze until the accepted artifact and core gates are recorded.

## Ordinary-account staging (REL-006/007)

Use a named isolated QA community with two normal identities and one outsider; do not borrow an owner's production session. Authenticated desktop acceptance accepts only a private fixture file explicitly marked disposable:true with spaceId/spaceName/textId/voiceId/base and owner/guest credentials. Store it outside tracked files with owner-only permissions; never paste passwords into chat or upload the fixture. ROOMS_STOAT_DESKTOP_FIXTURES points to that file. Missing fixtures are an explicit skip, not success.

Record invite expiry/one-use/partial signup, two-way message edit/delete/upload failure, DM/friend add/accept/block/remove, profile, membership/channel revocation, logout, navigation/restart and no denied cached data. Add outsider checks with the authorized disposable identities. Actual password-reset email/link/new login and old-session revocation require the QA mailbox; local broker tests are insufficient. Any account created for QA must be named and approved as disposable before cleanup.

## Physical owner/friend media (REL-001)

Record exact bundle version/build/checksum, macOS/device selection and separate identities/networks. A→B and B→A must be heard by the recipient. Exercise mute/deafen/PTT (including typing and key release), unplug/default fallback, denied mic/camera/screen permissions, navigation30min, restrictive-network/TURN/reconnect, camera, chosen window/screen and explicitly enabled system audio. Leave/logout/revocation stops actual received tracks. Verify DJ queue/pause/resume, source refusal/session renewal and listener-local gain without claiming provider availability from mocked commands. Record the Recep loop from the actual candidate popup and recovery if decoding fails.

For RC.3, measure speech-ring onset/clear against actual local and received microphone audio, including muted/deafened/reconnect/room changes. Exercise real supported game creation/seating/play/return with friend identities; native DEMO button navigation is insufficient. Chess/backgammon and simultaneous multi-table support are not implemented.

Do not close this section without both physical participants. Signaling/connected labels, SFU membership and native DEMO animation checks are different evidence.

## Data/operator rehearsal (REL-008/003/011/013)

Before any deployment, restore a **current encrypted production backup** to an isolated target with a single writer disabled until inspection. Never restore over production. Verify DB/objects/registration ledger, archived Activity formats, poll/board/game history/receipts, upload readability and authorization after restore; measure actual RPO/RTO. Local synthetic PG dump parity only validates a narrower storage mechanism.

Private data requests: verify identity using the authenticated QA account; inventory upstream social/profile/relationships/messages/uploads, Activity contributions/history, native cache/provider records and any enabled Agent data. Prepare an access-controlled export for that identity only; log categories/counts, never contents or secrets. Deletion is supervised and first rehearsed on a named sacrificial QA identity: revoke sessions/grants, apply the documented ownership/anonymization policy, remove current private caches/owned objects and verify outsiders cannot recover them. Never mass-delete friends/production accounts. Record backup retention and restore-time deletion replay; do not promise immediate erasure from encrypted historical backups. Concrete retention durations, shared-message/history handling and legal exceptions need an owner-approved policy before implementation/claims. Current privacy controls remain honestly unavailable.

Activity now emits bounded request/sweep/health categories with build/source and no user/room/content/token/error text. Health probes actual DB/table availability. Production monitor/alert transport, uptime/dependency coverage of other services and backup/TLS/disk alert drills still need isolated operator acceptance; source logging alone is not delivered alert proof.

## Candidate delivery (REL-009/010)

Use committed verified source, source/package version agreement and the six-GiB workspace/output preflight before signing. Keep signing credentials away from hosted/fork workers. package:mac:signed builds a local candidate; release:mac additionally publishes updates and must not be used for ordinary build regeneration. ROOMS_PUBLISH_UPDATES=0 prevents feed publication during candidate preparation.

Manifest ties source SHA/build, local service digests, package sizes/hashes, storage compatibility and actual Apple Accepted/strict-signature checks. Local service digests are not proof of deployment. Check extracted archives and separate-profile installed launch/version. Do not replace /Applications or retained archives for QA. Verify fresh installation on another Mac and actual preview.4→candidate signed update, interruption/low disk/invalid-signature recovery and profile/settings preservation. Old preview.3→preview.4 install-on-quit/next-launch already passed; immediate automatic restart was not observed and remains a separate UX gate.

## Final freeze (REL-012)

After physical media acceptance, use six real identities for a measured two-hour controlled session. Record CPU/memory/cold launch/warm navigation/API failures, lost acknowledged data and listener/resource cleanup. Test900×700/large-window keyboard/Save/Discard/loading/error/offline. Publish only conservative measured budgets. Freeze one immutable accepted artifact and distribute that exact checksum; later code/service/schema changes reopen affected gates. Public rights/privacy/413-reference gates remain independent from this private acceptance.


## Tracker reconciliation — 2026-10-13

Owner requested Trello update. Read-back confirms rooms board https://trello.com/b/TkcxeAjw/rooms: four explicitly local completion cards marked done, eight acceptance/delivery/account tasks open and one SMTP task deferred. Board had no open lists/cards before this update. No Hoppers changes. SMTP completion was cancelled by owner (“tamam kalsın”); no live config/restart or recovery mail sent. Owner password-change request remains unfulfilled; no password/account mutation occurred, and the owner-only sign-in file was queued for opening. Direct password-change UI is absent. Core private acceptance gates above remain open, including delivered recovery if restored to scope; SMTP deferral is not acceptance.


## Owner-authorized RC.3 publication — 2026-10-13

Owner requested release only and withdrew local installation work. Published v0.1.18-rc.3 as a prerelease in the existing private GitHub repository, targeting verified source7b69962, with accepted DMG/ZIP, manifest and Apple receipt. GitHub asset SHA256 digests match the manifest. Existing Sparkle channel updated only after archive upload; prior feed entries and archives preserved, with pre-publication feed backup retained locally. Trusted HTTPS public archive download matches manifest SHA256 and its Ed25519 signature verifies with the installed public key. No owner installer/update invocation or backend service/account/data/SMTP/Hoppers mutation. This explicit prerelease publication authorization does not close physical two-Mac, owner visual, friend-game, update/recovery or final freeze acceptance gates. Trello delivery card marked complete; feature/physical acceptance remains open. See RC_0_1_18_3_PUBLICATION.json and https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.3.


## Owner-requested installation — 2026-10-13

Owner subsequently requested RC.3 installed for inspection. Exact retained ZIP SHA256 verified, release space gate PASS, staged app strict signature/ticket/Gatekeeper/version PASS. Existing app normally closed when running; previousRC.1 preserved at /Applications/.ROOMS-before-0.1.18-rc.3-rc.1.app, stagedRC.3 atomically moved to /Applications/ROOMS.app and post-install verification PASS. Build1791847538 opened; existing owner sign-in visibly retained. Installer did not edit profile files or invoke login/logout, microphone, room/game commands or messages. Owner actively changed UI during native observation; inspection stopped rather than interrupting their session. Physical two-Mac/real match acceptance remains OPEN. Native AX showed a Lounge heading with a General composer placeholder; actual message destination not verified, no message sent, follow-up recorded. See RC_0_1_18_3_INSTALLATION.json. Distributed-device architecture discussed later is not implemented in this release.


## Voice-room correction — RC.4 published

Voice-room clicks now show real participant cards and visible room controls per latest owner screenshots, superseding chat-first voice navigation. Existing DJ/Kıraathane/chat/media actions retained. Local109files/716tests and exact-source CI38372221748 PASS; signed/notarizedRC.4/build1791881544/source4b38a86 published to private GitHub prerelease and signed Sparkle feed with public archive SHA256/Ed25519 verification. App installation staged but not completed: native control guard refused normal quit during owner UI changes; no bypass. Owner asked to close ROOMS. InstalledRC.3 and all profiles/archives remain preserved. Physical two-Mac acceptance OPEN. See DISCORD_ROOM_VIEW.md and RC_0_1_18_4_RESULTS.json.
