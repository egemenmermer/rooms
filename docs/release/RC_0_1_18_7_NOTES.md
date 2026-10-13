# ROOMS 0.1.18-rc.7 — private friends candidate

The owner authorized release after the exact DJ playlist worked and requested merging the noise-cancellation branch. RC.6 remains a retained held draft; RC.7 is a fresh candidate, not a retag of RC.6. RC.5 remains the installed application until the user chooses update/install.

## Changes since the public RC.5 download

- Strong local microphone enhancement (GTCRN plus speech detection), Standard RNNoise and Off; saved mode is used in both rooms and DM calls. Locally bundled models, no inference server. Settings provides microphone/file raw-versus-filtered comparison, playback/download/delete and cancellation. Initialization/runtime failure closes the microphone instead of exposing raw audio.
- Participant and DJ listener levels survive reconnect and app restart, scoped to account/server; soundboard volume persists too. DJ attenuation now offers usable very quiet levels, with0% silent and1% mapped to0.0001 gain.
- Shared screens fit the available viewport, with a focused video, fullscreen, small selectable concurrent screens, self preview and sidebar screen indicator. Independent authorized screen grants allow multiple room publishers without taking another person's share away. Voice continues during viewing.
- Screen/window enumeration has preview-free fallback and specific local permission errors instead of a generic server error. macOS stale signature-bound screen-recording permissions can still require an OS permission renewal; release cannot grant permission for the user.
- Soundboard uploads are community sounds stored on the server, available to authorized members and retained across service recreation. Upload/read/delete permissions, bounded canonical PCM files and validated catalog storage. Old personal sounds are preserved and require explicit migration before becoming shared.
- Coffeehouse pictured tabletops are clickable, with subtle player labels; failed game commands recover without waiting behind polling. Existing games remain; all-game physical acceptance is not claimed.
- Higher private-group media request budget resolves the reported false rate-limit join failure; owner confirms friend could join.
- DJ accepts YouTube video/playlist links and public Spotify/SoundCloud metadata matching through YouTube. Matching is not provider audio extraction; restricted sources can still fail explicitly. Dedicated DJ account plus pinned upstream YouTube-source compatibility bridge/private parser fixes the exact owner source. No main-account token distribution; credentials stay server-side.
- DJ preserves playback position, recovers after failed sources and ignores retired playback failures. Real stereo48kHz room publication verified;510kbps is an encoder ceiling, not a lossless/source-quality guarantee. Timer advances smoothly between authoritative snapshots; pause freezes it and stale snapshots stop extrapolation. Panel closure preserves music and personal volume.

Existing simplified room navigation, participant tiles, camera/microphone/deafen/leave controls, activities, Coffeehouse scene, DJ animation, room entry/exit sounds, account/profile data and retained rollback archives remain.

## Verification and remaining acceptance

Merged source:117files/774tests PASS, lint/types/build/services PASS, isolated native desktop shell PASS. Strong/Standard real Electron WASM graph and Settings comparison PASS (non-silent recordings, cleanup, cancel, restart). Scoped prior native multi-share/SFU, viewport900×700/wide, shared soundboard across clients and listener-profile restart receipts remain in docs/release. Exact current DJ single/10-item playlist/pause/resume/next/stop reached real SFU with nonzero audio; owner confirms Bensiz Yapama and next Yeşilimi Ver audible in Lounge.

The private RC is not a public V1 acceptance certificate. Real two-Mac voice/noise/device/parallel-screen/system-audio and all-game acceptance, sustained session/load, update recovery and public rights/privacy/data operations remain OPEN. SMTP/password/server-account changes are excluded. Windows and Intel builds are not delivered or claimed verified.

Publication/signing/notarization/CI/artifact hashes will be recorded in RC_0_1_18_7_RESULTS.json. No install or logout is requested as part of this release.
