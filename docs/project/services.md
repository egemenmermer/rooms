# Services and interfaces
Desktop renderer calls typed preload methods. Persistent social/provider/Agent credentials stay in native code; backend services receive authenticated requests. The tables below describe API families, not a client-authorized bypass around IPC.

## Core service catalog
| Service | Responsibility | Persistence / dependencies |
|---|---|---|
| Stoat API | Accounts, messages, relationships, communities/channels, memberships | MongoDB, upstream services |
| Stoat events | Gateway delivery/Ready/reconnect and presence events | Social authority and messaging infrastructure |
| Autumn / MinIO | Upload processing and object storage | Object data + metadata/encryption configuration |
| January / Gifbox | Upstream media/proxy features | Upstream configuration |
| Access broker | Signup ledger, live permissions, media/presenter grants, calls/music gateway | Scoped social reads, LiveKit, persistent invitation ledger |
| Activities | Authoritative room commands/snapshots, games/polls/board/timeline | PostgreSQL or local development repository |
| LiveKit | Participant/track realtime transport | Ephemeral rooms/tracks, access grants/webhooks |
| Music | Authorized voice publication and bounded source/queue lifecycle | SFU, access lease, source resolver, volatile/cache state |
| Agent | Separate-host tasks/models/connectors/reminders/approval journals | Encrypted own state, grants/policy/workers |
| Caddy | TLS termination and explicit route prefixes, static docs/updates | Certificate lifecycle and mounted public static artifacts |

## Routing
The core ingress separates /api, /ws and upload/media paths from /rooms-access, /rooms-activities and /livekit. /rooms-updates serves only signed update artifacts. /docs serves only allowlisted generated documentation.
Public raw account creation is rejected at the proxy; broker registration remains the intended path. A broad catch-all/static root must not expose generated secret/configuration files.

## Access API families
| Family | Intent |
|---|---|
| /v1/auth/register | Claim a ROOMS ticket and perform upstream account creation/join |
| /v1/auth/invites | Inspect/issue/consume supported scoped invitations |
| /v1/media/grant | Verify real channel authority and issue short-lived media JWT |
| /v1/media/directory | Read authorized observed room occupants without joining/subscribing |
| /v1/media/screen/* | State, request/cancel/decision, acquire/release presenter capability |
| /v1/media/webhook | Verify SFU signature and reconcile arriving/leaving participant authority |
| /v1/calls/* | Scoped private-call signaling and media authorization |
| /v1/music/:channelId | Authenticated control/snapshot gateway, not direct worker authority |
| /v1/music/internal/lease | Private authenticated worker lease refresh |
| /health | Process health response; not comprehensive dependency acceptance |

Permissions use current upstream identity/channel/server/member context and role/override policy. Internal worker shared secrets are not public API keys and must not enter docs/examples/logs.

## Activity protocol
GET /v1/rooms/:roomId/activity supports afterRevision and bounded waitMs long-polling.
POST /v1/rooms/:roomId/activity/commands accepts:
```json
{
  "protocolVersion": 1,
  "commandId": "550e8400-e29b-41d4-a716-446655440000",
  "expectedRevision": 0,
  "command": {"type": "join"}
}
```
This is a schema example, not an authenticated invocation.

Current room authority is checked before reads/mutations and again after a long poll wakes. Explicit REVISION_CONFLICT is separate from uncertain transport failure. Repeated identical receipts prevent duplicate commands; changed payload under the same ID is rejected.
Response projections hide another player’s unrevealed hand/deck. Shared source metadata is validated to exclude personal credentials/URLs. Storage uses one authoritative process; multiple replicas need a deliberately designed distributed authority.

## Agent interface
Status/capabilities, own connections, scoped tasks/cancel/approval/reconciliation, artifact access, explicit memory and reminders are separate resource families. Authentication grants bind user/rooms/canManage, and operation policies bind external scopes.
Capabilities derive from configured execution policy/accounts. A connected local model record is not sufficient to prove external CLI/provider availability.

## Error contracts and lifecycle
Public categories include AUTH_REQUIRED, access/session failures, INVALID_INPUT/INVALID_COMMAND, explicit revision conflicts, rate limits and unavailable transport/provider/service.
Renderer should expose useful bounded reasons/retry rather than secret-bearing raw network errors. Operator diagnostics need a separate sanitized signal.
Health endpoints can return success while an individual dependency/provider is broken. Room occupants, call state, model availability and source decoding require their own evidence.

## Source of truth
Typed schemas: packages/shared-contracts, social-domain, activity-protocol, agent-contracts.
Native handlers: apps/desktop/electron/community.ts, providers.ts, agent.ts, main.ts and preload.ts.
Server routes: apps/services/access/server.ts + dm-calls.ts/music-gateway.ts; activities/server.ts; agent/server.ts; music/start.ts.
Consult the audited implementation branch for newest music/Sparkle files; documentation-only merges do not move product code.
