# S69 / F11 native channel authorization — 2026-10-10

## Reference and scope

Read BRIEF, CHECKPOINT, DECISIONS, COMMUNITY_SETTINGS_REPORT and full F11 journey. Individually opened immutable originals S69_channel_permissions.png and __changed, __denied, __member, __removed. Implemented scoped native/domain/adapter work only; root owns renderer/preload/shared-index integration. No production service was contacted or changed. This is not visual or deployed cross-client acceptance.

Owned changes: packages/social-domain/src/index.ts additive types; packages/stoat-adapter/src/index.ts ACL read/write and invalidation; apps/desktop/electron/community.ts named ACL IPC and content-free event forwarding. Existing createSpace/renameSpace, typed presence, typing, DM call handlers and fixture guards preserved. New tests/stoat-channel-permissions.test.ts.

## Verified upstream contract

Deployment manifest pins unmodified Stoat v0.15.5. Primary source reviewed:

- [Default channel permission route](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/channels/permissions_set_default.rs): PUT /channels/:id/permissions/default, body {permissions:{allow,deny}} for server TextChannel, current ManagePermissions and grant-limit enforcement.
- [Role channel permission route](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/channels/permissions_set.rs): PUT /channels/:id/permissions/:roleId, same body; current ManagePermissions, existing role, target rank and grant limits enforced upstream; true server owner bypasses target rank check.
- [Permission algorithm](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/permissions/src/impl.rs) and [database query](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/database/src/util/permissions.rs): base server value, channel default override, ascending authority server role overrides, then channel role overrides; each allows then denies. Timeout restricts to view/history; absent ViewChannel clears all permissions. Owner/privileged bypass is explicit; there is no invented Discord administrator bit.
- [Bit and override definitions](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/permissions/src/models/channel.rs) and [signed stored fields](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/permissions/src/models/server.rs): stored {a,d}, write {allow,deny}; safe lower 52 bits retained using BigInt rather than JavaScript 32-bit operators.

No member-specific channel override endpoint or revision/CAS exists in this pinned route contract. S69/member must remain precisely unsupported. Default view denial alone is not a promise that only explicitly listed channel roles can enter: server role allows apply after the channel default in this version. Do not label defaultViewDenied as a complete privacy policy. Upstream hash-map iteration does not provide a reproducible equal-rank tie-breaker. Native projection conservatively combines equal-rank denies, matching the local grant service: it may understate access in a tied conflict but does not advertise an ambiguous allowance. Upstream mutations remain authoritative.

## Exact integration boundary

Domain exports SocialPermissionValue, SocialChannelPermissionKey, SocialPermissionValues, SocialChannelPermissionSubject, SocialChannelPermissions, SocialChannelPermissionChange and SocialChannelAccessInvalidation.

- `channelPermissions(channelId): Promise<SocialChannelPermissions>` via `rooms:social-channel-permissions(channelId)`.
- `setChannelPermissions(change): Promise<SocialChannelPermissions>` via `rooms:social-set-channel-permissions(change)`.
- Change: `{channelId,subject:{kind:'default'|'role',id},values:{view,send,files,manageMessages,manageChannel}}`; each value deny/inherit/allow. Default subject ID must be `default`.
- Snapshot: channelId, spaceId, access allowed/denied/missing/unsupported, effective five booleans plus managePermissions/readHistory, subjects, defaultViewDenied, memberOverridesSupported:false, concurrency:'last-write-wins'. Subjects are returned only to managers, with actual role names and editable hierarchy projection. Snapshot never includes a channel title, message, token or member list.
- Denied/missing return spaceId:null, no subjects, all permissions false. Missing means unavailable/possibly deleted, not proof of physical deletion. Non-server channel ACL management is unsupported.

Save writes exactly one subject, first rereads its current full bit field and preserves unrelated flags. Strict native schema excludes member kind, arbitrary permission names and extra fields. Upstream executes the real authorization again even if the displayed capability became stale. No local success is manufactured after 403/NotElevated. Refetch after success can legitimately return denied if the actor revoked their own access. No transaction or revision is invented; concurrent changes to the same subject remain upstream last-write-wins, including read/modify/write of unrelated flags. UI should save one selected subject, refresh afterward and explain that another manager's concurrent save can replace it.

## Revocation and lifecycle

`CHANNEL_ACCESS_INVALIDATED` contains only `{channelIds,reason:'permissions-changed'|'removed'|'membership-changed'}`. Channel updates/deletes, server role updates/deletes, member updates/leaves, server changes/deletion trigger it before later message processing. Adapter discards cached messages; native boundary discards pending attachment capabilities for those channels. Invalidated gateway messages must successfully reauthorize before being normalized/emitted; typing previews are suppressed meanwhile. Repeated denied reads do not recursively re-emit an invalidation loop. Channel listing tolerates upstream 403/404 for a subset rather than failing all visible channels.

Root must immediately clear all matching renderer message/title/subject/search/typing/preview caches, invalidate pending async results, and show a neutral state until fresh authorization. Root must also apply this to account changes and Ready/reconnect. No source payload is included in the invalidation. This implementation makes no voice command: a separate authorized voice connection is independent of text channel visibility. It does not promise continued authorization if the voice room itself is revoked; existing service authorization remains responsible for that.

Native responses are discarded if client/account identity changed. Adapter ACL reads carry invalidation epoch, and all queued REST responses now carry a session epoch: native disconnect invalidates queued/in-flight results even if the token string was retained. No new token or persistent ACL storage enters the renderer. Successful mutation is not evidence that a named other account was actually revoked; S69/changed must use generic saved acknowledgement unless that other client's actual event/authorization result is verified.

## Local evidence and remaining gates

First targeted ACL fixtures: 7/7 passed at 14:14:11. Adapter plus ACL fixtures: 26/26 passed at 14:15:00. Final run after idempotent invalidation/session-epoch/signed-field changes: `pnpm exec vitest run --config vitest.config.ts tests/stoat-channel-permissions.test.ts tests/stoat-adapter.test.ts tests/dm-calls.test.ts --maxWorkers=1` passed 35/35 at 14:15:40 local (9 ACL, 19 adapter, 7 DM).

Tests exercise actual adapter requests against local fetch protocol fixtures: pinned ordering, owner bypass, timeout/view gating, preserved high/signed bits, default and role routes, unsupported member rejection before network, actual upstream 403 propagation, content-free denied results/cache removal, gateway revocation before later private previews, account/disconnect stale result rejection and repeated denial without event loops. Existing create/rename space and DM authorization fixture tests run alongside this change. They do not prove live deployed Stoat event delivery or two-account F11 acceptance.

No integrated typecheck/build was run by this agent while parallel renderer ownership was active. Root owns those checks and actual UI wiring. Remaining acceptance: real upstream two-account role/default edit and revocation transport, renderer cache redaction, concurrent manager overwrite behavior, S69 visual captures, real independent voice continuity and physical platform acceptance. Exact member-overrides reference remains unsupported by the chosen pinned upstream, not a hidden local simulation.


## Follow-up grant authority audit

The access service already applied channel defaults before server roles; that ordering was retained and explicitly tested. Equal-ranked overrides intentionally combine denies because serialized role order cannot reproduce upstream internal HashMap order. This conservative difference can deny a conflicting same-rank permission upstream happens to allow. Assign distinct ranks to remove ambiguity. Native capability projection now uses the same conservative tie handling, fixing its prior potential overstatement and the TypeScript rank inference error.

`apps/services/access/stoat-permissions.ts` now requires a server TextChannel and exact server/member/user scope; rejects malformed role collections, timeouts, moderation flags and unsafe/noncanonical permission numbers. Permission parsing errors are typed StoatError 403 so the existing SFU sweep treats invalid authorization as denial and removes an old grant rather than retaining it as a transient network failure. Existing owner bypass is retained only after exact membership/scope gates. This local grant service intentionally does not infer privileged global account status from a member field or normalized user; that unavailable status yields conservative regular membership rules, not a new administrator bypass. Pinned upstream may allow its own privileged administrator where the local gate denies. The upstream server still validates credentials; no social authentication backend was replaced.

Native direct channel GET 403/404 now emits the same content-free invalidation without waiting for websocket delivery. Late message normalization refuses a still-invalidated channel. Native subject editable remains an informational hierarchy projection; current upstream role rank/grant limits always decide the actual mutation. A true owner is distinct from a role named administrator.

Follow-up local checks: 41/41 adapter/ACL/access-permission fixtures passed at 14:19:03. After direct REST denial and late-preview coverage, 24/24 ACL/access fixtures passed at 14:19:34. Typed-denial run at 14:20:20 passed 25/25; final malformed nested-override run at 14:21:06 passed 14/14 (`tests/stoat-permissions.test.ts`). No production connection or integrated compiler was run by this agent.
