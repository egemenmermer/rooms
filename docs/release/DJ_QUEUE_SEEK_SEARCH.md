# DJ queue completion, seeking and text search

Owner report 2026-10-14: playback stops instead of moving to the next queued song. Requested shared-track seeking and song-name search alongside existing links.

## Cause and correction

The deployed Java bridge was reproduced with the owner's exact `w2BTr6qsLFc` video starting at197seconds. It emitted2.94seconds of stereo PCM, then failed after63.899seconds with the fixed decode diagnostic. Polling the original track's `getState()` missed normal completion after Lavaplayer consumed the terminator and cleared its executor. The bridge now observes `AudioEventAdapter.onTrackEnd` with `AudioTrackEndReason.FINISHED`. The same source/offset emits the same2.94seconds and exits0 in1.461seconds without diagnostics; no provider denial is treated as completion.

The worker additionally checks playback generation again inside the serialized end callback. Old end events cannot advance a queue after a seek, pause or a new playback attempt on the same track. End-of-queue records the completed position and pauses.

## Seeking

A small position slider is placed below the track clock. Mouse release or keyboard release submits one `seek` command, containing the current queue item UUID and finite position. The authority rejects a retired track, unknown duration, negative/out-of-range position and positions at/beyond the end. The slider is disabled for unknown duration or connecting playback. Seeking while paused changes the resume position without playing; seeking during playback replaces only the source decoder at the chosen offset. Room leases, generation fencing and listener volumes remain intact.

## Text search

The existing input accepts either an HTTPS link or a song/artist query. Text searches return up to5 public YouTube metadata results; choosing one uses the existing authorized bot queue/audio bridge. Search alone does not alter playback. Existing YouTube playlists and Spotify/SoundCloud single-track links retain their paths. No local player, video iframe, personal provider token or arbitrary source URL is introduced into shared snapshots.

Search uses a separate native IPC command and access gateway endpoint. It requires a currently joined user with music control permission and rechecks access after the result. Input is bounded to2–200characters without control characters, results use validated video IDs/title/duration and no worker credentials. Search has a per-credential12/minute budget and at most2 concurrent source searches; regular room joins retain their existing limits. No new account/API key is needed.

## Actual checks and limits

- Maven bridge compilation, scoped lint, typecheck, desktop/native build and service bundles PASS. Desktop build retains existing dependency-comment/chunk-size warnings.
-33focused checks in5files PASS: automatic advance/duplicate and retired end events, queued seek races, paused resume, range/identity rejection, search permission/access revocation, malformed input and UI result selection/keyboard seek.
-Actual current worker/updated Java bridge/Linux stereo publisher to a separate isolated LiveKit SFU receiver PASS. Only room/grants are QA fixtures. The real dedicated-account YouTube source is used; no human subscription, speakers or recording.
-`Diyar Pala Bensiz Yapama` search returns the expected exact video first. The owner's playlist imports10tracks. Received non-silent audio from Bensiz Yapama, paused seek/resume at190seconds and automatic transition from197seconds to Yeşilimi Ver, with non-silent audio from that next track. Exact measurements are in `DJ_QUEUE_SEEK_SEARCH_RESULTS.json`.
-The first transport harness attempt returned `QA_FAILED`; it was not counted as acceptance. The replacement uses its own disposable SFU, new local QA transport keys, no host ports and no production webhook. Its clean run is recorded separately. An earlier harness bundle failed on CJS top-level await, corrected before use.
-Native Electron sandboxed UI window with explicitly labeled local social/music fixtures: search/result click, keyboard seek, panel close without stopping,900×700 and1440×900 visually inspected, no renderer errors. This is UI evidence, not live social authorization. Temporary QA HTML was removed afterward.
-Existing production services, dedicated OAuth token file, account data, Hoppers and retained release artifacts were not modified. Source changes are not yet deployed to the live worker/access service or distributed desktop. No new release or install was made. Live user/two-physical-device acceptance remains OPEN.

Official completion contract: https://github.com/lavalink-devs/lavaplayer/blob/main/README.md . No extractor/client bypass or account reauthorization was added.
