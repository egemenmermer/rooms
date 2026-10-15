# Channel feedback follow-up

This batch follows the existing BF-001–012 work; it does not certify physical Mac/Windows/iPhone audio acceptance.

- Image previews and expanded dialogs use a neutral photo label rather than exposing the uploaded filename. Non-image file downloads still show the filename so the user can identify the document.
- Public Spotify playlist import is described in [SPOTIFY_PLAYLISTS.md](SPOTIFY_PLAYLISTS.md).
- The DJ has an optional synchronized lyrics panel. Opening it requests LRCLIB using only the current song title/duration; the desktop main process first checks the current authorized room snapshot. A bounded fixed-host request and strict artist/title/duration matching reject ambiguous recordings. Plain lyrics are not presented as synchronized lyrics. No Genius scraping, account credentials, persistent lyrics archive, or HTML injection is involved. The UI follows confirmed DJ playback, pauses/seeks, caps extrapolation after missed polls, and ignores late responses for previous tracks.
- Successful signed update-feed publication can announce reviewed release notes to a configured text channel. Candidate packaging never sends a message. A stable nonce, channel history check, receipt and single-writer lock prevent duplicate announcements, including an ambiguous network result. There is no automatic resubmission when delivery is uncertain.

## Release announcement setup

Keep the optional operator configuration outside source/assets at `~/.config/rooms/release-announcements.json`, or set `ROOMS_RELEASE_ANNOUNCEMENT_CONFIG` to its absolute path. Required fields: `origin` (HTTPS origin), `channelId`, `tokenType` (`session` or `bot`), `tokenFile` (private credential file). Use a publisher identity allowed to write only the intended announcements channel where possible. Never commit these values or copy them into installers.

Before publishing, put `release-notes.json` beside `release-manifest.json` in `ROOMS_RELEASE_OUTPUT`. Its `version` must match the manifest, and `changes` is an array of 1–15 reviewed, concise user-facing strings. The rendered message must fit 2000 characters and cannot contain mass mentions. Describe only features actually included and tested in that release. The publisher validates these inputs before uploading artifacts, and sends only after the update feed has been promoted. No automatic notes are inferred from commit messages.

Receipts live beside the operator configuration in `announcement-receipts/`. If the publication succeeded but announcement failed, preserve the artifacts/feed and inspect the receipt/channel. A `pending` receipt or stale lock requires an operator to reconcile the remote result; do not clear it blindly. After reconciliation the exported `announcePublishedRelease` helper can retry only the notification, without uploading artifacts again. Windows-only/custom publication flows must call the same helper after their own successful artifact promotion; a shared version is announced only once.

## Remaining provider scope

The Together Watch hub now opens the official synchronized YouTube player at `/watch/youtube`, personal IPTV/media at `/media`, or the explicit capture picker for an already open Stremio/other application window. Existing `/youtube` DJ links remain compatible. Personal media capture keeps the player visible instead of navigating away after capture starts. This is external Stremio window sharing, not native Stremio account/add-on integration; provider credentials and source URLs are not shared. Reels continue to use ordinary screen sharing, as requested. Physical two-client YouTube synchronization and native window/system-audio capture still need acceptance on the packaged clients. Closed-app iPhone notifications still require the separate native push delivery/provisioning work. Existing physical playback and interruption checks remain open where no user confirmation exists.

## Validation checkpoint

TypeScript, scoped ESLint/format checks and the production renderer/Electron/notices build passed. The full test run passed 150 files/964 assertions initially; five files needed follow-up. The capture navigation assertion now waits for the asynchronous router transition. DJ, import and gateway suites passed in isolated reruns. All 13 personal-media metadata checks passed with the same assertions and a local 5-second Testing Library wait/20-second test budget after the default timing budget expired on the busy host. Watch hub, explicit capture, photo, lyrics and announcement tests passed. A fixed-host live LRCLIB request returned a timed result; provider coverage and timing quality depend on the recording and are not guaranteed.

The existing operator host has a private `yenilikler` channel configuration. No release announcement was sent, no installer was signed or installed, no update feed was promoted, and no playback was started during this batch. The owner confirmed that external Stremio window sharing is sufficient for this phase. Production rollout and physical room playback acceptance remain separate steps.
