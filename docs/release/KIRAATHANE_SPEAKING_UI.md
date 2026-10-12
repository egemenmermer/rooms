# Kıraathane and speaking indicators

## Recorded issues (2026-10-13)
- Owner reports green speaking rings arrive noticeably after speech begins. The adapter currently reads only server-signalled `isSpeaking`; diagnostics run every five seconds but do not drive speech state.
- Owner requests Activities → Kıraathane, using their first attached image unchanged and live HTML table labels positioned over its furniture.
- The current Activity protocol supports one primary game per room, not seven simultaneous games. Reference-image occupancies are illustrations, never production data. Preserve supported games and their authoritative seat state; unavailable chess/backgammon must remain explicitly unavailable.

## Scope
Use existing published/subscribed microphone tracks for timely local visual metering, without additional capture or audio playback. Preserve server speech fallback when metering is unavailable. Preserve mute, room/account lifecycle and all game commands. No service rollout, account changes, SMTP work or existing installation replacement.

## Verification
Implementation and scoped local verification pending. Physical two-Mac timing and audio acceptance remain open.

## Implemented and checked locally
- Shared Web Audio analyser reads existing local/subscribed microphone tracks every 40ms; RMS thresholds/hysteresis and 180ms release prevent rapid flicker. Only boolean transitions notify the UI. No new getUserMedia, speaker output, recording or publication. Muted, ended and non-connected tracks are excluded; track replacement/removal closes nodes/context. Suspended/unavailable Web Audio falls back to LiveKit speech state. Server diagnostics interval is unchanged.
- Activities exposes Kıraathane even while another primary activity is open, without ending it. Supplied JPEG is copied unchanged; percentage-positioned HTML labels follow the furniture. Supported game selectors reuse existing creation forms. Only the matching current table displays authoritative seats/capacity; opening/returning sends no leave/end commands. Chess/backgammon explicitly disabled. Room remains single-primary-game; simultaneous multi-table backend expansion is not implemented.
- Full local suite: 107 files / 711 tests PASS. Final scoped speaking/Kıraathane/provider checks: 3 files / 24 tests PASS. Lint/typecheck PASS. Production build PASS; dependency policy remained active.
- Native Electron DEV DEMO QA used a disposable profile, removed after normal close: wide display-constrained 1440×774 and 900×700; supplied image loaded, supported creation form, open/return to existing table, navigation from active activity, keyboard focus and no page overflow/pageerrors. Initial harness expected the wrong Batak heading; corrected to existing “Hangi Batak?” form. Actual screenshots exposed clipped bottom tables; scene now fits available height and labels omit repeated long reasons (full disabled reasons remain accessible). Final screenshots inspected at `.local/kiraathane/wide.png` and `narrow.png`; evidence `.local/kiraathane/visual.json`.
- Native synthetic oscillator fed an existing MediaStream track into the actual analyser, without microphone capture/output/publication. Detected after 95.6ms including context startup and cleared on silence. This is synthetic local evidence, not physical speech or two-client latency acceptance.

RC.3 will be independently signed/notarized with publication disabled. Existing /Applications/ROOMS.app RC.1, profiles, RC.2 and retained archives remain preserved. Final package result pending. Trello: https://trello.com/c/TiGoJ2aG (owner/two-Mac acceptance remains open).

Pre-notarization release review identified an absolute JSX image path that works under the development web origin but resolves incorrectly under packaged `file://`. Owned first packaging tree stopped; staging/log retained, not accepted as a release. Corrected to document-relative asset path, with a regression assertion and signed native asset-load check planned. Speech analyser teardown now also occurs immediately at disconnect before asynchronous mixer teardown.

Owner refinement: keep the image dominant with subtle, transparent, readable text. Removed opaque cards/borders/shadows; labels use ~19% dark tint, 1px background blur, warm light text with restrained text shadow, compact translucent status pills and clear keyboard focus. Tools float over the scene instead of adding another opaque toolbar. Disabled labels are concise; full reasons remain in title/accessible description. Second owned pre-notarization package stopped to incorporate this refinement; no accepted artifact overwritten. Final native wide/narrow and Enter-to-open/return checks PASS, no pageerrors; synthetic detection99.3ms on this run. Owner visual acceptance remains open.
