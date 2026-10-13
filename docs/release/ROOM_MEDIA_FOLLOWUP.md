# Room media follow-up — 2026-10-13

Owner supplied screenshots and requests: listener levels reset after reconnect/relaunch; share content overflows viewport; true stream fullscreen; parallel publishers with small clickable room previews, own preview and sidebar indicator; uploaded soundboard clips must be community shared and server stored. Owner subsequently reports DJ failed again and requests repairing it after these changes.

Observed source causes before repair: disconnect clears transient gain map without durable account/server preferences; share stages have minimum/fixed heights and vertically stack each stream; native provider and server enforce one presenter; soundboard keeps buffers only in process memory. Record separately from physical symptoms.

In-progress corrections: scoped durable listener settings, focused fitting share gallery/stream fullscreen, room/self previews and sidebar signals; independent connected-member screen permission routes preserving old routes for existing clients; authorized community sound storage/IPC/UI. Preserve legacy local clips and require explicit migration; do not silently publish them. No production update/install/release yet. DJ and actual two-Mac acceptance remain OPEN.


Initial full native app visual QA: wide1440×900 and900×700 share page has zero vertical overflow and stage above dock. Fullscreen click FAIL because the existing global room-view buttons overlap the new stream overlay at900×700. Record before removing duplicate share-mode controls and retaining PiP within the stream overlay. Native gallery transport independently passed two actual generated-window publishers/SFU receiver, self preview, focus selection, fullscreen and independent stop. Physical two-Mac gate remains open.


Local verification:116files/759tests,lint/type/build/servicesPASS. Actual two generated native-window captures publish concurrently to real local SFU/third signed app, own preview/focus/fullscreen/independentstopPASS. Full current native application DEMO fixture wide1440×900 and900×700 zero share overflow, stage above dock, stream fullscreenPASS after duplicate overlay-control collision correction; screenshots inspected.

Community audio: actual HTTP clients upload/read across users, other-community/outsider access rejected, other-user delete rejected, service recreation retains catalog, uploader can delete. Native two current Soundboard UIs use actual local file service; first uploads a generated4secondPCM tone, second lists/reads/decodes and mixes into a synthetic silent microphone publication. Actual SFU Node receiver581frames/maxRMS7277, explicitStop yields15quietframes<20RMS. No physical microphone/speaker/real account/production room used. Initial QA harness failed because stylesheet was not included; fixed harness/style input, no product assertions relaxed. DELETE empty-json transport corrected before cross-user HTTP test passed.

Settings now scoped to account/server, bounded512 entries; bot curve retained, disconnect does not discard them, new provider reloads validated persisted settings; account change does not reuse another user's values. Soundboard level also persists per account/server. Shared clips are canonical48kHz16-bit PCM WAV, <=8seconds/2MB,32/community and256total; upload/delete/read are authorized against current community, audio IDs are generated UUIDs, names/files never select arbitrary paths. Catalog version1 is validated and damaged/future data is never reset; upload is serialized and rechecks permission before catalog write.

New client uses independent /screens grants; old singular routes remain for existing clients. New UI no longer offers forced handoff or stops another publisher. No release/install/feature service deployment yet. Physical acceptance and owner-reported renewed DJ failure remainOPEN.

Final condensed React review: hooks are unconditional, effect listeners/timers/fullscreen state clean up, focused media keys follow actual track IDs, controls have keyboard/button semantics and accessible names, stored preferences are versioned and bounded, catalog reads and file decoding fence account/channel changes. Legacy clip migration's late UI completion now fences its original scope. Atomic catalog writes remove temporary files on failure. Focused37media/storage checks and16music checksPASS; lint/typecheck repeated after those small follow-ups.

Native process restart receipt LISTENER_PERSISTENCE_RESULTS.json confirms9% stored bot setting restores actual audio element gain0.0081 after closing/relaunching an isolated profile. No claim about physical loudness or actual profile mutation.

DJ resumed separately: owner confirms actual Lounge music audible but timer stuck0:00. Scoped music-only counter deployment documented in DJ_COUNTER_FOLLOWUP.md. No feature access-service deployment or new client installation/publication. Release hold remains.
