# Data, state and persistence
## Ownership map
| Data | Authority/store | Client copy | Important limit |
|---|---|---|---|
| Account/profile/relationships/membership | Upstream Stoat/MongoDB | Normalized UI state | Native encrypted session is not an account database |
| Messages/read state | Upstream social data/gateway | Hot conversation cache + bounded encrypted account/server cache | Cached state must be purged on logout/revocation |
| Uploaded objects | Autumn/MinIO + metadata/configuration | Safe attachment metadata/opaque selection | Data restoration needs object bytes AND compatible metadata/keys |
| Activity timeline/polls/board/receipts | rooms_activity_state PostgreSQL JSONB | Observed room/query state | Single authoritative writer |
| Active game state | Activity server private snapshot | Per-user projection only | Hidden deck/hands must stay server-side |
| Public game results/history | Activity persisted archives/results | Authorized history UI | Old snapshots/schema compatibility require review |
| Voice/presenter/call state | SFU + broker ephemeral grants/leases | Actual media runtime/track state | Service restart is not durable call preservation |
| Music queue/source state | Worker memory/bounded cache | Public queue metadata | Worker restart can lose queue; no persistence claim |
| Provider connections/history | Native encrypted personal vault/local history | Opaque playback handle/metadata | No distribution to room or Agent |
| Agent tasks/models/operations | Separate encrypted repository/model homes | Scoped list/detail/artifact metadata | Separate keys/backups and side-effect journals |
| Appearance/devices/notifications/window bounds | Local preferences | Zustand/runtime state | Some native editors have independent save semantics |
| Update state/artifacts | Native update prefs + signed feed | About/update status | Feed is not application data backup |

## Activity persistence
PostgresActivityRepository creates rooms_activity_state(room_id text primary key, state jsonb, updated_at). It loads/saves the serialized room object; room command serialization belongs to the service.
FileActivityRepository persists an atomically replaced development file; MemoryActivityRepository is fixture/test-only. One process owns authority. A database connection alone cannot coordinate concurrent independent writers.
Revisions/receipts survive durable save/reload. Lease/participant recovery and application schema compatibility still need exact acceptance. A successful poll test is not proof every older game/media snapshot upgrades safely.

## Client-cache lifecycle
Hot caches reduce visible blank refreshes. Disk message caches contain bounded text/author labels while avoiding transient attachment/avatar URLs. OS encryption must be available before persistence.
Cache keys include account/server; access/identity epochs fence asynchronous reads. Invalidation must clear visible state and stop delayed responses from restoring revoked data.
Local cache data cannot authorize server actions. A stale user label/read marker is not proof of current membership or presence.

## Files and personal media
Native file choice gives an opaque local capability. Caption/playlist/export inputs use bounded formats and explicit selection. No arbitrary renderer filesystem access is intended.
Provider connections and viewing history are personal. Sharing safe title/reference/timeline does not share provider URL, credentials, device authorization or subscription entitlement.

## Backup and recovery
Core backups combine social Mongo dump, Activity PostgreSQL dump, uploads/object configuration, service/config snapshots and certificates. Authoritative writers are briefly stopped for consistency, then resumed even when backup work fails.
Archives are encrypted with an off-host-controlled recipient; temporary plaintext staging is removed. Daily scheduling/retention and off-host copies are operational responsibilities. A file existing is not sufficient: rehearse isolated DB + actual object-read recovery.
Agent state is separate and needs its own encryption-key/state recovery process. Desktop/provider data also has separate lifetime; server recovery does not reconstruct a private selected file.

## Public-release obligations
Document what is collected, where it resides, retention/deletion/export handling, server administrator trust and backup expiry. No E2EE claim is made.
Public privacy policy or a complete end-to-end account deletion/export process was not established by the initial audit. These are release work, not assumed features.
Schema migrations/old-state compatibility, object-byte validation, restore time and recovery point must be recorded against the release. Do not reset production data to make a migration test pass.
