# DJ link mirroring — owner request 2026-10-13

Record before implementation: owner explicitly requests public Spotify/SoundCloud song links resolved to matching YouTube recordings and played by the existing room DJ. Current parser supports YouTube only; no SoundCloud developer application exists. Current main/RC5 remains preserved.

Scope: single public song links, public display metadata only, no Spotify/SoundCloud audio/cookies/DRM/private-account extraction or API credentials. Existing YouTube video/playlist/direct authorized MP3 flow remains. Provider playlists/albums without complete authenticated enumeration must fail explicitly rather than substitute a song or partially import a list. Resolution must check title/artist/duration when available, exclude wrong recording variants and stop on uncertain matches. Playback source must be labelled YouTube, not Spotify/SoundCloud playback. Public metadata/schema/network changes and two-client audible acceptance remain distinct.

Spotify developer restrictions identified earlier remain documented; this is not a claim of Spotify-approved integration or blanket rights clearance. No automatic security/approval guard may be bypassed. Public metadata access failure is a retryable failure, not permission to extract an account/session. Accounts/data/Hoppers/RC5 rollback preserved. Checks and delivery recorded after implementation.

## First checks and immutable-container restriction

Initial focused17tests PASS, full111files/736tests/lint/type/build/services PASS before final duration/UI checks. Two mock-call tuple type errors were corrected without runtime changes; final scoped checks rerun. Public Spotify embed metadata and SoundCloud oEmbed resolved actual sample title/artists. A read-only source-probe attempt failed at docker cp because active music container rootfs is read-only. No security setting altered, no retry through another write path. Existing container untouched; owned host probe file is cleaned. New image will be verified in an isolated QA container with the same read-only rootfs and explicit temporary-storage budget, through the normal staged-image delivery workflow.

## Queue refresh race found by new provider tests

Full follow-up739tests failed2 new provider UI checks: an initial/pending snapshot could finish after add and overwrite the newer command result, hiding the just-added queue item. Record before correction: pause periodic snapshot polling during a command and cancel the pending snapshot before sending it; retain room/account panel lifetime fences. Recheck both new provider inputs and existing direct-file controls.

## Verified source result

Final local111files/740tests, lint/type/build/services PASS (verify-complete.log). Final provider UI tests cover both links, actual YouTube label, no provider iframe/player, late snapshot cancellation and existing controls. Public metadata samples resolved Spotify Rick Astley title/artist213.573s and SoundCloud Forss title/artist; no provider audio or credentials fetched. Native Electron disposable DEV DEMO900×700 input, bounds, decoded Recep loop and panel close PASS; screenshot inspected, no pageerrors. Code includes strict share-link host/path parsing, public pinned DNS/HTTPS-only bounded requests and conservative recording variant/title/artist/duration matching. Queue snapshot schema unchanged; matched YouTube source remains private, queue title attributes YouTube.

Playlist/album imports for Spotify/SoundCloud are explicitly unsupported; existing YouTube lists stay supported. Exact audio equivalence and physical two-Mac audibility remain OPEN; metadata confidence is a heuristic. Hosted CI, staged image source probe, deployment and RC6 publication results follow separately.

## Release hold — 2026-10-13 owner reports

The owner reported that screen/window enumeration fails in the installed application and that a YouTube add returns an access error. Both are open defects. Two isolated source-to-PCM checks failed (`SOURCE_DECODE_FAILED`), despite successful metadata matching. Search success is not playback acceptance. No further release, updater publication, or installation is authorized until the reported problems and related verification are complete. RC.6 was already published before this hold; its immutable bytes are not replaced.

Audio quality review requested for `lavalink-devs/youtube-source` and `topi314/LavaSrc`; direct integration remains under evaluation. Physical two-Mac acceptance remains open.

### Investigation and unpublished corrections

- Owner desktop: RC.5 installed; real native picker reproduces the generic enumeration error. System Settings shows ROOMS screen recording enabled. No permission was changed and no screen was published. Native isolated Electron enumeration returns 2 screens / 9 windows, with and without thumbnails. This isolates the failure to the installed running application/session; it does not prove its root cause or repair.
- Source enumeration now distinguishes denied/restricted permission from OS enumeration failures. When preview enumeration fails, screen and window lists are requested separately without previews; accessible sources remain selectable. Final explicit selection and confirmation remain required. No security setting or source authorization is relaxed. Four regression tests pass; installed-app acceptance is still OPEN.
- Actual isolated YouTube streaming checks for both metadata matches reject with `MUSIC_YOUTUBE_ACCESS_REQUIRED`. No OAuth/poToken/proxy/client-rotation bypass was attempted. Existing approved bot session did not suffice. YouTube metadata search is PASS; actual audio playback is BLOCKED by provider access, not accepted.
- RC.6 removed from the live updater discovery feed and GitHub release returned to draft after the owner's hold. Artifacts, tag and rollback archives retained. Owner's ongoing download cancelled through native UI; installed RC.5 and active room left intact. No new release or installation.
- Unpublished publisher target raised from 128 to 510 kbps Opus, stereo 48 kHz PCM retained, DTX/RED disabled according to LiveKit maximum-quality guidance. This is an encoder ceiling, not measured delivered bitrate or lossless/upstream-quality recovery. Actual listener/network acceptance remains OPEN.

### Upstream assessment

[youtube-source](https://github.com/lavalink-devs/youtube-source) is an MIT-licensed Java Lavaplayer source manager / Lavalink plugin. Its stream REST route could feed a strictly isolated media adapter, but it is not an in-process replacement for Node/LiveKit. Its README itself states authentication methods do not guarantee access. Introducing it while an actual provider denial is present is not treated as a verified fix or authorization to bypass that denial.

[LavaSrc](https://github.com/topi314/LavaSrc) is Apache-2.0 and requires Lavalink v4+. Spotify is metadata mirroring; YouTube playback is provided by another source manager or its yt-dlp integration. It does not directly provide Spotify room audio. Its documented ISRC-first then title/artist search is a useful matching improvement when a verified ISRC is available. Current public metadata path does not invent an ISRC and conservatively matches title, all artists, duration and version. No Java service added to production.

[LiveKit maximum quality](https://docs.livekit.io/transport/media/advanced/) supports a 510 kbps stereo ceiling and recommends real network testing. Current pipeline decodes the provider's compressed WebM audio to PCM then re-encodes Opus; it is not Opus passthrough or lossless.

Unpublished correction validation: scoped 8 files / 32 tests PASS; lint, typecheck, renderer/Electron build and service bundles PASS. RC.6 public DMG/ZIP moved to `/opt/rooms/held-releases/0.1.18-rc.6` after exact SHA checks; immutable local/retained archives and GitHub draft assets kept. No new artifact produced or deployed.
