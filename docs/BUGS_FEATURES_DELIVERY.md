# Bugs and features delivery

Approved order: desktop/iPhone bug fixes, then mentions, shared community playlists and explicit DJ matching choices. Existing accounts, release archives and mobile working changes must be preserved. No physical acceptance is implied by automated checks.

## Recorded before implementation

- BF-001: deafen state has no crossed headphone icon.
- BF-002: soundboard clip is published but its sender cannot hear it locally.
- BF-003: watched screen cannot be closed independently of the publisher.
- BF-004: screen audio cannot be adjusted independently of participant speech.
- BF-005: channel entry can retain the top position, including equal-length channel histories.
- BF-006: image expansion is too small; file links do not reliably invoke an authorized download.
- BF-007: closing the desktop window destroys its media renderer instead of keeping the call alive.
- BF-008: native iPhone interruption handling intentionally mutes without restoring prior user intent.
- BF-009: DJ needs separate enqueue and atomic play-now actions; empty/finished queues must start.
- BF-010: mentions need member selection and existing notification delivery without duplicate reconnect alerts.
- BF-011: uncertain song matching needs explicit candidate selection rather than a generic error.
- BF-012: community members need persistent shared playlists, queue/history saving and YouTube imports.

Deferred: full Spotify playlist authorization/import, closed-iPhone push, synchronized lyrics and expanded watch-together providers. Existing private messages, IPTV and history require regression checks, not replacement.

## Acceptance

Record focused regressions, lint/types/build and isolated desktop viewport/keyboard checks separately from actual Mac/Windows/iPhone transport. Physical sender self-monitor, independent screen audio/close, window-hide call persistence and iPhone interruption/recovery require participants. Do not mark those accepted from fixtures. Publish a new candidate only after the relevant checks and explicit rollout authorization; never replace RC10 bytes.

## First implementation checkpoint

BF-001–007: crossed deafen icon; clip-only sender monitoring; explicit gallery close and source-specific screen gain (including Cinema); account-scoped saved levels; equal-length channel-entry scroll and late image layout; large image viewer and message-authorized native save; keep-alive default while honoring an explicit saved opt-out. Microphone input is never monitored locally. Closing the gallery detaches its video view and mutes remote screen audio; this does not yet reduce its subscribed video bandwidth. Physical playback remains open.

BF-009: additive optional playNow flag keeps old add commands compatible. New UI actions distinguish enqueue from play-now; the worker serially selects the first newly added item only for explicit play-now or a finished/empty queue. Paused music stays paused on ordinary enqueue.

Local checkpoint: full verify:ci passed142files/903tests, lint/TypeScript, desktop/notices/service builds. Focused tests cover screen/speech gain separation and replacement tracks/deafen, clip-only routing, scoped downloads/revocation, equal-length channel transitions, window policy and enqueue/play-now. No deployment, installer or release was produced.

BF-008 is implemented separately in the native mobile repository, local commit692a459.105core tests and an unsigned iPhone-target build passed; physical interruption/recovery acceptance remains open. Existing uncommitted mobile UI edits were preserved; no mobile push/install/release occurred.

## Mentions and shared DJ lists checkpoint

BF-010: keyboard/click member selection binds the selected text to an actual user ID, including people with identical display names. Editing that text removes its identity binding. DM suggestions stay within the conversation; community membership queries and caches are account/server/channel scoped. Canonical mentions render readable names. The notification screen uses actual server mention/read records and opens the referenced message with a bounded history lookup. Existing opt-in, channel mute and voice-suppression preferences remain effective. Repeated delivered events do not re-add acknowledged mentions or trigger repeated native notifications. No APNs delivery was added.

BF-011: new clients opt into explicit matching candidates. A conservative match failure returns up to five sanitized public YouTube choices without changing the shared queue. A selected choice has separate enqueue/play-now actions. Provider rejection and unavailable/malformed search responses retain different errors. Legacy add callers retain the previous compatible error contract.

BF-012: community members can create, rename, edit, reorder and delete shared lists, save the current queue or a historical session, import a YouTube playlist, and append/play an entire list. Access derives the community from current room authority, rechecks it after source retrieval, serializes writes and rejects stale revisions. Atomic files preserve catalogs across restart. Only public YouTube IDs/titles/durations are stored. The 100-track request path is bounded independently of other Access requests; private media URLs are rejected. Conflicts preserve the unsaved draft and never automatically repeat a write. Use one Access writer and persist/backup the configured directory as described in SELF_HOSTING.md.

Follow-up review also covers all deafen controls and exits this gallery's own picture-in-picture view on unmount. Native iPhone follow-up commit ccd5a6a prevents a manual microphone action during rejoin from being overridden by automatic restoration; the unsigned iPhone-target build passed again. Mobile changes remain local, and the pre-existing UI working changes remain untouched.

Isolated Electron UI checks passed at 1440×900 and 900×700: actual production components, mention keyboard selection/send, enlarged image/Escape, narrow list editing/order/play-now and separate screen volume/own-view close. The fixture was labeled and used no live account, server, shell or media. It is not physical media acceptance.

## Remaining acceptance before a new release

- Deploy compatible Access and music worker builds only in an authorized rollout, persist the new playlist directory, and check ordinary accounts and revocation. Older published RC10 bytes and the installed application remain unchanged.
- Mac/Windows participants: hear a soundboard clip once at sender and peer; change screen audio without changing speech; stop watching without stopping the publisher; reopen and verify saved gains; hide/reopen the application while retaining the call. Check full-screen/PiP with actual streams.
- Two actual members: mention delivery/read acknowledgement and shared-list edits/import/history replay, together with existing DMs, IPTV and DJ playback. Unit fixtures cannot establish provider or room transport acceptance.
- Physical iPhone: incoming call and Instagram interruption, prior muted/unmuted intent, manual mute during recovery, fresh grant after a dropped transport and permission denial. No phone install, provisioning or App Store action occurred.
- Full Spotify playlist authorization/import, closed-iPhone push, synchronized lyrics and expanded video providers remain explicitly deferred.

No new release, update-feed promotion, server deployment or owner-account changes were performed by this delivery.

Final local validation: verify:ci passed148files/925tests, lint, TypeScript, desktop/notices and service builds. The final parser tightening additionally passed its focused provider-response regressions and rebuilt lint/types/application/services. Repository-wide format:check and the distribution-platform policy passed. Physical acceptance and rollout remain separate gates above.
