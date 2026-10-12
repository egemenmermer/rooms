# S33–S39 personal media report

Date: 2026-10-10. Files: Providers.tsx, PersonalMedia.tsx, reference-media.css. Root owns routing, contracts/native additions, runtime fixtures, shared styles and integrated QA. Cinema.tsx was not edited.

## Original review evidence

Read BRIEF.md, DECISIONS.md, exact 31 PROGRESS.json records and immutable prototype media.js/media.css. Read F06 IPTV/Xtream/Real-Debrid, codec, external playback branches and capability acceptance. Every original below was opened at readable scale with the image viewer; this is visual review, not acceptance:

- S33_personal_media_home.png
- S33_personal_media_home__empty.png
- S33_personal_media_home__iptv_removed.png
- S33_personal_media_home__offline.png
- S34_iptv_connection.png
- S34_iptv_connection__checking.png
- S34_iptv_connection__edit.png
- S34_iptv_connection__error.png
- S34_iptv_connection__remove.png
- S34_iptv_connection__xtream.png
- S35_iptv_browse.png
- S35_iptv_browse__empty.png
- S35_iptv_browse__no_guide.png
- S36_iptv_live_player.png
- S36_iptv_live_player__buffering.png
- S36_iptv_live_player__error.png
- S36_iptv_live_player__expired.png
- S36_iptv_live_player__rewound.png
- S37_real_debrid_connection.png
- S37_real_debrid_connection__cancelled.png
- S37_real_debrid_connection__connected.png
- S37_real_debrid_connection__error.png
- S37_real_debrid_connection__expired.png
- S37_real_debrid_connection__waiting.png
- S38_real_debrid_library.png
- S38_real_debrid_library__details.png
- S38_real_debrid_library__empty.png
- S38_real_debrid_library__playing.png
- S39_playback_options.png
- S39_playback_options__external.png
- S39_playback_options__unsupported.png

## Implemented entries

| Screen | Reviewed states | Actual implementation | Remaining difference / dependency |
|---|---|---|---|
| S33 | default, empty, iptv_removed, offline | Reference private banner, personal home heading, empty connection CTA, native connection cards/status, removal confirmation and refresh; actual current user name | NEEDS_RECHECK: no fake resume/poster samples; native does not list resume metadata for home cards. Native status is saved-connection metadata, not a live network probe. Actual listing failures show errors, not invented cached offline content |
| S34 | default, checking, edit, error, remove, xtream | Reference modal dimensions, M3U/Xtream tabs, real secure add bridge, masked URLs/password, optional XMLTV, busy checking state, fieldset lock, actual errors and actual removal confirmation | NEEDS_RECHECK: safe native file import/edit absent. File selector/edit control disabled with precise reason. No prototype staged 48-channel success until actual native result. Existing connection retained until explicit removal; replacing safely needs atomic native update |
| S35 | default, empty, no_guide | Actual channel list, search, groups and native favorite toggles; EPG button reads actual native XMLTV; no-program callout and reset-filter empty state | NEEDS_RECHECK: per-channel guide opens on request rather than invented program previews in every row. Recent-watch list unsupported and disabled. Group labels/counts come from actual channel list |
| S36 | default, buffering, error, expired, rewound | Existing secure rooms-provider playback and Hls/native fallback retained; buffer/error overlays, actual retry and options, native controls; actual video seekable range drives live lag and return-live button | NEEDS_RECHECK: expiry is not guessed from playback error; native opaque 410/network failure lacks typed expiry signal. Native video controls differ from custom reference control bar. No synthetic scenery/EPG; source errors never become playback success |
| S37 | default, cancelled, connected, error, expired, waiting | Actual rdStart/device code/official browser and native poll; real expiry; connected panel only from native connection/result; serialized polling and cleanup; stop-control states honest about provider code still existing | NEEDS_RECHECK: renderer stopping polls cannot revoke an in-flight native grant; cancellation explicitly says control stopped, code may remain valid. rdCancel shared native API requested. ROOMS_RD_CLIENT_ID required by existing implementation; actual errors shown. No simulated approval control or prototype disclaimer |
| S38 | default, details, empty, playing | Actual RD downloads library, search, metadata table, drawer, rdPlay, source/native resumeposition and private playback; real current title only | NEEDS_RECHECK: native item exposes size/MIME, not added time, duration, resolution, cover or browse-time resume. Table uses real size/MIME; drawer omits unavailable sample facts. Cinema source-transfer actions precisely disabled |
| S39 | default, external, unsupported | Actual Hls audio/subtitle track metadata, native textTrack fallback, real local radio choice/apply; unavailable-track states; external-player dialog with precise native limitation | NEEDS_RECHECK: no fake languages/audio options. External launching disabled because safe native playback launch bridge absent. Generic source failures do not assert codec diagnosis. Error overlay links to real playback options |

## Component and integration contract

PersonalMedia exports PersonalMediaView = home|channels|library. Props: notify(message), embedded?, initialView?, initialDialog?:playlist|xtream|rd|null. Root can mount personal routes and modal route entries. Changing initial props requires a route-key remount; local browse navigation is in the component. initialView opens first matching actual connection after native status. Providers.tsx retains PersonalProviders({notify}) for existing Settings by rendering the shared component with embedded=true. Root must import PersonalMedia into App routes; no shared router changes were made here.

PersonalMedia preserves main-process provider ownership and the opaque rooms-provider stream scheme. Original personal Hls/native playback and periodic/close/ended resume saving were moved into the shared component, with actual waiting/error events and dynamic track selectors. No raw saved credentials, original stream URL, access token or file path is requested by renderer status/lists. New credentials stay temporary component state until the existing native bridge; close/success clears fields. No external service mutation was performed while implementing.

Shared additions requested to root: native rdCancel to clear pending grant safely; native importPlaylist to select/parse a local list without path exposure; native atomic connection update without returning stored secrets; secure external-playback route if supported. Home resume and RD browse metadata require a typed sanitized native listing. All missing capabilities remain visible-disabled or explicitly recorded, not falsely complete.

## Verification

Original image opens, source contract inspection and code review performed only. No build/typecheck/automated tests/remote provider auth or playback scenario run by this implementer; root controls integrated authorized checks. All entries remain NEEDS_RECHECK pending root route integration, development-fixture comparison and owner manual acceptance. No visual, provider-account, media-transport or Windows acceptance claimed.
