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

## Real media follow-up — 2026-10-13

Before further corrections, actual local media verification found:
- Signed RC.5 in a fresh isolated profile lists 2screens/9windows through its real preload/IPC path. Actual controlled native-window capture → LiveKit publication → second signed app receiver decoded9frames /11packets with expected green pixel, and stop succeeded. This is real native capture/transport, not canvas capture or mocked display media. Owner running RC.5 still reproduces enumeration failure. Normal owner restart confirmation pending because Lounge contains a real friend. No owner screen or room published.
- Actual current LiveMusicPublisher/MusicWorker → local SFU Node receiver delivers audio, but stereo440Hz-left/880Hz-right probe shows both channels identically mixed. This FAIL is recorded before correction. Native rtc-node1.1.0 lacks TfStereo source advertisement; official upstream issue1018 / open PR1337 match the observed failure. Raising bitrate alone does not fix stereo.
- Approved server bot cookie file metadata is current (no persistent expiry), but actual YouTube audio access remains denied. No cookie values were emitted. Normal bot login/verification handoff requested; no challenge, token, proxy or client-rotation bypass.

The macOS TCC log identified `Failed to match existing code requirement ... kTCCServiceScreenCapture` for the installed ROOMS. Owner approved normal permission renewal; old entry removed in System Settings, owner completed Touch ID, exact `/Applications/ROOMS.app` re-added, Quit & Reopen accepted. Actual owner selected a source and the native UI now shows their screen publication active in Lounge. Root did not choose or publish owner content. Friend receipt confirmation remains pending. No TCC database edits, signing/security disablement, force quit or permission bypass. Installed and retained RC.5 main bundle hashes match.

Owner separately approved refreshing the existing Brave Google account's YouTube-only session to the server private music directory. Scoped readonly SQL selected only youtube.com rows before normal Keychain decryption; no values or other-provider rows logged/transferred. Encrypted backup completed and only music recreated to rebind updated credential inode. Both actual matched sources now decode382752bytes of48kHz2channelPCM with nonzero samples. Provider access denial cleared by legitimate session renewal; not bypassed. Room receiver/audio quality verification remains separate.

Disk space: removed only obsolete root-generated temporary signed build trees whose DMG and ZIP hashes exactly matched protected `release/candidates` copies. Installed apps, retained rollback archives and all candidate immutable bytes kept. Stereo native patch build is pinned to upstream ffi0.12.73 source63128d01d955d9d8967544f46cff64a361232bf6. Initial build failures were missing pinned submodule inputs and missing protoc on PATH; normal pinned submodule setup and explicit installed compiler fix those prerequisites. No compiler checks skipped.

Owner confirmed friends actually see the shared screen after permission renewal. Recorded as owner-reported actual remote-screen receipt, not full microphone/DJ/two-Mac acceptance. The native share view also exposed repeated screen-handoff state429 errors. Existing2-second polling can exhaust a shared IP read budget with three clients. Correct client polling/backoff rather than disabling or raising server security limits; record this before changing polling.

Owner clarified all friends run RC.5 and have Kiraathane. New reported defects: multiplayer game controls appear unresponsive, and friends have the screen-share button but cannot publish. These are open actual acceptance defects; no stale-version diagnosis remains for this group. No new desktop package was installed on owner: only old macOS permission entry renewed. Friends need their own source-list/error/permission evidence, not an assumed fix. No friend OS permissions changed by root. Release remains held.

Patched exact native source now passes real stereo separation (left440~2048 vs left880~0.005, right880~2048 vs right440~0.17), but integration then exposed pause position0. rtc-node AudioSource.queuedDuration is milliseconds; publisher subtracted it from seconds. Record before correction: legitimate audio reaches the receiver, but pause/resume position is wrong. Convert queue duration to seconds and repeat actual control/transport test.

Game inspection identified two client issues to reproduce/correct: a rejected command waits for an already pending20s read before releasing `busy`; non-Holdem playing-table errors need closer UI inspection. Review then found an existing error banner at the bottom, so complete error suppression was not the cause; move the real error/retry next to the heading where it is visible. Native IPC already safely retries explicit revision conflicts, so no extra uncertain-write retry is introduced.


### Reviewed client correction and actual game control result

The command-failure refresh now performs an immediate read instead of joining a pending long poll. A second account/access generation check after that read prevents stale errors entering a changed session. Background long polling, server revision fences and idempotent conflict handling remain. Non-Holdem table errors/retry now appear near the heading, with one connection status and one primary error banner.

Three actual isolated Electron UIs, real local Activity HTTP server and DEMO identities completed a Blackjack round using UI Stand actions. Alice controls the table; Bob and Charlie are ordinary participants without controller privileges. Initial harness FAIL after Alice was caused by matching windows by creation order; mapping actual preload identity fixed the harness without relaxing product assertions. All three real UI actions advanced server revision and finished the round. This verifies this journey only, not every game/action or friends' physical acceptance.

Screen handoff reads now wait until voice connects, use completion-based polling with no overlap, normal5s/active reservation2s interval and10–60s error backoff. Server rate limits remain unchanged; old account/server/room callbacks are fenced. Friends report the same generic RC.5 capture error; their OS cause is unconfirmed. Provided normal System Settings permission renewal instructions based on the separately proven owner TCC failure. No friend repair success claimed.

The exact-source native stereo patch plus queue-duration unit fix passed real local DJ decoder/publisher/SFU/receiver integration:152frames,48kHz2channels, left440~2047.87 / left880~0.057, right880~2048.63 / right440~0.106; pause1.483s,32frames after resume and stop disconnect PASS. The native patch is experimental, not connected to the production Dockerfile; Linux build/transport acceptance and physical audio remain OPEN. Maximum encoder target is not a measured delivered bitrate or lossless claim.


Scoped correction validation:9files/51tests PASS, ESLint PASS, TypeScript PASS, renderer/Electron build PASS, service bundles PASS. A mistaken `build:services` command was rejected because no such script exists; corrected existing `services:build` completed normally. No product build failure or checks bypass. React review covered stable effect scope, cleanup/no-overlap, account/access callback fences, existing styles, single status/error and keyboard-operable retry controls. Experimental native patch is not deployed and release hold remains.
