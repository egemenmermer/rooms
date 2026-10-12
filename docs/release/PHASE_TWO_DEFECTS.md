# Private release phase two — defect ledger

2026-10-12. Root only. Each issue is recorded before product repair. Ordinary existing accounts, Hoppers, installed preview.4 and retained archives are preserved. No provider session extraction or remote disruption is part of these checks.

## REL-001 microphone

Owner reported a failed microphone in preview.3; previous actual UI showed the saved selected device unavailable. Preview.4 adds missing-device fallback on explicit unmute. Physical audibility remains unaccepted. Current source: packages/media-providers/src/index.ts, realtime.ts, Settings.tsx. Reproduction categories: selected input disappears, permission denied, device busy, default fallback, reconnect/leave during pending capture. SDK device changes and existing capture lifecycle must be distinguished from mock assertions. Capture requires explicit action; permission denial must not retry. Two new adapter regressions fail before repair: delayed capture completion leaves the departed room microphone enabled, and delayed permission denial writes an error after disconnect. These are local asynchronous contract failures, not a physical microphone diagnosis.

## REL-014 packaged Recep visual

Preview.4 owner/native evidence: empty animation and “Unable to play media”; packaged WebM and PNG match source bytes, so existence/hash checks do not certify decoding. Source is silent VP9 alpha, 640×798, 18.811s. First current check launches the installed bundle with a disposable signed-out profile, inserts only the same local visual and records decoding/time advance/error; no DJ backend/account/music command. Original source/edit master outside repo is untouched. Rights gate remains separate.

## REL-006 chat flicker and stale responses

Historical fixes cover warm channel cache, ChannelUpdate/ChannelAck handling and same-community selection. A regression for reselecting populated current history passes already; no product fix is required for that case. Reaction refresh reads a whole message list and assigns it if channel ID matches, without account/session fencing or merging concurrent gateway updates. Actual component regressions reproduce both the old-account response overwrite and the loss of a gateway message during reaction refresh. The first mock attempt omitted stopSoundboard and was corrected before those product failures were reproduced. Real-account/revocation acceptance remains open.

## REL-009 hosted CI authorization

GitHub rejected the initial commit containing .github/workflows/verify.yml: OAuth App lacks workflow scope. No credential workaround attempted. The verified baseline was split from the workflow and pushed as 1e7b524; audit baseline 3d5d4bc is included. Workflow remains local and unexecuted; owner reauthorization requested. Do not report CI complete until jobs actually run.

## Current local outcomes

- Five focused files / 29 tests PASS after microphone stale-operation guards, reaction refresh through the fenced merge/cache path, and decorative poster/retry fallback. A subsequent full typecheck caught the new community method missing from the explicit DEV fixture contract; the fixture now rejects native reaction operations as before. This was a contract wiring failure, not an authenticated service failure.
- Current installed preview.4 local visual decoded 60 frames / 640×798 and advanced from 1.50s to 2.30s without error. Prior blank-playback report is retained; no asset transcode or installed-app modification justified by this reproduction.
- Actual native DEV-only S19 component: locally rejected WebM shows the existing poster and readable error/retry; pointer retry recovers playback, 506 frames at 640×798 and time wraps to 2.12s after a 20s wait; closing removes video. This is explicitly a DEMO/no-backend fixture, not bot audio/room acceptance. Private screenshots and receipt: .local/production-continuation/dj-*-recovery.png, dj-loop-recovered.png, dj-ui-results.json.
- GitHub credential scope update completed through the owner-approved normal device flow in Brave. workflow grant verified; 191bd37 pushed. Run 38312614543 actually started both credential-free hosted jobs. Final outcomes recorded when complete; no bypass of the original rejection.
