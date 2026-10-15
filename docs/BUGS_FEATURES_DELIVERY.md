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
