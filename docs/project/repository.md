# Repository guide and extension rules
## Where to look
| Path | What it owns |
|---|---|
| apps/desktop/src/App.tsx and main.tsx | Route shell, persistent runtime placement, renderer bootstrap/fatal boundary |
| apps/desktop/src/community.ts | Normalized renderer community/session/channel coordination |
| apps/desktop/src/realtime.ts, activity.ts | Route-independent media state and observed authoritative Activity state |
| apps/desktop/src/RealSocial.tsx, SocialSurfaces, FriendsPage | Actual conversation/social/voice surfaces |
| apps/desktop/src/Settings.tsx, About.tsx | Preferences/account/settings/diagnostic/update UI |
| apps/desktop/electron/main.ts, preload.ts | Native window, trusted IPC and exposed typed bridge |
| apps/desktop/electron/community.ts | Session/social/permission/device/source integration and native credential boundary |
| apps/desktop/electron/providers.ts | Personal provider vault/network/playback capabilities |
| apps/desktop/electron/agent.ts | Scoped separate-host Agent connection boundary |
| apps/desktop/electron/updates.ts; native/sparkle.mm | Current signed Mac native update integration |
| apps/services/access | Real auth, invite ledger, permission/media/presenter/private-call/music grant |
| apps/services/activities | Serialized room authority/repositories/game integration/player wrapper |
| apps/services/music | Bounded queue, source resolver and SFU audio publisher |
| apps/services/agent | Encrypted tasks/journals/connectors/workers/scheduler/bot delivery |
| packages/social-domain and stoat-adapter | Provider-neutral social contracts and official upstream translation |
| packages/shared-contracts, activity-protocol, agent-contracts | Strict cross-boundary types/schemas |
| packages/media-providers | Replaceable LiveKit implementation and device/capture lifecycle |
| packages/games | Authoritative rules/seats/cards/hidden projections |
| packages/personal-media, media-providers | Native-facing parsing/network/media capability helpers |
| scripts | Build/packaging/provisioning and scoped verification harnesses |
| infra/stoat, production, agent | Pinned setup, private generated deployment, backups/recovery, separate Agent kit |
| tests | Unit/component/protocol/loopback service and native desktop checks |
| docs/project | Current explanatory handbook, safe public publication allowlist |
| docs/release | Private readiness/issue/QA/scope/roadmap/gate evidence |
| docs/rooms-implementation | Design inventory, decisions and dated implementation/acceptance checkpoints |
| docs/screenshots, infra/production/*RESULTS.json | Historical scoped visual/transport/operation evidence |

Newest modules may exist only on the documented reference implementation branch. Historical names/remaining files do not establish active usage.

## Extending a feature
Begin at the actual user journey. Identify renderer/native/server authority and the data owner. Change typed contract/schema alongside implementation and scoped error/cancel/cleanup.
A renderer toggle cannot grant server permission. A server route without a connected surface is not a finished user feature. Preserve old-account/channel invalidation and cleanup after navigation/logout/revocation.
Test the strongest relevant boundary: schema/projection, native sender/file/network authority, actual scoped backend, then physical devices or external provider where needed.

## Adding an Activity
Specify validated commands/state and per-user projection; use expectedRevision/idempotent command identity. Decide primary/coexisting lifecycle and persist compatible data.
Do not leave voice when an Activity ends. Do not accept personal URLs/tokens in shared metadata. Protect hidden game state. Enforce one writer until a real distributed design exists.

## Adding a provider or Agent operation
Providers remain native/private and need permitted source use, failure states and actual account/codec tests. No sharing credentials or rebroadcast right assumptions.
Agent actions need explicit resources, operation journal, cancellation/approval/reconciliation and separately tested host/egress. Do not attach the desktop/core datastore to workers to make an integration “work.”

## Changing deployment or release
Record source/image/config/schema/artifact provenance. Inspect existing state; avoid blind fresh bootstrap. Back up first for stateful changes and keep a compatible previous version.
Documentation static deployment is narrow: allowlisted generated HTML/assets under /docs; no app/server secrets or database snapshots.
Keep legacy Spacebar/demo evidence clearly historical and DEV fixtures unavailable as production data.
