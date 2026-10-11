# S68 community management UI

Source delivered 2026-10-10. Owned only CommunityManagementSurface.tsx, reference-community-management.css and this report. Read BRIEF, master prompt (full sections across reads), both visual-reference source files, authoritative COMMUNITY_MANAGEMENT_NATIVE_REPORT and domain/bridge contracts, assistant.js S68 and assistant.css settings/table/modal measurements, relevant handoff records. All eight immutable originals were individually opened at readable scale before implementation.

## Export / root integration
Default and named `CommunityManagementSurface` accepts optional typed bridge `{communityManagement,setMemberRoles,removeCommunityMember,subscribeInvalidation?}`. Native social bridge fallback uses only these actual methods. Root Settings owns entry/navigation/frame. Pass onBack, onChannelPermissions and optional onCreateInvite to existing authorized broker flow. Missing navigation is precisely disabled. onCreateInvite does not imply configurable expiry/use/role assignment or invite list/revoke capability.

Wrapper reads current normalized identity/activeSpaceId/serverUrl/status. A keyed inner scope clears account/space/connection roster and drafts synchronously during rendering, before effects. Native response applies only to same current account+space+server, same request generation, connected status and matching returned spaceId. Unmount invalidates outstanding responses. Reload clears roster/menu/dialog/roles first. All operations await actual fresh native projection; no optimistic role/removal changes or fake success notice.

Root should map content-free SOCIAL_REFRESH, relevant SERVER_ROLE/MEMBER gateway invalidation/session events into `subscribeInvalidation`. Existing rooms:channel-access-invalidated also clears/reloads. Do not pass a subscribe callback that fires continuously on every snapshot render. Memoize optional bridge/fixture objects to avoid unnecessary reads. Wrapper alone protects identity/space/status changes; event callback is required to promptly invalidate authority when membership/role changes without navigation.

DEV fixture boundary accepts only root-supplied `{snapshot,tab?,dialog?:role|remove,memberId?}`. It is used solely under import.meta.env.DEV + explicit fixture URL. Any explicit fixture URL blocks native management reads and writes before dispatch, even if fixture projection is absent; absent projection shows precise unavailable state. Projection is read-only and visibly labelled DEMO. Role/removal modals can display existing sample data but commit stays disabled; no production synthetic identities embedded.

## Per-state mapping
- default: real member search/count/status/name/avatar, native roles, per-target action menu, role summary. Owner label uses actual normalized ownerId; role hierarchy/capabilities exclusively native. Unknown status remains unknown; custom public statusText is not manufactured activity/presence. Summary counts actual assignments; no invented moderator policy.
- role: actual multiple-role assignment checkboxes instead of reference single-role mock selector, preserving complete supported upstream role arrays. Target canAssignRoles and global assignRoles both required. Added roles require native assignable. Protected existing roles remain preserved; permitted own original roles can deliberately be removed, and locally restoring original choice does not add a new role. Roles absent from current role definitions remain in payload. Exact channel/assistant permission effect is not projected: dialog says it is unavailable, rather than asserting prototype policy. Error remains in modal; only native return applies new snapshot.
- remove: actual member confirmation, both target canRemove and kickMembers required, self guarded. Successful fresh native roster alone removes row. No fabricated requirement for a new invitation, since rejoin may use an existing valid broker invitation.
- permission: actual denied/missing projection, no roster or roles; illustrated denied icon and back/refresh controls. Missing identity/space/offline, loading and real errors have precise states.
- invites: actual broker unsupported reason. No fabricated empty invite list/count, codes, usage, creator, expiry or revocation success. Cancellation button disabled with exact internal missing capability.
- invite/invite_created: only optional navigation to existing broker invitation creator. Configurable expiry/use/join role and integrated ready modal are internally unfinished; no fake ticket or success rendered.
- revoke: unsupported broker list/revoke, precise disabled control; no raw upstream secret passed to renderer.

## Source evidence / limitations
No tests/typecheck/build/captures run by this implementer; root owns integrated checks. Source inspection confirms fixture guard before all native reads/writes, epoch checks and fresh result application. All eight records remain NEEDS_RECHECK or mapped internal gaps, not VERIFIED. Scope is actual component source; shell/sidebar/header/voice geometry is root integration. Windows remains unvalidated here.

The new reference PNGs determine appearance; older broad glass brief informs accessibility/lifetime boundaries. Product copy stays utilitarian. Deliberate fidelity differences reflect actual service contracts (multiple roles, unknown role effect, missing broker administration), not fabricated support. Existing native focused tests in COMMUNITY_MANAGEMENT_NATIVE_REPORT are local protocol evidence, not this UI acceptance.

## Original review paths
- S68/default: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management.png
- S68/role: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__role.png
- S68/remove: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__remove.png
- S68/permission: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__permission.png
- S68/invites: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__invites.png
- S68/invite: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__invite.png
- S68/invite_created: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__invite_created.png
- S68/revoke: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management__revoke.png

## Appendix: exact development projections
Delivered `apps/desktop/src/dev/community-management-fixture.ts` as a pure development-only export. Both getters reject non-development execution; exact known variants are validated and unknown variants throw rather than falling back to another screen. No runtime installation, native bridge access, broker writes, account changes, stores, bootstrap or router modifications occur in this module. Root owns the isolated S19 common shell installation and memoized component props. Existing component explicit fixture guard independently prevents all native management reads/writes and labels the screen DEMO.

`getCommunityManagementFixtureMetadata(variant)` returns screenId S68, exact variant, integration_status LOCAL_FIXTURE, demo label, renderable, unsupportedReason, exact immutable originalPath, spaceId, ownerId and original-avatar public paths. LOCAL_FIXTURE is a source/data classification, not visual verification or successful integration. `getCommunityManagementFixture(variant)` returns a newly allocated typed CommunityManagementFixture on each call; no shared mutable roster is retained. Fixture identities are demo-deniz/ece/can/zeynep/mert, space demo-bizim-oda. Public statuses and Ece's Cinema’da text are explicitly local examples from the reviewed original. Roles are Moderatör and Üye; target capability examples are sample data only and never replace real native hierarchy validation.

| Exact variant | Read-only projection | Limitation |
| --- | --- | --- |
| default | Five demo members; Ece moderator, three ordinary members, Deniz owner identity metadata | Common DEV space must receive ownerId demo-deniz for existing owner badge. |
| role | Ece role dialog; existing moderator role selected | Actual supported multiple-role UI differs from prototype single selector. No save operation; owner can change local checkbox selection for capture. |
| remove | Mert removal confirmation | Confirmation commit stays disabled; no roster mutation or fake success. |
| permission | Denied snapshot with all capabilities false and no members/roles | No hidden roster leaked into denied fixture. |
| invites | Existing honest unavailable broker tab | renderable true but unsupportedReason identifies unmatched reference invitation rows. No fabricated active list, counts, codes or expiry. |
| invite | Getter throws; metadata renderable false | Expiry/usage/joining-role configuration requires unfinished broker capability. |
| invite_created | Getter throws; metadata renderable false | No actual broker operation/ticket; fake created-success state forbidden. |
| revoke | Getter throws; metadata renderable false | Authorized broker list/revoke capability unfinished. |

Avatar metadata resolves the existing `getReferenceAvatar` mapping to `/__reference/01_brand/avatar-{deniz,ece,can,zeynep,mert}.svg`; it does not duplicate or alter original artwork. Snapshot user.avatar stays null, avoiding a fabricated native avatar origin. CommunityManagementSurface currently uses its own MemberAvatar plus shared @rooms/design Avatar fallback and accepts only safe HTTP(S) native avatar URLs; it does not use root VoiceAvatar's DEV source mapping. Exact original avatars therefore require root to connect an explicitly DEV-only local artwork boundary. This fixture file does not alter that component. The common S19 fixture space currently has no ownerId, another root integration item; metadata supplies the exact local owner identity rather than silently changing shared state.

All eight original paths remain the paths listed above, already individually reviewed before UI implementation. No additional screenshots, tests, typechecks, builds or visual certification were run for this appendix. Root integration and visual recheck remain pending; unsupported broker operations are internal implementation gaps, not permanent external prerequisites.
