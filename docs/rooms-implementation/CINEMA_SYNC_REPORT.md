# Independent-source Cinema synchronization

Date: 2026-10-10. Explicitly selected implementer: gpt-6-astra / medium. This follows CINEMA_LIFECYCLE_REPORT.md and replaces its earlier internal source-readiness blocker with implemented, bounded-local-tested behavior. No production service was deployed or mutated.

## Public protocol

The existing protocolVersion 1 command union has additive strict commands:

- `cinema.source`: `itemId`, `timelineEpoch`, `referenceId`, random UUID `sourceVersion`, `expectedSourceVersion` (previous UUID or null), bounded finite `durationSec` (0 < n <= 86400). Compare-and-swap prevents an older declaration from replacing a newer one after automatic revision retry.
- `cinema.ready`: item/epoch/sourceVersion plus boolean `ready`. A ready declaration must match the selected reference and canonical duration within two seconds.
- `cinema.release`: item/epoch/sourceVersion. Removes that actor's declaration so late readiness messages cannot resurrect a stopped source.
- `cinema.playback`: item/epoch/sourceVersion plus `playing`, bounded `positionSec`, `rate`. Requires current room control permission and an unexpired ready declaration belonging to the actor. Rejects stale queue epochs, source versions and positions beyond the canonical duration.

Optional `RoomSnapshot.cinema` is `{itemId,timelineEpoch,referenceId,durationSec,sources}`. Each source is `{userId,sourceVersion,durationSec,ready,updatedAt}`. Canonical duration starts from the first declared source for a queue epoch. Queue selection resets declarations and duration. Sources are removed on departure. Readiness expires independently of generic room presence after 15 seconds; the persistent source owner refreshes it every 10 seconds while the element is actually ready. This bounds readiness after missed cleanup, process loss, or a continued chat presence lease.

No source URL, native capability, local path, filename, provider credential or byte content is part of the public schema. Extra fields are rejected. Metadata is a participant declaration and synchronization hint, not proof of authorization or identical content. The UI requires explicit same-content/access confirmation and clearly states that similar duration does not prove identical content.

Legacy unguarded `playback` is rejected for Cinema. Existing YouTube playback, screen and game commands keep their previous behavior. Cinema queues accept independent-source items; YouTube queues accept YouTube items. Existing generic realtime test was moved to YouTube; dedicated tests now cover the stricter Cinema path.

## Client behavior

Queue items now expose actual selection. The source sheet lets a participant explicitly bind a separately selected native file to the chosen public item. The host waits for loaded finite duration and decoded media readiness, then publishes metadata and readiness after confirmation. It renders actual ready counts, duration mismatch, loading/error and reconnection states without claiming verified content matching or that every client is synchronized.

The permanent player follows the existing server clock/timeline, corrects drift beyond 0.75 seconds, and handles play/pause/seek/rate as server commands. Rapid seek after pause uses authoritative playing state rather than delayed local media state. Programmatic playback events are distinguished from native PiP controls. Automatic-play rejection keeps an explicit click-to-play reason. Local buffering/error pauses that client and withdraws readiness; canplay recovery restores readiness after the previous explicit confirmation. Missing sources do not stop other viewers, as specified by S25 source_missing/S26 error. Account, room, queue epoch and source changes clear private bindings; source teardown withdraws the public declaration and revokes the native capability.

All original S25 default/source_missing and S26 default/matching/mismatch/late/error PNGs were opened. S25 responsive, host-left, buffering and reconnect originals are not separately visually accepted by this report. The existing full player styling remains awaiting screen-level visual review; functional screenshots are not a fidelity acceptance.

## Executed checks

- `pnpm exec vitest run --config vitest.config.ts tests/cinema-protocol.test.ts tests/cinema-lifecycle.test.tsx tests/activity-realtime.test.ts --maxWorkers=1`: 14/14 passed at 13:38:03 local (6 strict protocol/lease/cleanup tests, 6 persistent-element tests, 2 existing realtime compatibility tests).
- Coordinator ran integrated typecheck successfully during implementation; later small changes require its final integrated check.
- `node .local/design-review/evidence/cinema-sync/check.mjs`: PASS using two isolated actual headless Chromium contexts, two real video elements loading the authorized local QA MP4, and the actual Activity HTTP server on a temporary loopback port with explicit development-only authorization identities. Final checked values: playback Alice 3.086681s / Bob 3.07024s, both paused, both sought to 12s. Stopping Bob's source removed its video while Alice continued at 14.415634s. Zero runtime errors; captured commands contained neither private media URL nor filename.

The script blocks external requests. Social and voice surroundings are development fixtures. The native IPC transport is replaced only inside this local harness by a same-origin intercepted bridge to the temporary real HTTP service; native Electron IPC and actual Stoat authorization are not certified by this test.

The final check used its own temporary Vite server on port 5174 with watching/HMR disabled to isolate the run from concurrent repository edits. Both temporary servers closed afterward. One shared-development-server rerun was invalidated by HMR resetting test identities; this is recorded as harness interference, not a passing product check.

Intermediate checks exposed and corrected: Vite HMR module duplication in the harness, missing byte-range media responses in the harness, source-ready restoration after seeking/buffering, and using delayed local playing state during rapid pause-then-seek. Evidence is bounded functional evidence, not a soak/reliability claim.

Files under `.local/design-review/evidence/cinema-sync`: reproducible `entry.ts`, bundled temporary `server.cjs`, `check.mjs`, captured public command `result.json`, and `alice-after-source-loss.png` functional screenshot. Temporary server and both contexts close at script completion. No production remote disruption or load tests were performed.

## Limits

Owner's physical two-Mac acceptance, visible native Electron PiP/fullscreen behavior, real independently licensed media editions, real Stoat authorization, external provider integration, long outages and Windows remain unverified. Client-reported duration is not trusted for ownership/authentication. Dedicated native provider/live compact windows remain separate. The public timeline is implementable without distributing private media; there is no automatic byte-level edition matching.
