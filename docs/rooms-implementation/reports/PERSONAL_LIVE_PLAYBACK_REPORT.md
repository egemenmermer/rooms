# Persistent personal live playback — 2026-10-10

## Implementation

Personal IPTV and Real-Debrid playback now starts an app-root `PersonalPlaybackRuntime`, rather than a route-owned media element. `personal-playback.ts` holds a single opaque `rooms-provider://UUID/stream` capability, provider connection ID and local account identity in memory only. It has no persistence middleware and no Activity integration. Real provider addresses, account credentials and token access remain in the existing Electron provider implementation.

Opening another route hides the same player and exposes a return bar; returning reuses the media element. The channels/library return action preserves playback; the separate Stop action unloads it. Provider disconnection from PersonalMedia stops the matching session immediately. Runtime metadata checks every 15 seconds stop sessions whose connection was removed elsewhere; account identity change clears playback. Native provider protocol invalidation and authorization enforcement are unchanged.

Live playback occupies the window below native chrome, with a quiet header, HLS/native track options, volume, play/pause, current actual seekable-window scrubber, lag readout, live-edge action and browser-supported fullscreen. Seeking uses the last contiguous real media range; absent or short ranges disable DVR with a precise reason. Idle controls hide after 2.8 seconds during playback and reveal on pointer/focus. Reduced motion disables their fade. Space acts only inside the player when no input/button/dialog owns focus; Escape returns to channels outside native fullscreen. Fullscreen includes an actual current voice-room/microphone control, without changing voice membership.

S29 live original PNG was opened and studied. Its personal-live hierarchy, stage-first geometry and floating controls informed the surface. Production does not include reference artwork, a fabricated stream or sample titles.

## Local evidence

- `pnpm exec vitest run --config vitest.config.ts tests/personal-playback.test.ts tests/personal-playback-lifecycle.test.tsx`: 7/7 pass. URL capability boundaries, matching-connection invalidation, actual-range DVR calculation, route/media-element persistence and account-change unload are exercised with local mocked native/media boundaries.
- Initial strict type check found use of the wrong media snapshot microphone field; corrected to `muted`. Final `pnpm typecheck` passed after correcting the local lifecycle fixture to the actual SocialUser shape.
- The initial lifecycle harness failed because jsdom does not implement TextTrackList EventTarget behavior; the harness now supplies that browser boundary. This does not verify native tracks or live transport.

## Remaining acceptance / integration limits

- No external IPTV or Real-Debrid source was contacted. Authorized real HLS playback, DRM/codec support, autoplay behavior, source expiry, long-running moving DVR windows, native fullscreen and actual microphone action require owner acceptance.
- Existing S29 browser fixtures render the Cinema path; they do not automatically supply a private native provider capability to this player. This new renderer still needs a dedicated development fixture/capture boundary and exact original-PNG comparison. No visual verification status is claimed.
- Fullscreen is the browser/Electron-supported fullscreen API; no separate native floating window is claimed. PiP/external-player features remain explicitly disabled where unavailable.
- Concurrent Cinema and personal playback arbitration is outside this isolated task. Root should decide whether starting either should pause the other; current integrations preserve their independent lifetimes.
- No tracker mutation, production deployment, source publication or remote service disruption was performed.
