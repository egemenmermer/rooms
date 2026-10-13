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
