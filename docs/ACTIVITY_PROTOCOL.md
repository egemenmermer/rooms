# Shared Activity protocol v1

The Activity server owns room revisions, participants, the playback clock, queues, polls and whiteboard elements. It does not own voice sessions or media transport. Ending an Activity never calls a LiveKit leave API.

## API

`GET /v1/rooms/:roomId/activity?afterRevision=0&waitMs=25000` returns `ActivityResponse`. Subscribe before taking the first snapshot to avoid a lost-update race. The server rechecks authorization after a long poll wakes. Requests without an injected authorization resolver fail closed with `AUTHORIZATION_NOT_CONFIGURED`.

`POST /v1/rooms/:roomId/activity/commands` accepts a strictly validated envelope:

```json
{"protocolVersion":1,"commandId":"550e8400-e29b-41d4-a716-446655440000","expectedRevision":0,"command":{"type":"join"}}
```

Every mutation validates current upstream membership through the caller-supplied `authorize(bearer, roomId)` adapter. That adapter must return the real upstream identity and effective create/control permissions. Bearer tokens are never stored in snapshots or repositories. The desktop renderer uses the native `rooms.activity` IPC bridge rather than receiving the bearer.

Commands are serialized within each room. A mismatched expected revision returns HTTP 409 `REVISION_CONFLICT`. Read the current snapshot and ask the user to retry the intended mutation. Repeating the identical command ID returns the current snapshot without applying it again. Reusing an ID with changed content fails. Receipts retain the most recent 2048 operations and events retain the most recent 256 revisions; older commands fail their stale revision rather than being applied twice. `replayRequired` means the client should replace its local state from the included full snapshot.

## Playback and source privacy

Timeline position is `positionSec + (serverNow - effectiveServerTimeMs) * rate / 1000` while playing, otherwise `positionSec`. Media selection increments a playback epoch. Clients must not treat a previous epoch's end event as completion of the new media item. All authorized controllers may play, pause, seek and manage the queue.

Shared queue media contains either an official YouTube video ID or an opaque independent-source reference plus a display title. Private files, provider URLs, credentials and personal media connections are not accepted by the strict schema. This is metadata synchronization, not a media streaming origin. A participant must independently resolve its permitted source. Actual YouTube IFrame playback and two-player drift correction require separate desktop acceptance tests.

One primary Cinema, YouTube or Screen Activity is allowed per room. Polls and the whiteboard coexist. The oldest connected eligible participant becomes host when a host leaves or its 30-second Activity lease expires. Screen source ownership does not transfer: the new host sees `awaiting-source`. With no eligible participant, the primary ends. Viewing is not voice presence.

## Persistence and deployment

`ActivityRepository` exposes load/save/list. `MemoryActivityRepository` is test-only. `FileActivityRepository` persists the local development server using mode-0600 files and atomic replacement. It supports one writer process only; it does not claim database-grade crash durability or distributed locking. A production PostgreSQL transaction implementation and multi-process revision lock must replace it before deploying multiple replicas. The existing interface makes this replaceable without changing the protocol.

## Verification

`pnpm test` runs `tests/activity-realtime.test.ts`: an actual loopback TCP Fastify server and two separately authenticated HTTP clients prove playback synchronization, long-poll updates, stale revision rejection, command idempotency, host transfer, persisted poll votes, denied outsider access and strict rejection of a credential-bearing media URL. Separate checks prove fail-closed authorization and cross-author whiteboard deletion rejection. `node scripts/activities-build.mjs` builds the service module.

Status: service and protocol verified locally using an injected test membership resolver. Production Stoat authorization, deployed service, actual two desktop players, native playback synchronization and physical-computer reconnect remain separate integration acceptance checks. Use `game.create` and the typed game commands for playable authoritative tables. The generic media `start` command deliberately rejects game IDs to require explicit game-rule configuration. Game snapshots are projected per authenticated user and never expose the private deck/stock or other players’ unrevealed hands. See `GAME_RULES.md` for tested rule profiles and remaining desktop acceptance checks.

## Actual desktop fixture acceptance
`node scripts/verify-activity-desktop.mjs` launches two distinct Electron profiles talking to an actual Activity HTTP server. Social authentication is replaced only through Playwright inspector handlers in the test harness, with an always-visible QA footer and QA identities. This is not a production bypass or a Stoat integration result.

Verified UI actions: create Holdem table, second user seat, start hand, each own private cards, fold/results history, second-user poll vote, shared whiteboard text, Cinema play/pause/seek propagating to the second actual HTML video. Screenshots under docs/screenshots/tr/*-service.png. Renderer page errors: zero on the recorded run. Deployed Stoat authorization and official YouTube provider acceptance remain separate gates.
