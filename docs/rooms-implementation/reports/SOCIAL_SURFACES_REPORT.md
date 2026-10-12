# S12–S15 social surfaces

Status: IMPLEMENTED_NEEDS_RECHECK. No visual fidelity, native behavior, two-client behavior, or platform acceptance is certified by this implementation report. Root owns routes, shared contracts, integrated checks, fixtures and tracker.

## Reference review

Read AGENTS.md, BRIEF.md, CHECKPOINT.md, DECISIONS.md, PROGRESS.json, CHAT_REPORT.md, social.js, relevant styles.css rules and F02/state/responsive contracts in flows.json. All 15 original main/variant PNGs below were individually opened with view_image at readable scale. No collage or thumbnail substituted for the original review.

- `S12/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S12_direct_message.png`
- `S12/blocked`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S12_direct_message__blocked.png`
- `S12/nonfriend`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S12_direct_message__nonfriend.png`
- `S13/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S13_search_quick_switch.png`
- `S13/empty`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S13_search_quick_switch__empty.png`
- `S13/files`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S13_search_quick_switch__files.png`
- `S13/quick`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S13_search_quick_switch__quick.png`
- `S14/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S14_file_sharing.png`
- `S14/failed`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S14_file_sharing__failed.png`
- `S14/preview`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S14_file_sharing__preview.png`
- `S14/uploading`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S14_file_sharing__uploading.png`
- `S15/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S15_user_profile.png`
- `S15/expanded`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S15_user_profile__expanded.png`
- `S15/invisible`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S15_user_profile__invisible.png`
- `S15/status`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S15_user_profile__status.png`

## Exports and integration

- DirectMessageSurface({notify}) uses active native DM recipients, CommunityChat and a 278px profile inspector. Root has integrated /dm and actual-DM detection on /chat; selection uses the real native DM.
- SocialSearchDialog({onClose, initialMode?: messages | files | quick, onOpenMessage?}) supports loaded-channel message/file search, author filtering, channel quick switch and keyboard selection. Default result navigation uses /chat?message=<messageId>. Root has added article IDs and query focus for /chat?message=<id>, plus CommunityChat onSearch integration. Exact context behavior remains awaiting integrated acceptance.
- SharedFilesSurface({notify,onOpenMessage?}) is integrated by root on /files. Native attachments are derived only from active-channel loaded messages. Optional callback opens exact attachment message context.
- UserProfileDialog({user?,onClose,initialView?: profile | expanded | status | invisible}) defaults to actual current user. Root wires profile entries; settings action uses /settings?tab=profile.

Only SocialSurfaces.tsx, reference-social.css and this report changed. Existing RealSocial.tsx and all shared App/store/native/contracts/tracker files remained outside ownership.

## Per-state implementation

S12/default: native DM intro, native peer avatar/name/presence, actual chat send/edit/delete/reaction/attachment/delivery/retry via reused CommunityChat; loaded shared-file inspector and profile modal entry. Actual DM recipients required; absent selection shows a concise empty state. No sample peer or messages.

S12/blocked: appears only after successful native friends fetch confirms blocked relationship; composer hidden, real unblock operation and authoritative relationship refetch. S12/nonfriend: real addFriend or accept incoming request, outgoing pending disabled. Composer remains available for nonfriends because current adapter does not expose a messaging-permission policy; root must implement a native policy if reference restriction is product authority. Fetch failure does not imply nonfriend. No call joins a community room; DM call buttons are disabled with specific missing direct-call implementation reasons.

S13/default/empty/files: live loaded-channel query and author/type filters; matching text highlight, genuine empty results, actual attachment filenames/author/time/context controls. Scope visibly states loaded message count and selected channel. No server-wide results asserted. S13/quick: actual current-space channels plus actual DMs, arrow-key selection, Enter navigation and inherited Modal Escape/focus trap. Navigation opens channel only; it does not join voice.

S14/default: three-column native attachment cards with all/image/document tabs, actual size/author/time, actual image preview and validated HTTP(S) links. Previous-message load action exposes older native attachments. S14/preview: native image URL, filename and size in 900px modal; no prototype art. S14/uploading: existing native chooseAttachment then real channel send; indeterminate progress because native does not report bytes. Cancellation disabled with missing native cancellation reason. Switching channel during picker/upload discards pending attachment and prevents sending it into the new channel. S14/failed: actual native error, failed message retry through community store, no claimed saved local path or invented percentage. Native dialog cancellation returns silently.

S15/default: actual identity/avatar/presence and own memberships, self tag, live settings/profile edit route. No other-user mutual memberships inferred from current-user memberships. S15/expanded: detail toggle and concise missing native detail reason; invented bio, join date or favorite place omitted. S15/status: real presence mutation online/idle/dnd/invisible, disabled during native operation, actual failure displayed. Successful native acceptance updates own presence locally while gateway remains authoritative; no unsupported claim that DND mutes OS notifications. S15/invisible: shown only for actual own invisible status, private offline projection explanation. Other users do not receive this private UI.

## Internal implementation TODOs for root

1. Root has integrated /files, /dm, DM-aware /chat, search entry and message query focus. Integrated captures/interaction acceptance remain required.
2. Native public profile read: biography, status text, banner asset, mutual membership and membership dates need typed authorized adapter data. Current SocialUser has identity/avatar only.
3. Native server search: typed scoped query, author/channel/file filters, result pagination and message context fetch. Current search intentionally remains current loaded channel.
4. Native attachment upload lifecycle: operation ID, byte progress, cancellation, retain/retry/discard semantics and trusted native download/save destination. Current one-shot chooser cannot implement reference percentage/cancel semantics.
5. Native DM permission/direct call scope: actual blocked/nonfriend policy and separate DM call invitation/session, not room voice alias.
6. DEV fixtures can be added by root through actual native adapter boundary for reference states. Explicit DEV fixture guards prevent this module from reading native friends or writing native presence/uploads/retries/history/channel changes against a real account. Unsupported fixture account operations are disabled with a precise reason. Root owns inherited CommunityChat fixture isolation. No production sample data added.

## Evidence and limitations

Original files were reviewed; current code and social contracts inspected. No automated test, typecheck, build, capture or visual comparison was run by this agent. Root reported its integrated typecheck passed before final fixture guards; root controls subsequent checks. Root-controlled integrated checks and owner acceptance remain pending. Reference shell dimensions are scoped locally; root must avoid duplicate route toolbars. Search/profile geometry necessarily differs where native information is absent. DM-specific chat footer still inherits existing community chat copy/actions and activity state; root/Chat owner can add compatible DM presentation props later. These differences are NEEDS_RECHECK and implementation TODOs, not external blockers.
