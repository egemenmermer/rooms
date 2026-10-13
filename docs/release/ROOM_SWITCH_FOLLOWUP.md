# Immediate voice-room departure follow-up

Reported by the owner on 2026-10-13: selecting another room leaves the owner visible under both old and new rooms; installed application still displays chat rather than the released RC4 participant stage.

Diagnosis: target membership grant was awaited before disconnecting the previous media room. Read-only directory polling can retain the owner's previous presence for five seconds. RC4 has been published but is not installed; installation remains pending a normal owner-approved application close after the native UI concurrency guard blocked quit.

Required correction: stop previous local capture/playback and disconnect immediately on selection or leave, preserve serialized latest-target/account fences, and hide stale own directory presence without removing other participants. Keep the released RC4 stage and controls. Verification and delivery evidence will be appended after checks; physical two-Mac acceptance remains open.

## Implemented and locally verified

RC5 preserves the released RC4 participant stage and visible controls. Selection/leave immediately starts old transport departure and revokes existing local tracks/playback before grant/network/mixer cleanup. Duplicate teardown is coalesced; connects remain serialized with latest-request/account fences. Pending target view masks old media; stale own directory presence is excluded outside the current actual connection, preserving friends. Late old transport subscriptions/playback/device errors cannot attach or change the new snapshot.

Full local109files/720tests PASS; focused30checks PASS after final edits; lint/type/build/services PASS. Native Electron disposable DEV DEMO wide1440×774 and900×700: participant stage/cards, mic/camera/share controls, source chooser/cancel, device menu/Escape, single Soundboard dialog, fullscreen, own-channel chat and incoming share Watch PASS, zero page errors/overflow. Screenshots inspected. Evidence .local/voice-room/rc5-verify.log, rc5-focused.log, rc5-lint.log, rc5-type.log, rc5-visual.log and visual.json. No owner capture/publication/message/game actions. Physical two-Mac transport/presence reception remains OPEN.


## RC5 follow-up publication — 2026-10-13

Owner's duplicate old/new room presence report corrected: old capture/playback/transport departure begins immediately on room selection/leave, without waiting for target grant; serialized latest-target/account fences retained. Pending view masks old media and own stale directory presence is excluded outside actual current connection, without removing friends. RC4 participant cards and visible share/camera/mic/activity controls retained. Local109files/720tests, final focused30checks, lint/type/build/services PASS; exact-source CI38375215353 Ubuntu/macOS PASS. Native disposable DEV DEMO wide and actual900×700 checked after fullscreen resize settles; dock bounds within viewport and screenshots inspected. Earlier harness captured a resize transition before layout settled; evidence now waits for viewport/dock layout, not just setSize. No owner real media commands.

Sourcea9911cb259bc0a5ccff2948103100ca2b0e1d29e, RC5/build1791883043 Apple Accepted f18724bb-7345-408f-9749-0e5f8799734f. Strict signatures/staple/Gatekeeper, retained artifact hash parity and signed isolated launch PASS. Published https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.5; GitHub artifact digests and trusted HTTPS archive SHA256+Ed25519 PASS; prior feed entries/archives preserved. Installation staged/verified but NOT performed; current app remains RC3 because native UI guard blocked normal quit and owner close is pending. Guard not bypassed. RC4 stage retained too; use RC5 for next install, preserving RC3 rollback. Accounts/data/Hoppers untouched. Physical two-Mac acceptance remains OPEN. See ROOM_SWITCH_FOLLOWUP.md and RC_0_1_18_5_RESULTS.json.
