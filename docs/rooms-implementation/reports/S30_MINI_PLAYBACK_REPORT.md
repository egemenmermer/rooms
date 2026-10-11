# S30 — persistent miniature playback

Date: 2026-10-11. Assigned model: GPT-6.1 Sol. Scope: S30 default, compact, personal and live; root owns bootstrap/capture and personal-player integration.

## Original review

Individually inspected all four immutable originals in `04_screens`: `S30_cinema_picture_in_picture.png`, `__compact.png`, `__personal.png`, `__live.png`. Also read the S30 editable handoff notes. The reference explicitly describes an **in-app** miniature stage; native always-on-top/PiP geometry is not implemented by that design. Normal miniature is approximately 370 × 238 CSS px, bottom-right with title/return/close above video, pause/mic/time and actual voice/private state below. Compact is approximately 320 × 80 CSS px. Closing the miniature does not terminate the Activity, voice, private source or playback.

## Implementation

- `MiniPlaybackChrome.tsx`: shared controls overlay, title and return, presentation-only X, pause/play, actual mic callback and connected/reconnecting/private state. Disabled controls expose precise reasons. Header/title return invokes the real router callback. Compact and expand affect presentation only. Component accepts no media URL or credential.
- `reference-mini-playback.css`: title/footer overlays, standard/compact geometry, focus/disabled state, narrow-screen position and reduced effects. This must load after the existing Cinema CSS; personal integration is root-owned.
- `CinemaPlayback.tsx`: existing persistent video remains mounted through route changes, normal/compact/hide/return and native PiP. X now hides the in-app panel with inert/aria-hidden; explicit Stop remains in the main player. Compact uses the same video as its background. Actual permission/readiness logic still guards shared playback; mic uses the existing media runtime. Existing native `requestPictureInPicture` remains platform-capability/readiness guarded, with honest errors. No fake OS window added.
- `dev/mini-playback-fixture.ts`: exact four named variants only. Default/compact install S25 local demo Activity/media projection, start `/cinema?view=personal`, confirm the source through the real production control, then navigate to `/chat`. Personal/live install root's S29 personal playback fixture and start `/chat`. Returns `{ variant, initialRoute, captureRoute, cleanup }`. No root bootstrap or capture change made by this agent.

`MiniPlaybackChromeProps`: `title`, `personal`, optional `live`, `playing`, `time`, `compact`, `voiceStatus`, `muted`, optional `canControl/controlReason`, and `onToggle/onMute/onReturn/onCompact/onHide` callbacks. Root must integrate it around the same persistent personal-video element for personal/live variants, recognize S30 as an opt-in DEV local projection, and preserve X-as-hide semantics. Source revocation remains exclusively Stop/account/connection lifecycle work.

## Local checks

`pnpm exec vitest run tests/cinema-mini-playback.test.tsx tests/cinema-lifecycle.test.tsx --config vitest.config.ts` exited 0: 2 files, 9/9 tests. New tests preserve exact element/source/playhead/load count on hide, re-open through return, collapse/expand without pause, and actual mic callback. Existing stop test now returns to main player before pressing explicit Stop; miniature X deliberately is no longer Stop.

`pnpm typecheck` exited 0 for the current concurrently edited workspace. Root must perform the final integrated build and exact-state captures after its personal/bootstrap integration.

No screenshots were captured by this agent; no record is visually accepted. No native OS PiP/always-on-top, physical device, provider-account, remote two-user, production deployment or owner-acceptance check was run. Exact pixel comparison, persistent personal mini integration and DEV capture routing remain root integration work. No tracker, source reference, release or production service was changed.
