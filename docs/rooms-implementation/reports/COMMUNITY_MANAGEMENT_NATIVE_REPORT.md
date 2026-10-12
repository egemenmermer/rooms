# S68 native community management

Implemented 2026-10-10. Scope: bounded additions to social-domain contracts, Stoat adapter, native community IPC, and focused protocol fixtures. No backend fork, renderer changes, credential access, production calls or remote mutation.

## Reviewed references and upstream evidence

Individually opened all eight immutable S68 originals: default, role, remove, invites, invite, invite_created, revoke, permission. Read `COMMUNITY_SETTINGS_REPORT.md`, current `CommunitySettings.tsx` operation props, native community/fixture boundary, existing account invitation broker, and pinned v0.15.5 source. Cached official source reads in `.local/design-review/stoat-management-source`.

- [Fetch server](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/servers/server_fetch.rs) and [fetch members](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/servers/member_fetch_all.rs) require upstream membership. Role definitions are included in the actual server response.
- [Edit member](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/servers/member_edit.rs): PATCH `/servers/:serverId/members/:memberId`, `{roles: string[]}`. Upstream checks AssignRoles, other-member hierarchy, and every newly added role's hierarchy/existence. Existing own-role removal is allowed by upstream.
- [Remove member](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/servers/member_remove.rs): DELETE same member path. Upstream rejects self/owner removal and requires KickMembers plus strict target hierarchy.
- [Server permissions](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/permissions/src/impl.rs), [permission bits](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/permissions/src/models/channel.rs), [query/rank behavior](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/database/src/util/permissions.rs), and [member rank](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/database/src/models/server_members/model.rs) define actual authority. No invented administrator bit.
- [List invites](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/servers/invites_fetch.rs) requires ManageServer; [delete invite](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/invites/invite_delete.rs) allows creator or ManageServer. These are upstream community invites, not ROOMS account invitation tickets. The [invite model](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/models/src/v0/channel_invites.rs) has code/server/channel/creator, with no expiry/use fields.

## Integration contract

Types in `packages/social-domain/src/index.ts`:

```ts
interface SocialCommunityRole {id:string;name:string;rank:number;assignable:boolean}
interface SocialManagedMember extends SocialMember {canAssignRoles:boolean;canRemove:boolean}
interface SocialCommunityManagement {
  spaceId:string;
  access:'allowed'|'denied'|'missing';
  capabilities:{manageServer:boolean;manageChannels:boolean;manageRoles:boolean;
    managePermissions:boolean;assignRoles:boolean;kickMembers:boolean};
  roles:SocialCommunityRole[];
  members:SocialManagedMember[];
  invites:{source:'rooms-broker';state:'unsupported';managementSupported:false;reason:string};
  concurrency:'last-write-wins';
}
interface SocialMemberRoleChange {spaceId:string;userId:string;roleIds:string[]}
interface SocialMemberRemoval {spaceId:string;userId:string}
```

Native IPC, all returning `Promise<SocialCommunityManagement>`:

- `rooms:social-community-management(spaceId)` → `StoatClient.communityManagement(spaceId)`.
- `rooms:social-set-member-roles({spaceId,userId,roleIds})` → `setCommunityMemberRoles`.
- `rooms:social-remove-community-member({spaceId,userId})` → `removeCommunityMember`.

Root owns shared bridge exports/preload/renderer wrapper. Strict IPC object validation rejects extra fields, invalid IDs, duplicate roles and >1000 roles. Existing trusted sender, development fixture rejection and initiating client/account checks apply. The adapter validates the same identifiers/role bounds independently and refetches after actual upstream success.

## Authority and lifetime behavior

The native adapter reads current self/server/self-membership first. Nonmanagers receive denied with empty role/member arrays; it does not request the full member roster or any invite list for them. A real server management bit (ManageServer, ManageChannel, ManageRole, ManagePermissions, AssignRoles or KickMembers) opens this product management projection. The upstream member endpoint itself is membership-readable; the additional management surface restriction is a deliberate product boundary.

Permissions use server defaults followed by ranked server role overrides. Channel ViewChannel and channel overrides do not control server administration. Timed-out members lose management flags. Owner/actual privileged user bypass follows upstream. Equal-ranked conflicting overrides conservatively deny because upstream hash-map tie order cannot be reproduced. This may understate a grant; it never assumes a more permissive result.

Per-target controls reflect actual strict hierarchy. Self-removal and owner edits/removal are disabled. Owner role-edit prohibition is a conservative product constraint; upstream may permit certain self-owner role edits but this view does not advertise them. Own nonowner role edits remain supported where upstream AssignRoles permits. A role's `assignable` describes adding that role; existing nonassignable roles must be preserved by a renderer unless deliberately removed through a permitted own edit. `canAssignRoles` applies to the target, not every role.

Every mutation refetches current authority and target membership, validates rank/added role IDs, then sends the exact upstream PATCH/DELETE. Upstream independently reauthorizes; 403/NotElevated is never converted into success. There is no fabricated revision/CAS. On success the adapter emits content-free refresh and invalidates cached channel access before returning a fresh authoritative management projection. Member role/removal operations are not optimistic.

Gateway server/role/member changes invalidate in-flight management reads even if no channels are cached. Session changes discard queued/in-flight work; native account identity is checked again before returning to the renderer. Stale requests never apply a projection to another account. Existing gateway refresh lets root clear/reload its administrative UI. No voice operation is added; actual revoked membership may independently revoke authorized media through existing upstream/local access enforcement.

## Invitation boundary

No new upstream invite list/revoke method or IPC was exposed. Raw upstream community invitation codes remain broker-owned and do not reach this management renderer. Existing `createInvite` still returns the broker's public account invitation ticket.

The current broker has creation, inspection and consumption endpoints, but no authorized list/revoke endpoint. `invites.source='rooms-broker'`, `state='unsupported'` and `managementSupported=false` make the exact missing internal capability explicit. Do not render this as an empty list, unlimited use, known expiry or revoked invitation. Future broker administration must preserve account/community ticket coupling and authorization; directly exposing upstream invite secrets would bypass that boundary.

## Focused local verification

At 14:47:15:

`pnpm exec vitest run --config vitest.config.ts tests/stoat-community-management.test.ts tests/stoat-channel-permissions.test.ts tests/stoat-adapter.test.ts`

Result: 3 files, 41 tests passed. Final focused management rerun after post-write session checks: 10/10 passed at 14:47:35.

New cases verify real roles/hierarchy, no secret projection or invite requests, denied/timed-out no-roster fetch, conservative equal-rank denial, exact PATCH/DELETE/refetch, escalation/same-rank/owner/self protection, upstream rejection without success refresh, malformed member failure, and logout/gateway stale response rejection without cached channels. Existing ACL/adapter cases passed. These are local pinned-protocol fixtures, not deployed two-account acceptance. Full build/typecheck and renderer/manual acceptance remain coordinator/owner work.
