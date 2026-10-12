# Persistent personal Cinema lifecycle

Date: 2026-10-10. Implementer: explicitly tool-selected gpt-6-astra / medium. Scope: private local Cinema lifetime, not synchronized room-source matching.

## Mounting contract

`import CinemaPlayback from './CinemaPlayback'`. Mount `<CinemaPlayback notify={notify}/>` once inside `.main-view`, as a sibling after Suspense/Routes, with no route condition or changing key. Root applied this contract. Cinema.tsx retains start/source selection, shared queue, status and screen-sharing views; selected personal video renders only in the permanent host.

The existing HTMLVideoElement, playhead, rate, volume, playback and native PiP remain alive over route/query changes. Other routes show the same element as an in-app compact player. Collapsing it or entering native PiP uses a 1px transparent stage, not display:none or a portal-target remount. Return, pause and explicitly end playback remain available. Native PiP close does not stop playback. The source is private in-memory state and is never saved to storage or shared Activity state.

Explicit stop and source replacement pause/detach/reset the element and invoke the native releaseMedia opaque-capability revocation added by root. Account or server identity changes clear playback and invalidate an outstanding picker. Cancelled selection preserves the old source. A late selection after invalidation is revoked without being attached. Concurrent pickers are suppressed. Source replacement reuses the video element but reloads its source. Route-specific keyboard shortcuts do not intercept chat typing. Voice is not disconnected or reset.

## Original reference study

Read master brief and both visual-reference files; opened original S30 default, compact, personal and live PNGs. Source handoff explicitly requires ongoing media/voice, return and close behavior. Personal compact controls map to current authorized file; no reference movie/social fixtures are shipped. Live provider and dedicated native compact-window geometry are not claimed implemented by this change.

## Validation

- `pnpm exec vitest run --config vitest.config.ts tests/cinema-lifecycle.test.tsx --maxWorkers=1`: 6/6 passed, latest run 13:21:58 local. Covers exact node/playhead continuity, mock PiP continuity, explicit cleanup, identity invalidation, picker cancellation/staleness and source replacement.
- `node .local/design-review/evidence/cinema-lifecycle/check.mjs`: final PASS. Actual local Chromium loaded the existing 30-second QA MP4 through intercepted loopback requests, entered browser PiP, retained the exact element and playing state over chat and queue, closed PiP without pausing, returned with continuing playhead and stopped with paused/detached element and removed src. External requests blocked. No runtime errors.
- Final compact bounds: 370 × 302 at x1042/y570 in 1440 × 900 viewport. Initial visual check caught inherited min-height causing an oversized panel; corrected and recaptured.
- Two intermediate Chromium reruns timed out during waitForFunction; added explicit fixture identity readiness and progress markers. Final rerun completed all markers and assertions. This is bounded local evidence, not a reliability/soak claim.

Evidence: `.local/design-review/evidence/cinema-lifecycle/check.mjs`, `result.json`, `chat.png`, `in-app-mini.png`. Captures use explicitly opted-in development social fixtures and local QA media; no production network state is asserted. Integrated typecheck/build is coordinator-owned.

## Remaining limits

Actual visible macOS Electron PiP window placement, native fullscreen/OS Escape, multiple physical clients and Windows are not validated by headless Chromium. Native PiP window contents are not included in browser screenshots. Dedicated native live-provider compact window remains separate. Shared independently authorized Cinema sources still require public source identity/readiness/version protocol and server timeline wiring; this report does not claim synchronization. Further work on that protocol is explicitly assigned next.

## Follow-up

The subsequently assigned independent-source protocol is now implemented; see CINEMA_SYNC_REPORT.md for exact schema, source/readiness behavior and bounded two-local-client evidence. The earlier missing-protocol statement above records the lifecycle-only handoff time.
