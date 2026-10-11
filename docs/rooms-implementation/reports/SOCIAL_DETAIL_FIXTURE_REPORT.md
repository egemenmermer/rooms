# S12–S18 public fixture projections

Status: source delivered; root integration and visual recheck pending. These are explicit LOCAL_FIXTURE projections, not service verification, account authorization or owner acceptance. No build, type check, test, capture or remote operation was run for this delivery. Only `apps/desktop/src/dev/social-detail-fixture.ts` and this report were edited.

## Reference review

All 24 inventoried originals were opened individually with the image viewer at readable scale. PROGRESS.json contains no dedicated responsive records for this group. The prototype `05_prototype/social.js`, `05_prototype/styles.css`, per-screen handoff definitions in `06_handoff/flows.json` and F02 DM/call branches were read. Prototype operations are local simulations, not native capabilities. Original PNG appearance takes priority over earlier clean-slate copy, but unsupported operations remain disabled.

| ID | Variant | Individually reviewed original |
| --- | --- | --- |
| S12 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S12_direct_message.png |
| S12 | blocked | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S12_direct_message__blocked.png |
| S12 | nonfriend | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S12_direct_message__nonfriend.png |
| S13 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S13_search_quick_switch.png |
| S13 | empty | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S13_search_quick_switch__empty.png |
| S13 | files | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S13_search_quick_switch__files.png |
| S13 | quick | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S13_search_quick_switch__quick.png |
| S14 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S14_file_sharing.png |
| S14 | failed | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S14_file_sharing__failed.png |
| S14 | preview | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S14_file_sharing__preview.png |
| S14 | uploading | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S14_file_sharing__uploading.png |
| S15 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S15_user_profile.png |
| S15 | expanded | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S15_user_profile__expanded.png |
| S15 | invisible | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S15_user_profile__invisible.png |
| S15 | status | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S15_user_profile__status.png |
| S16 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S16_notifications.png |
| S16 | empty | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S16_notifications__empty.png |
| S17 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S17_community_editor.png |
| S17 | created | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S17_community_editor__created.png |
| S17 | edit | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S17_community_editor__edit.png |
| S18 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S18_channel_editor.png |
| S18 | delete | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S18_channel_editor__delete.png |
| S18 | private | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S18_channel_editor__private.png |
| S18 | voice | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S18_channel_editor__voice.png |

Reference responsive behavior from styles.css: context panel hidden below 1280px; file grid uses two columns; channel sidebar 216px and community rail 64px below 1100px; sidebar becomes a drawer below 960px; modal backdrop padding 22px below 960px. No matching resized originals exist in this inventory. Root must capture actual components at these sizes before claiming fidelity.

## Pure getter contract

`getSocialDetailFixtureMetadata(id, variant)` and `getSocialDetailFixture(id, variant)` are DEV-gated and validate every exact named key above. Unknown IDs, unknown named states and unlisted width×height aliases throw; no S10 fallback occurs. Empty variant selects default. Each call returns fresh data. Imports are type-only; the module does not import renderer stores at runtime, install an adapter, access window/native APIs, schedule timers or supply operation callbacks.

The full getter returns:

- `publicState`: a Pick of CommunityState public data fields only, including normalized SocialUser/Space/Channel, loaded messages, presence, read state and exact selected channel. No CommunityState methods are supplied.
- `friends`: normalized SocialFriend samples. Existing friends and presence adapters remain the production sources.
- `ui`: a discriminated opening intent for existing DirectMessageSurface, SocialSearchDialog, SharedFilesSurface, UserProfileDialog, NotificationSurface, CommunityEditor or ChannelEditor.
- `assets`: fixed local avatar/PDF/SVG paths, never provider credentials or attachment capabilities.
- `metadata`: exact original path, ID/variant, route, DEMO label, LOCAL_FIXTURE, current unsupportedReason and concrete pendingIntegration entries. A null unsupportedReason is not acceptance.

Root should bootstrap the common social shell, then apply `publicState` within its existing private isolated fixture boundary. Keep denied native operations and native-event suppression active throughout the fixture lifetime. Restore the previous isolated state on cleanup. Do not use an account-backed refresh/openChannel/createDM implementation with these sample IDs. Navigation to a different fixture channel requires its separately installed local projection; the getter provides only the loaded selected transcript.

## Per-screen mapping and limits

| Entries | Public data and existing component mapping | Remaining implementation / contract limits |
| --- | --- | --- |
| S12 default / blocked / nonfriend | `/dm`; demo-dm-ece with Deniz and Ece, five original messages and one heart reaction. UI supplies peerId, relationship and relationshipReady. Friends projection matches blocked or absent friendship. | Existing fixture relationship read is intentionally skipped, so root must pass readonly initialization to show banners. Prototype peer status text/shared inspector PDF have no independent authorized projection; no extra fictitious historical DM is inserted merely to populate the inspector. Calls and relationship writes stay disabled in fixtures. |
| S13 default / empty / files / quick | `/chat` background plus actual SocialSearchDialog; initial queries film / dağ bisikleti / pdf / salon; modes messages / messages / files / quick. Public messages contain the three original search texts plus Zeynep’s PDF. | Add initialQuery consumption. Existing search is limited to loaded selected-channel messages. Original all-channel filters and unrelated quick destinations are unsupported; no synthetic voice participant count. Message data stays chronological; current search preserves loaded order, whereas the PNG lists the newest result first. Root may implement an explicit display sort without altering transcript ordering. |
| S14 default / failed / preview / uploading | `/files`; selected paylaşımlar channel; actual typed attachment records for coast SVG/PDF and metadata-only board PNG. Preview selects demo-coast-svg. Failed supplies a precise local error. Uploading requests unavailable capability state, never an active fake upload. | Native byte progress/cancel are internal TODOs, not external blockers. No 65% timer, ZIP upload, cached-file claim or retry success. DEV asset resolver and selected-preview/error initialization pending. Actual files currently follow chronological attachment order, unlike the original coast/PDF/board tile order. Current fixture preview guard must remain closed until root supplies a fixed readonly DEV image boundary. |
| S15 default / expanded / invisible / status | `/chat` plus actual UserProfileDialog with Deniz; initialView maps directly. Invisible supplies own presence=invisible. | Bio/banner, join date and favorite room are absent in SocialUser; keep precise unavailable expanded state. Demo Deniz is community owner, so actual component shows Sahip rather than inventing the PNG’s Üye role. Status changes disabled; no implied provider presence verification. |
| S16 default / empty | `/notifications`; existing NotificationSurface with four readonly typed items, three unread; empty supplies no items. Mention target references a matching loaded message; friend target is local `/friends`. | Actual aggregate feed and mark-all operation absent in normalized social contract. No onOpen callbacks; only safe target intents. Cinema/Agent targets omitted because no actual local authorized activity/task exists in this projection. Do not join an Activity or open a fabricated task from notification metadata. Existing timestamp display uses absolute local date rather than PNG-relative minute labels. |
| S17 default / created / edit | `/chat` plus existing CommunityEditor; mode create/create/edit, draft Bizim Oda and description. createdReferenceRequested is metadata intent only. | Native name create/rename exists; icon, description and invitation-listing policy remain unsupported. Created does not return a native result/receipt or fabricate save success. A readonly local reference receipt, if later introduced, must visibly remain DEMO and separate from production success logic. Current created original remains unavailable pending that explicit integration decision. |
| S18 default / delete / private / voice | `/chat` plus existing ChannelEditor; create/delete/create/create, text/text/text/voice; film-gecesi or Sessiz köşe draft/topic. privateReferenceRequested records intent only. | Existing owner name/type create, rename and delete APIs remain real. No category/topic/create+permissions atomic transaction. Native permissions explicitly disallow member overrides; no fabricated Deniz/Ece visibility policy. Default/voice retain honest disabled category/private reasons; delete confirmation is readonly in fixtures. |

The local PDF size was read with filesystem metadata: 13,499 bytes; the original label is 248 KB. Coast SVG size is 3,172 bytes. Both original files remain unchanged. `pazar-plani.png` has no reference file: its record is clearly local sample metadata with no URL, so download cannot succeed. SVG/PDF source artwork appears only through the fixed DEV asset map; native download must remain disabled.

## Lifetime and fixture isolation review

The initial review found FriendsPage’s message action could invoke `createDM` in a fixture; root owns that correction. Initial SocialSurfaces review also found callback-before-fixture checking and upload completion scoped only to channel ID. During delivery the separate owner added account/server/channel/access operation scope, keyed SharedFilesScope, fixture FileLink denial and guarded file-context/preview operations. These are source observations, not executed acceptance evidence; this task did not edit those files or validate their behavior.

Remaining integration requirements:

1. Root must key profile/DM/editor modal lifetimes by account/server/access epoch and selected public ID, clear immediately on logout, server switch, access invalidation and active selection change, and avoid repopulating with stale replies.
2. Root must pass optional readonly fixture intents before native reads. DirectMessageSurface currently never marks relationshipReady in fixtures. Search has no initial query; files have no initial selection/upload-error props. Do not remove fixture guards merely to make screenshots populate.
3. Root must deny all renderer/native account writes for exact fixture URLs, including callbacks inherited from App/CommunitySettings. UI intent target navigation does not authorize provider reads or service participation.
4. Asset resolution must validate against the explicit fixed local map, require DEV+an exact validated fixture, render images passively, and keep real attachment download/navigation capability paths disabled. Do not accept arbitrary local paths or convert external/provider URLs into fixture capabilities.
5. Notification mark-read, community creation result and channel permission result must remain truthful; no success callbacks are included. Unknown variants must continue throwing in bootstrap/capture rather than defaulting silently.

No external prerequisite prevents getter integration or these bounded UI corrections. Missing native/normalized capabilities are internal implementation TODOs; real server authorization, transport behavior and owner acceptance remain separate verification gates.
