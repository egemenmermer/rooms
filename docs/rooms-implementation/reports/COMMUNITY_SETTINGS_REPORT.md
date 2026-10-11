# S16–S18 and S68–S69 community surfaces

## Scope and original review

All 22 assigned original PNGs were opened individually at readable scale with view_image. Exact inventory names are authoritative: S16 is the notification feed, S17 community editor, S18 channel editor, S68 members/roles/invites, S69 channel permissions. Original reference sources remain immutable; no screenshot/prototype is shipped. BRIEF, DECISIONS, CHECKPOINT, production ChannelTools, RoomMembers, social-domain contracts, native validation, Stoat channel/invite adapter and social.js/assistant.js/styles were read. F11 authorization/access-revocation flow was read; its prototype expressly does not implement Stoat authorization.

- `S16/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S16_notifications.png`
- `S16/empty`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S16_notifications__empty.png`
- `S17/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S17_community_editor.png`
- `S17/created`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S17_community_editor__created.png`
- `S17/edit`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S17_community_editor__edit.png`
- `S18/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S18_channel_editor.png`
- `S18/delete`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S18_channel_editor__delete.png`
- `S18/private`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S18_channel_editor__private.png`
- `S18/voice`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S18_channel_editor__voice.png`
- `S68/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management.png`
- `S68/invite`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__invite.png`
- `S68/invite_created`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__invite_created.png`
- `S68/invites`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__invites.png`
- `S68/permission`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__permission.png`
- `S68/remove`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__remove.png`
- `S68/revoke`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__revoke.png`
- `S68/role`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__role.png`
- `S69/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S69_channel_permissions.png`
- `S69/changed`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S69_channel_permissions__changed.png`
- `S69/denied`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S69_channel_permissions__denied.png`
- `S69/member`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S69_channel_permissions__member.png`
- `S69/removed`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S69_channel_permissions__removed.png`

## Owned files and exported integration boundary

Only apps/desktop/src/CommunitySettings.tsx, apps/desktop/src/reference-community-settings.css and this report changed. No App/Settings/RealSocial/VoiceSidebar/native/store/service/protocol/Games file changed. All components are route/query-neutral. Root owns entry wiring, native operations, refresh, authorized projections and fixtures.

- CommunityEditor(CommunityEditorProps): create/edit mode, actual optional SocialSpace, description, verified inviteOnly policy, canEdit; optional onSave(name) returns authoritative SocialSpace; onClose/onSaved. Created screen appears only after successful operation. Current name-only callback is deliberately separate from future icon/description/privacy contract.
- ChannelEditor(ChannelEditorProps): create/rename/delete, actual space/channel/initialType, canManage; onCreate(spaceId,name,text|voice), onRename(id,name), onDelete(id) reuse existing typed native operations; onSaved(channel|null) and onClose. Root should provide callbacks that refetch channels and perform existing voice-name/delete cleanup, preserving ChannelTools behavior.
- CommunityManagement(CommunityManagementProps): authorized access allowed/denied/unknown, actual space/members/selfId, optional named roles and authorized invite list, loading/error, members/invites initial tab, actual invite channel/server URL; optional async create/revoke invite/setRoles/removeMember/refresh callbacks, permissions/return navigation callbacks.
- ChannelPermissions(ChannelPermissionsProps): actual channel, allowed/denied/removed/unknown access, ChannelPermissionSnapshot, optional canEdit/onSave returning authoritative snapshot, subject selection, edit/add-member/return/community-info callbacks. Subject permission values are typed deny/inherit/allow for view/send/files/manageMessages/manageChannel.
- ChannelAccessState: community-denied/denied/removed, real return/community-info callbacks; actual voiceConnected/voiceRoomName may show independent live voice status. No channel name, member list, message or preview is rendered on denied/removed.
- NotificationSurface(NotificationSurfaceProps): supplied actual notification items, loading/unavailable reason, scoped onMarkAllRead(ids), actual item action callbacks. Types cover mention/invite/activity/agent/friend without generating any of them.

No component directly reads native account data or invokes native APIs. Production data and operations must be supplied through root's adapter boundary. Explicit DEV fixture query or fixture prop blocks all account mutation callbacks before invocation, including notification read changes. Fixtures can supply read-only data and navigation callbacks; no spoofed save/create/revoke/role success.

## Per-state implementation and limitations

S16/default: reference heading/tabs/notification rows and actual supplied unread count, timestamps, identity, target actions, mention/invite filtering. Mark-all read applies only supplied unread IDs through real callback and updates after success. Callback failure shows actual error. Missing global feed/read scope is shown as unavailable; no invented activity/task notifications. S16/empty: real supplied empty list; a missing source produces a different unavailable state, avoiding a claim that all notifications were read.

S17/default/edit: reference 530px modal, name form, icon position, description field and policy card. Name form is stateful/validated; submit stays disabled with precise reason until actual callback/capability exists. Icon selection and description edit remain disabled because secure native support is absent. Invite-only presentation appears only for verified supplied policy; unknown policy is not called private. S17/created: only actual successful create callback result names the created community; duplicate creation action is removed. No prototype sample community name or success is shipped. Community create/rename/icon/description/privacy API additions are unfinished.

S18/default/voice: 600px create/rename modal, real text/voice selection, actual channel name/topic, native-compatible 1–32 name validation/no control characters, required input, busy/error/Enter submit. Current create/rename callbacks preserve exact existing APIs. Type conversion is disabled in rename because native operation renames only. Topic/category/private settings show missing native capability; no false save. S18/delete: 470px destructive confirmation for actual channel, actual delete callback and errors; copy correctly describes voice cleanup for the deleted voice channel rather than promising every voice connection survives. S18/private: private-policy toggle displays unknown and disabled; exact private membership selection remains unfinished until native ACL projection exists, never creating a publicly visible channel while claiming it private.

S68/default: authorized normalized actual membership table, search, exact ownerId badge, supplied named role labels, real status/statusText and derived known-online count. Unknown presence remains unknown. Role IDs without definitions are not mislabeled moderator and no role policy is inferred. Role summary uses only supplied descriptions. S68/permission: actual denied access shows management denial without exposing administrative data; unknown capability has a separate unavailable state.
S68/invite: real existing createInvite callback can be supplied; duration/use/automatic-role options are disabled because current native command accepts channelId only. Broker decides expiry/use policy. S68/invite_created: authoritative result code and expiry only, actual rooms://invite server/code link, successful clipboard feedback and clipboard-failure reason; absent usage metadata remains absent. S68/invites: supplied authoritative list; unavailable list is distinguished from empty list. No synthetic creator/use/expiry records.
S68/revoke: actual-code confirmation, native callback required, errors retained, authoritative refetch requested. S68/role: actual member/current role IDs and supplied role options, stateful multi-selection, real callback required. No invented moderator access consequences; effective access preview absent is stated. S68/remove: actual member confirmation and callback; cannot remove actual owner via this view. Missing native removal/role/revoke actions remain precisely disabled. Modal state is scoped to space identity, and stale async completions are discarded.

S69/default/member: reference channel strip, private control and 180px subject rail; supplied authoritative role/member permission values, stateful tri-state draft, dirty save, pending/error state and authoritative saved snapshot. Unknown values have no invented selected state. Missing snapshots or save capability disable controls with precise reasons. Channel-ID mismatch renders a neutral loading state instead of an old channel's private subjects.
S69/changed: only successful real save response shows generic saved acknowledgement. It does not claim another user's preview was revoked without a gateway/runtime effect. F11 cross-client live access invalidation remains a shared native/store integration TODO.
S69/denied/removed: guarded return surfaces omit private channel name, member list and messages even if stale props contain them. Voice-preserved notice is shown only when actual voiceConnected is supplied. Component sends no voice command.

## Additive native contract requests

1. Community create and authorized update: name, description, icon upload capability/preview/removal, visibility/discoverability/invite policy. Preserve native file validation/upload and upstream owner/admin authorization.
2. Channel update: topic, category metadata/order, type conversion support if intended, private/default permission policy. Never implement a privacy toggle by name-only channel creation.
3. Authorized management capability projection: owner and effective native manage-community/manage-channels/manage-members/manage-invites flags, named role definitions/descriptions, role hierarchy and own/owner mutation constraints.
4. Typed member role mutation/removal with authoritative membership response and effective-access consequences; role IDs are not inferred authorization.
5. Broker invite list/create options/revoke: expiry, max use, usage, creator and assigned-role policy. Existing channel-only createInvite can be reused immediately; absent deployed broker is an independent external integration prerequisite, while missing renderer/native list/revoke interfaces are internal TODOs.
6. Channel ACL read/write: subject kind/id, deny/inherit/allow values, private policy, revision/concurrency, effective access projection and gateway invalidation. Return typed authorization errors and strip revoked channel content/state server-side and renderer-side; hiding this management view is not security enforcement.
7. Notification projection and read scope: actual authorized global notifications versus bounded loaded message mentions, invites/friend requests, Activity/Agent events, paging/read IDs and real target context. Current SocialReadState mention IDs can seed scoped notifications, but cannot be advertised as complete global feed.
8. Root routes/settings/sidebar/modal entry wiring, native refresh/voice cleanup and DEV-only read-only data fixtures. Root must clear old membership/invite props on space changes.

## Evidence and gates

Original visual review and code/flow inspection completed. No automated tests, typecheck, build, screenshots, remote mutations or acceptance scenario was run by this agent. Root controls integrated checks; none of these entries is visually verified. Original modal geometry, membership table, tri-state matrix, empty/denial states and narrow layouts require integrated captures and manual acceptance. Unsupported native management/notification interfaces are unfinished implementation, not permanent external blockers. Stoat/broker availability, actual authorized account and deployed cross-client access revocation are separate external integration/acceptance gates.
