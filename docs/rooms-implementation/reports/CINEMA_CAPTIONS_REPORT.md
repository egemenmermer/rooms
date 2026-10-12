# Private Cinema WebVTT captions

Date: 2026-10-10. Bounded implementer: tool-selected GPT-6.1 Sol. No deployment, release publication, production request or tracker edit.

## Implementation

The permanent Cinema video accepts a personally selected WebVTT sidecar through `rooms:choose-caption`. Native IPC validates the trusted sender and the exact opaque local-video capability, opens an explicit file dialog, verifies that the same video is still authorized when the dialog closes, and returns only the selected filename/content. Paths are not exposed; there is no retained native caption filesystem authorization.

`caption-file.ts` accepts only `.vtt`, regular files, valid UTF-8, a WebVTT header and no null characters. The opened descriptor is inspected and the read is bounded to 2 MB plus one byte, protecting against a file growing after inspection. Unsupported encodings and oversized/non-WebVTT selections fail.

Cinema creates an in-memory `text/vtt` Blob URL, attaches a real subtitle track, and follows `cuechange`. The track stays hidden so Cinema renders plain cue text above controls; `getCueAsHTML().textContent` decodes WebVTT formatting without injecting markup. The settings sheet offers a sidecar chooser, true enable/disable and removal. Selection cancellation preserves the prior captions. Late dialog results are ignored after source invalidation.

Video ownership is unchanged. Adding/removing captions does not reload/remount the video. Captions survive route browsing with the persistent source; their Blob URL is revoked on replacement, explicit removal, source clear/account invalidation, end of playback and component teardown. Caption filename, content and Blob URL never enter Activity commands, shared state, storage or provider credentials. Captions remain personal even when the underlying separately authorized video follows an Activity timeline.

## Local checks

- `pnpm exec vitest run --config vitest.config.ts tests/caption-file.test.ts tests/cinema-captions.test.tsx tests/cinema-lifecycle.test.tsx --maxWorkers=1`: 14/14 passed, final start 19:17:43 local. Tests exercise bounded/native file validation, safe cue text, retained exact video/source across navigation, Blob revocation and stale picker invalidation.
- `pnpm typecheck`: exited 0 during integration. The final bounded-descriptor read and decoded-cue text changes followed that typecheck; root owns the final integrated build/check.

## Remaining acceptance

Tests of the renderer use jsdom and a mocked TextTrack/IPC. Actual Chromium WebVTT parsing, visible native file dialog, malformed cue-parser outcomes, fullscreen cue geometry against the original S29 captions PNG, native PiP captions, physical macOS devices and Windows are unverified. No screenshot was captured by this change and S29 is not visually accepted. WebVTT selection is supported; SRT conversion, embedded local container subtitles, shared subtitle distribution and burned-in PiP captions are not implemented. Source subtitle settings remain local; automatic content/edition matching is not claimed.
