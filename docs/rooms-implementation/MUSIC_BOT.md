# Room music bot — current implementation, 2026-10-12

Root implemented the owner-approved separate LiveKit voice participant. The opaque dark/purple draggable DJ popup is a controller only: link input, previous, play/pause, next, disconnect and queue removal. The silent extracted Recep animation loops independently. There is no music iframe or local music player. Closing the popup does not stop server playback. Ordinary launch preserves the current conversation; legacy DJ routes return to the preceding page.

Native authenticated IPC calls the access gateway. Fresh channel permissions and actual voice-room membership are required for control. A bounded internal worker publishes stereo 48kHz audio through LiveKit; its token cannot subscribe or publish data. Signed webhook authorization checks the actual music lease. Permission revocation, empty rooms and paused idle sessions clean up audio, grants and temporary files. Source URLs, credentials and file paths never appear in snapshots.

Queues contain at most100 references, with downloads deferred until the selected track. Direct public HTTPS MP3 sources use pinned public-address fetching and checked redirects. Local decoding is restricted to file/pipe and MP3; tracks are bounded to30 minutes/40MiB. Cached inactive files are evicted above160MiB, with a200MiB hard cap. Two room sessions are permitted. The dedicated container has bounded memory, CPU, processes and temporary storage, no public port and a read-only filesystem.

## YouTube prerequisite

The owner explicitly requested YouTube links and playlists instead of manual MP3 uploads. A fixed-provider yt-dlp adapter is implemented, with canonical URL validation, bounded playlist enumeration, lazy audio extraction and concise provider errors. This is a third-party source adapter, not the official IFrame API. It does not contain a hidden YouTube player, bypass authentication/DRM, extract personal browser sessions or distribute provider credentials.

The actual Hetzner probe for the supplied video failed with normal YouTube sign-in/bot verification. Consequently YouTube audio is NOT verified working. The owner offered to prepare a separate bot account. Account authentication remains pending; no cookies or password have been collected, and a fixed server-only cookie-file adapter is prepared but no account session has been transferred or configured. An explicit owner-approved dedicated bot session is required; personal browser cookie extraction is not performed. Earlier official shared-player evidence does not certify this adapter. Spotify room audio is not implemented.

## Actual evidence

Focused local suite:10 tests across worker, gateway, popup, source canonicalization and URL parser passed. This includes lazy playlist downloading, cache reuse, private snapshot shape, source cleanup, controller membership, publish-only grants and forged/revoked lease rejection.

Actual isolated local WebRTC test used one publisher and two Node RTC subscribers: each received334 frames,289 with nonzero samples. This proves local transport only; it does not certify two physical Macs or production audible playback. The owned local SFU was stopped afterward.

DEV-only visual checks: no page errors, draggable bounded popup at950x700, opaque styling, actual muted/playing loop and no music iframe. Latest popup measured340x501px. Production data was not seeded.

Owner authorized installation of the dedicated music worker and access authorization update after encrypted backup with rollback. Deployment receipts remain private under .local/remediation. Hoppers and personal account data were preserved. Final delivery/version evidence is recorded in CHECKPOINT.md. Apple notarization and actual two-Mac acceptance remain separate open gates.
