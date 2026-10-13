# Immediate voice-room departure follow-up

Reported by the owner on 2026-10-13: selecting another room leaves the owner visible under both old and new rooms; installed application still displays chat rather than the released RC4 participant stage.

Diagnosis: target membership grant was awaited before disconnecting the previous media room. Read-only directory polling can retain the owner's previous presence for five seconds. RC4 has been published but is not installed; installation remains pending a normal owner-approved application close after the native UI concurrency guard blocked quit.

Required correction: stop previous local capture/playback and disconnect immediately on selection or leave, preserve serialized latest-target/account fences, and hide stale own directory presence without removing other participants. Keep the released RC4 stage and controls. Verification and delivery evidence will be appended after checks; physical two-Mac acceptance remains open.

## Implemented and locally verified

RC5 preserves the released RC4 participant stage and visible controls. Selection/leave immediately starts old transport departure and revokes existing local tracks/playback before grant/network/mixer cleanup. Duplicate teardown is coalesced; connects remain serialized with latest-request/account fences. Pending target view masks old media; stale own directory presence is excluded outside the current actual connection, preserving friends. Late old transport subscriptions/playback/device errors cannot attach or change the new snapshot.

Full local109files/720tests PASS; focused30checks PASS after final edits; lint/type/build/services PASS. Native Electron disposable DEV DEMO wide1440×774 and900×700: participant stage/cards, mic/camera/share controls, source chooser/cancel, device menu/Escape, single Soundboard dialog, fullscreen, own-channel chat and incoming share Watch PASS, zero page errors/overflow. Screenshots inspected. Evidence .local/voice-room/rc5-verify.log, rc5-focused.log, rc5-lint.log, rc5-type.log, rc5-visual.log and visual.json. No owner capture/publication/message/game actions. Physical two-Mac transport/presence reception remains OPEN.
