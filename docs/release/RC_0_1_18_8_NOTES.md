# ROOMS 0.1.18-rc.8 — private friends release

Changes since RC.7:
- DJ advances automatically after a track ends; retired completion callbacks cannot skip tracks after seeking or pausing.
- Seek within the current track, including a saved position while paused.
- Search by song title or artist, choose a result and add it to the shared queue. YouTube video/playlist and existing Spotify/SoundCloud metadata matching remain available.
- Previously merged IPTV group-label and player recovery corrections are included. The reported live-provider failure still requires exact-provider acceptance.

The owner authorized publication after testing the installed RC.8 and reporting that it works. The live access/music services and owner Mac run the frozen release source. The exact owner playlist produced non-silent room transport; seeking and automatic next were verified in an isolated SFU. Focused tests, lint/types/build and exact-source hosted checks passed. Apple Silicon macOS package is Developer ID signed, Apple notarized and stapled. Windows x64 is an unsigned friend preview, verified on a hosted Windows machine; physical microphone/screen-sharing acceptance remains open. Windows updates use the installer manually.

Preserved: existing accounts and profiles, community soundboard, multi-screen viewing, listener volumes, local noise cancellation, games, DJ queue/volume and rollback archives. Settings changes discussed after RC.7 were reverted at the owner's request; no Settings cleanup is included.

Remaining: physical two-Mac and Windows voice/noise/screen/system-audio acceptance, sustained use, all-game and soundboard edge cases, exact IPTV-provider recovery and update/recovery acceptance. Provider-restricted videos can still be refused. This private candidate does not claim universal YouTube playback or completed V1 acceptance.

Download using the existing invitation portal: https://62.238.119.134/ . macOS and Windows appear together. Existing releases remain retained.
