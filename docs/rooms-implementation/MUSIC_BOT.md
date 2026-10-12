# Room music bot — current implementation, 2026-10-12

Root implemented the owner-approved separate LiveKit voice participant. The opaque dark/purple draggable DJ popup is a controller only: link input, previous, play/pause, next, disconnect and queue removal. The silent extracted Recep animation loops independently. There is no music iframe or local music player. Closing the popup does not stop server playback. Ordinary launch preserves the current conversation; legacy DJ routes return to the preceding page.

Native authenticated IPC calls the access gateway. Fresh channel permissions and actual voice-room membership are required for control. A bounded internal worker publishes stereo 48kHz audio through LiveKit; its token cannot subscribe or publish data. Signed webhook authorization checks the actual music lease. Permission revocation, empty rooms and paused idle sessions clean up audio, grants and temporary files. Source URLs, credentials and file paths never appear in snapshots.

Queues contain at most100 references, with downloads deferred until the selected track. Direct public HTTPS MP3 sources use pinned public-address fetching and checked redirects. Local decoding is restricted to file/pipe and MP3; tracks are bounded to two hours/180MiB. Cached inactive files are evicted above320MiB, with a384MiB hard cap. Two room sessions are permitted. The dedicated container has bounded memory, CPU, processes and temporary storage, no public port and a read-only filesystem.

## YouTube prerequisite

The owner explicitly requested YouTube links and playlists instead of manual MP3 uploads. A fixed-provider yt-dlp adapter is implemented, with canonical URL validation, bounded playlist enumeration, lazy audio extraction and concise provider errors. This is a third-party source adapter, not the official IFrame API. It does not contain a hidden YouTube player, bypass authentication/DRM, extract personal browser sessions or distribute provider credentials.

The initial Hetzner probe required YouTube sign-in. On2026-10-12 the owner explicitly approved transferring the existing Google account YouTube session after learning that Derbeder Drone is its second channel, then explicitly authorized terminal extraction. Only YouTube-domain rows were selected in a read-only SQLite snapshot before decryption using the normal macOS Keychain. No other provider cookies or cookie values were logged or transferred. The filtered session is stored outside source/web roots and mounted read-only for the dedicated music worker. Actual authenticated metadata identified the6128-second Fred again.. set, and the provider audio probe decoded190752 stereo PCM bytes with nonzero samples. This verifies server source decoding; physical two-Mac audibility remains separate. Earlier official shared-player evidence does not certify this adapter. Spotify room audio is not implemented.

## Actual evidence

Focused local suite:10 tests across worker, gateway, popup, source canonicalization and URL parser passed. This includes lazy playlist downloading, cache reuse, private snapshot shape, source cleanup, controller membership, publish-only grants and forged/revoked lease rejection.

Actual isolated local WebRTC test used one publisher and two Node RTC subscribers: each received334 frames,289 with nonzero samples. This proves local transport only; it does not certify two physical Macs or production audible playback. The owned local SFU was stopped afterward.

DEV-only visual checks: no page errors, draggable bounded popup at950x700, opaque styling, actual muted/playing loop and no music iframe. Latest popup measured340x501px. Production data was not seeded.

Owner authorized installation of the dedicated music worker and access authorization update after encrypted backup with rollback. Deployment receipts remain private under .local/remediation. Hoppers and personal account data were preserved. Final delivery/version evidence is recorded in CHECKPOINT.md. Apple notarization was completed for the preview deliveries; actual two-Mac audible acceptance remains open.

## Streaming long sets and radio URL normalization — 2026-10-12

Production YouTube playback now streams the selected fixed-provider non-DRM WebM audio into a local pipe-only FFmpeg decoder and publishes stereo48kHz frames. The first captured PCM frame resolves startup; a full DJ set is not downloaded/transcoded before playback. Stop/pause cancels both producer and decoder, temporary credential copies are removed, and natural EOF advances the server queue. Resume uses the recorded offset. Startup is bounded to60 seconds; total provider duration/bytes are bounded to two hours/180MiB. No URL, token or player is passed to the renderer. Generated watch-link RD radio Mix parameters select the linked video; ordinary public playlist imports remain supported.

Direct-file fallback cache is bounded to384MiB, with inactive cache eviction before a large source operation. Only one add/source operation is admitted at once. The dedicated container budget is1280MiB memory/768MiB temporary storage; these are caps, not reserved allocations. User's known102-minute set fits. The Mac/native snapshot duration and timeout contract was updated with this change.

Actual source probe45632 succeeded on the deployed authenticated worker. Focused suite48792 passed10 tests; follow-up streaming worker suite17971 passed4 tests including avoiding full-file fetch for the6128-second set. Previous two-listener local transport evidence remains historical; real production participant presence was observed separately after the DNS correction. Apple-approved delivery/installer/hosted feed evidence is in SPARKLE_DELIVERY.md and CHECKPOINT.md. Session expiry/rotation may require an owner-approved refresh; credentials are never shipped to friends.


## Source reuse and listener controls — 2026-10-12

The full metadata for an explicitly queued single video is retained only in worker memory for15 minutes, at most8 entries/1MiB each. The stream producer uses a0600 private metadata file to avoid a second extraction request before startup; signed source URLs/headers never reach snapshots or renderer controls. Playlist entries remain lazy. Latest metadata-only worker deploy20261012T151630Z passed health, music SHA256bd9c7fb819423a288f3bc3b402cf32102ab1dad7dfba6d8a2b31fcd579a18e30. Actual installed preview.3 showed the Fred again.. track playing, elapsed time advancing to1:58 and DJ Recep speaking in Lounge. This is actual producer/presence evidence, not physical speaker-output acceptance. YouTube can still reject requests or expire sessions.

The DJ popup now controls the listener's bot volume with a0–100% slider and mute. Right click or Shift+F10 on a joined remote participant in room tiles/sidebar/inspector opens local mute and volume controls. No server mute permission, remote microphone change or global bot gain is involved. Muting persists across track replacement within the connection; connection teardown clears listener state. Departed participants close the menu. Bot profiles no longer offer an invalid social DM action.

The owner-reported microphone failure coincided with Settings showing “selected microphone unavailable”. Explicit unmute now retries a missing/overconstrained device against the system default; permission denial is never retried or bypassed. Successful recovery clears the obsolete error and stored selection. Device/capture error categories use actionable Turkish text without SDK URLs or credentials. Root verification:16 media-provider tests and2 participant-menu tests passed; final signed build/typecheck follows. Native microphone acceptance remains pending until the new installed version is exercised.
