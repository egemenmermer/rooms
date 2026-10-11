# S10 / S11 chat implementation report

Requested model: gpt-6.1-sol / medium. Actual runtime model not independently observable. Ownership: only `apps/desktop/src/RealSocial.tsx` CommunityChat/import additions, and new `apps/desktop/src/reference-chat.css`. Other exports (CommunitySpaces, MediaStage, CommunityVoice, RealVoiceDock, CommunityInvite) compared with HEAD and retained byte-for-byte. No remote write, build, acceptance run or automated/type test was executed by this implementer. Root owns integration/captures/typecheck. Current status: IMPLEMENTED, NEEDS_RECHECK; no visual or service verification claim.

## Actual reference review

Opened all ten original S10/S11 PNGs at source size 2880×1800 via viewer (viewer display resize was 1996×1248): S10 default/empty/loading/failed and S11 default/reply/edit/delete/reactions/failed. Read `05_prototype/social.js` R.chat and message modal definitions. S11 failed is a documented visual alias of S10 failed; original source scenario says failed message, but its PNG has the same visible default transcript under this viewport. Do not claim a retry row is absent from runtime because reference clipping omitted it.

## Implemented behavior

- Scoped 59px chat header with channel/topic and working notification-settings, members-panel toggle and precisely labeled loaded-message search. Pin is disabled with actual unsupported-service reason.
- Real activity snapshot banner only when activity service returns a primary. No synthetic movie/title/participants in production. Shared voice lifetime unchanged.
- Date separators from actual timestamps; initial unread marker snapshot retained before native acknowledgement. Real avatar component reused; colors/images depend on actual/fixture avatar bridge.
- All returned reactions rendered and toggled via actual `social.react`; known unicode IDs use matching icons, other valid unicode keys decode, opaque custom IDs display their key. Reply uses an explicitly labeled quoted-text fallback because typed send has no thread/reply field. It cannot pretend to create native reply metadata.
- PDF attachment type/size/download row and actual image attachments use returned MIME/URL only. Missing file URL preserves the error reason. No reference poster or session card is fabricated from message prose.
- Concise composer, explicit @agent insertion, existing optimistic send/retry and attachment lifecycle retained. No fabricated typing indicator: current social contract does not expose typing events.
- Hover/focus message actions open real option/reaction/reply/edit/delete dialogs. Own-message permission gate retained. Reminder, agent submission, room memory, block/unblock/remove member preserved. Pin/message-link actions disabled until native contracts exist.
- Modals retain shared focus trap/Escape handling; edit Enter submits, Shift+Enter keeps multiline, delete has actual message preview and confirmation. Errors remain in modal; active-channel switch closes stale message dialogs.

## Per-variant mapping and remaining differences

| ID / variant | Entry or state | Remaining difference / evidence |
|---|---|---|
| S10 default | `/chat`, current channel/messages | Geometry implemented. Needs root capture. Fixture must supply activity snapshot, authenticated avatar URLs and supported message media-invite metadata to match poster/banner. No fake typing/member/event data. |
| S10 empty | current channel + messages empty + loading false | Empty symbol/title/CTA implemented. CTA sends actual `Selam!`. Explanatory reference subtitle deliberately omitted under owner utilitarian copy preference. |
| S10 loading | loadingMessages true + no messages | Five geometry-matched skeletons; composer omitted as in original. Needs screenshot. |
| S10 failed | actual delivery failed | Retry retained and concise error row. Failed row may scroll below viewport; root should capture actual scrolled state separately and not substitute default. |
| S11 default | message hover/focus → Mesaj seçenekleri | Modal shape implemented. Extra existing reminder/agent/memory actions retained below reference list. Unsupported pin/link disabled with reasons. |
| S11 reply | options → Alıntıyla yanıtla | Honest quote fallback; no native reply field in bridge. Disclosure is necessary copy and differs from prototype. |
| S11 edit | own message → options → Düzenle | Full modal/save/cancel/Enter behavior implemented. Root fixture should select Deniz 20.44 message. |
| S11 delete | own message → options → Mesajı sil | Confirmation/preview retained; preview lacks timestamp unlike original, pending root capture/calibration. |
| S11 reactions | options or hover reaction button | Six icon choices map to actual unicode reaction IDs; source fixture aliases heart/check are supported for rendering. Needs real server validation of supported reaction IDs. |
| S11 failed | same actual delivery state as S10 failed | Documented PNG alias; runtime retry remains actual store operation. |

## Root integration requirements

1. Hide generic App toolbar for `/chat` to avoid a second header; this component owns chat header. Root owns sidebar/context responsive layout.
2. Keep DEVELOPMENT fixture data in existing stores/native fake adapter only. Current fixture needs `unread[general] = true` with last read Zeynep 20.45 for reference unread divider placement; present first installer read marker points to Deniz 20.44. Native acknowledgement cannot be forged in production.
3. Avatar URLs should come through existing VoiceAvatar/native social.avatar. Local native bridge simulation is needed to display package avatars in fixture without production name conditions.
4. For default activity banner, fixture must feed real activity snapshot bridge; do not encode film metadata in production message renderer. Poster/card requires a typed invitation or explicit development attachment. Same restriction applies to typing.
5. Capture baseline 1440×900 logical at device scale2 and responsive 1280×800/900×700. Run central typecheck, then root interaction evidence. Update central PROGRESS only after those actual checks. No verification is claimed here.
