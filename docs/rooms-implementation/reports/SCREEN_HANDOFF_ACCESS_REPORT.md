# S22 screen handoff access service

Date: 2026-10-10
Owner: GPT-6.1 Sol bounded access implementer

## Scope and authoritative identity

Changed only `apps/services/access/server.ts`, `tests/screen-handoff-access.test.ts`, and this report. Coordination now binds to the actual access service screen lease (`leaseId`, presenter `userId`), not the unrelated Activity controller. No renderer, IPC, preload, native capture, Activity engine/protocol or tracker changes were made here.

The service stores ephemeral requests for 60 seconds (one per requester, 20 per channel, maximum 1000 request-bearing channels). Approving creates a 30-second reservation for that requester. Requests, decisions, cancellation and state reads require a current Stoat-authorized voice channel member with VIDEO permission, a matching existing media grant and actual SFU participant presence. Approval rechecks both requester and current presenter. Request IDs and lease IDs are UUIDs. No caller-supplied identity or client expiry is accepted. Tokens stay inside existing private grant storage and are absent from state projections.

Approval does not stop capture, alter publication permissions or transfer an OS source. A reservation initially blocks every acquire. The existing presenter must explicitly release. Release keeps its lease blocking while SFU publication permission removal is awaited; only successful removal marks the reservation released. The next acquire is then restricted to the approved participant. The LiveKit participants scan still refuses acquisition while another user's screen video **or screen audio** tracks remain. The new presenter must select/acquire/publish its own source in the desktop integration.

Acquisition rechecks membership, reservation expiry/generation and lease identity around asynchronous operations. An uncertain initial publication grant retains its exclusion lease until best-effort SFU permission removal succeeds; the existing membership sweep retries cleanup. New lease generations, reconnect/participant departure webhooks, leave and observed VIDEO revocation invalidate relevant coordination. A lost presenter does not automatically give an approved requester a reusable capture or publication entitlement. Cleanup expiration is lazy on requests plus the existing 10-second sweep; this is single-process ephemeral state and not a horizontally replicated lock.

## API contract

All routes are POST under `/v1/media`, with the current Stoat bearer token. Times below are server Unix milliseconds.

| Route | Body | Response |
| --- | --- | --- |
| `/screen/state` | `{channelId}` | `{presenter:{userId,leaseId}\|null,requests:Request[],reservation:Reservation\|null}` |
| `/screen/request` | `{channelId,leaseId,requestId}` | `{request:Request}` |
| `/screen/request/cancel` | `{channelId,leaseId,requestId}` | `{cancelled:true}` |
| `/screen/request/decide` | `{channelId,leaseId,requestId,approve:boolean}` | `{approved:boolean,awaitingRelease:boolean}` |
| `/screen/acquire` | Existing `{channelId}` | Existing `{granted:true}` plus `leaseId` |
| `/screen/release` | Existing `{channelId}` | Existing `{released:true}` |

`Request = {requestId,userId,leaseId,createdAt,expiresAt}`.

`Reservation = {requestId,userId,leaseId,expiresAt,released}`. `released:false` means the old presenter still must release; `released:true` permits only the reserved participant to try acquiring before expiry. It does not mean that participant is publishing. Cancellation works for the owner's pending request or approved reservation, including after old-presenter release.

Typical errors: `JOIN_VOICE_FIRST`, `PRESENT_PERMISSION_REQUIRED`, `SCREEN_LEASE_STALE`, `SCREEN_PRESENTER_REQUIRED`, `SCREEN_REQUEST_OWNER_REQUIRED`, `SCREEN_REQUEST_EXISTS`, `SCREEN_REQUEST_STALE`, `SCREEN_HANDOFF_PENDING`, `SCREEN_RESERVATION_STALE`, `PRESENTER_BUSY`, `SCREEN_REQUEST_LIMIT`. SFU/upstream failures return the existing `SERVICE_UNAVAILABLE` response.

## Focused verification

Executed only:

`pnpm exec vitest run --config vitest.config.ts tests/screen-handoff-access.test.ts`

Final output (2026-10-10 18:46:16 local):

```text
✓ tests/screen-handoff-access.test.ts (11 tests) 374ms
Test Files  1 passed (1)
Tests       11 passed (11)
Duration    2.00s
```

Exit code 0. Focused cases cover approval without automatic media mutation, explicit release, still-present SFU tracks, reserved acquire exclusivity, presenter ownership, malformed generation IDs, connected membership, VIDEO revocation, cancellation/denial, expiry (including during an async scan), reconnect generation invalidation, requester leave and SFU permission-removal failure. Upstream Stoat and SFU are mocked in these tests; this does not certify actual two-client/native capture acceptance. No broad test/build, remote deployment, capture or publication was performed.

## Remaining integration and limits

Root must integrate the typed desktop bridge/state polling and actual source picker with these routes. UI may announce "old share stopped/new source awaited" only after successful explicit release and actual track disappearance; approval alone means consent awaiting release. A reservation is not a capture. This work does not establish multi-process locking or remotely prove SFU track revocation; the existing deployment uses one access process. Physical desktop permission, OS source closure, reconnect and two-client acceptance remain unverified.
