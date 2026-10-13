# Kıraathane and speaking indicators

## Recorded issues (2026-10-13)
- Owner reports green speaking rings arrive noticeably after speech begins. The adapter currently reads only server-signalled `isSpeaking`; diagnostics run every five seconds but do not drive speech state.
- Owner requests Activities → Kıraathane, using their first attached image unchanged and live HTML table labels positioned over its furniture.
- The current Activity protocol supports one primary game per room, not seven simultaneous games. Reference-image occupancies are illustrations, never production data. Preserve supported games and their authoritative seat state; unavailable chess/backgammon must remain explicitly unavailable.

## Scope
Use existing published/subscribed microphone tracks for timely local visual metering, without additional capture or audio playback. Preserve server speech fallback when metering is unavailable. Preserve mute, room/account lifecycle and all game commands. No service rollout, account changes, SMTP work or existing installation replacement.

## Verification
Local implementation, source CI and signed candidate verification are complete; see the final result below. Physical two-Mac timing/audio, owner visual acceptance and real friend matches remain open.

## Implemented and checked locally
- Shared Web Audio analyser reads existing local/subscribed microphone tracks every 40ms; RMS thresholds/hysteresis and 180ms release prevent rapid flicker. Only boolean transitions notify the UI. No new getUserMedia, speaker output, recording or publication. Muted, ended and non-connected tracks are excluded; track replacement/removal closes nodes/context. Suspended/unavailable Web Audio falls back to LiveKit speech state. Server diagnostics interval is unchanged.
- Activities exposes Kıraathane even while another primary activity is open, without ending it. Supplied JPEG is copied unchanged; percentage-positioned HTML labels follow the furniture. Supported game selectors reuse existing creation forms. Only the matching current table displays authoritative seats/capacity; opening/returning sends no leave/end commands. Chess/backgammon explicitly disabled. Room remains single-primary-game; simultaneous multi-table backend expansion is not implemented.
- Full local suite: 107 files / 711 tests PASS. Final scoped speaking/Kıraathane/provider checks: 3 files / 24 tests PASS. Lint/typecheck PASS. Production build PASS; dependency policy remained active.
- Native Electron DEV DEMO QA used a disposable profile, removed after normal close: wide display-constrained 1440×774 and 900×700; supplied image loaded, supported creation form, open/return to existing table, navigation from active activity, keyboard focus and no page overflow/pageerrors. Initial harness expected the wrong Batak heading; corrected to existing “Hangi Batak?” form. Actual screenshots exposed clipped bottom tables; scene now fits available height and labels omit repeated long reasons (full disabled reasons remain accessible). Final screenshots inspected at `.local/kiraathane/wide.png` and `narrow.png`; evidence `.local/kiraathane/visual.json`.
- Native synthetic oscillator fed an existing MediaStream track into the actual analyser, without microphone capture/output/publication. Detected after 95.6ms including context startup and cleared on silence. This is synthetic local evidence, not physical speech or two-client latency acceptance.

RC.3 will be independently signed/notarized with publication disabled. Existing /Applications/ROOMS.app RC.1, profiles, RC.2 and retained archives remain preserved. Final package result pending. Trello: https://trello.com/c/TiGoJ2aG (owner/two-Mac acceptance remains open).

Pre-notarization release review identified an absolute JSX image path that works under the development web origin but resolves incorrectly under packaged `file://`. Owned first packaging tree stopped; staging/log retained, not accepted as a release. Corrected to document-relative asset path, with a regression assertion and signed native asset-load check planned. Speech analyser teardown now also occurs immediately at disconnect before asynchronous mixer teardown.

Owner refinement: keep the image dominant with subtle, transparent, readable text. Removed opaque cards/borders/shadows; labels use ~19% dark tint, 1px background blur, warm light text with restrained text shadow, compact translucent status pills and clear keyboard focus. Tools float over the scene instead of adding another opaque toolbar. Disabled labels are concise; full reasons remain in title/accessible description. Second owned pre-notarization package stopped to incorporate this refinement; no accepted artifact overwritten. Final native wide/narrow and Enter-to-open/return checks PASS, no pageerrors; synthetic detection99.3ms on this run. Owner visual acceptance remains open.


## Final RC.3 result

Source7b699622d2401c14ed0d5b5b4741646fa0f2b8d1; exact-source hosted run38322060530 PASS (Ubuntu baseline including full suite/audits, macOS native shell smoke). Earlier source runs were superseded/cancelled by workflow concurrency, not counted. Version0.1.18-rc.3/build1791847538; Apple submissionf5de16dd-72e5-4a90-9498-d2edaa365769 Accepted. Final pipeline exit0; strict nested signature, app/DMG ticket staple/validation and Gatekeeper PASS. Earlier two owned pre-notarization staging attempts were stopped for source review/owner refinement; neither accepted as final.

ZIP and DMG copied to release/candidates/0.1.18-rc.3 with manifest hash parity. Copied ZIP separately extracted under an owned temporary directory: strict signature, ticket and version/build PASS; extraction removed. Signed app launched on a random disposable profile: correct version/About, renderer Node unavailable, actual packaged JPEG loads via file:// at1280×720, zero pageerrors. Profile removed after normal close. Build asset bytes exactly match the owner attachment; JSX uses a relative path.

See RC_0_1_18_3_RESULTS.json for checksums and scoped native evidence. /Applications/ROOMS.app still0.1.18-rc.1, previous app and RC.2/retained archives preserved. No automatic update feed publication, production service rollout, account/password/SMTP/Hoppers mutation. Trello request and installation cards updated/read back; owner and two-Mac acceptance remain OPEN. Supported games preserve existing engines; chess/backgammon and multiple simultaneous tables are not implemented.


## Owner-authorized RC.3 publication — 2026-10-13

Owner requested release only and withdrew local installation work. Published v0.1.18-rc.3 as a prerelease in the existing private GitHub repository, targeting verified source7b69962, with accepted DMG/ZIP, manifest and Apple receipt. GitHub asset SHA256 digests match the manifest. Existing Sparkle channel updated only after archive upload; prior feed entries and archives preserved, with pre-publication feed backup retained locally. Trusted HTTPS public archive download matches manifest SHA256 and its Ed25519 signature verifies with the installed public key. No owner installer/update invocation or backend service/account/data/SMTP/Hoppers mutation. This explicit prerelease publication authorization does not close physical two-Mac, owner visual, friend-game, update/recovery or final freeze acceptance gates. Trello delivery card marked complete; feature/physical acceptance remains open. See RC_0_1_18_3_PUBLICATION.json and https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.3.


## Owner-requested installation — 2026-10-13

Owner subsequently requested RC.3 installed for inspection. Exact retained ZIP SHA256 verified, release space gate PASS, staged app strict signature/ticket/Gatekeeper/version PASS. Existing app normally closed when running; previousRC.1 preserved at /Applications/.ROOMS-before-0.1.18-rc.3-rc.1.app, stagedRC.3 atomically moved to /Applications/ROOMS.app and post-install verification PASS. Build1791847538 opened; existing owner sign-in visibly retained. Installer did not edit profile files or invoke login/logout, microphone, room/game commands or messages. Owner actively changed UI during native observation; inspection stopped rather than interrupting their session. Physical two-Mac/real match acceptance remains OPEN. Native AX showed a Lounge heading with a General composer placeholder; actual message destination not verified, no message sent, follow-up recorded. See RC_0_1_18_3_INSTALLATION.json. Distributed-device architecture discussed later is not implemented in this release.
