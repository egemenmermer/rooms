# Usability remediation — approved 2026-10-11

The owner approved implementation of the chat/cache, media viewport, YouTube, settings, high-quality sharing and compatible service delivery plan. Root implements all work. Real-Debrid registration is explicitly deferred by the owner's latest reply; do not invent a client ID or treat the missing connection as implemented.

## Implemented in this delivery

- Channel history stays visible during refresh. Gateway edits/deletes and optimistic messages reconcile with in-flight responses. Navigation uses a bounded hot cache (20 channels, 200 messages each), with latest-page refresh retaining older paginated history. Account/session changes clear renderer caches.
- Native encrypted cache stores bounded message text and author labels, excluding attachment URLs/avatar URLs. OS encryption must be available for disk writes; logout removes the account cache. Revocation tickets prevent delayed native responses from repopulating a revoked cache. Files are account/server scoped, 0600, with a 25 MB bound.
- One Activity observer/request/serialized command queue per account and room replaces per-screen polling. Idle room snapshots survive navigation; account changes and channel revocation invalidate old results. Community-management query caching retains visible data for background refresh, with bounded query timeout and permission-driven purge.
- YouTube joins an empty room, validates links before queue submission and exposes action failures. Shared room command state is retained across screens. Provider autoplay/embedding restrictions remain intact.
- Settings preference edits have a fixed Save/Discard bar and close warning. Audio changes are applied on Save; failures restore prior preferences/device selections. Navigation shortcuts cannot silently abandon dirty settings. Native desktop operations and independent account/admin editors still use their existing immediate/per-editor actions; unifying those under the draft bar remains open.
- Settings covers the main navigation. Avatar initials are centered independently of surrounding row span rules.
- Personal Cinema, screen Cinema and YouTube use bounded viewport stages. Queue/member sections scroll internally. Actual screen-Cinema overflow discovered during local review was corrected.
- Screen capture targets 1080p60 by default, with 720p30, 1080p30, 1440p60 and 4k30 choices. These are requested maxima, not guaranteed delivered quality. Camera defaults to 720p30. H264 is requested for compatible screen encoding; diagnostics report observed video dimensions, FPS and codec when RTC stats supply them.
- System audio is explicit opt-in, separate stereo screen audio without microphone echo/noise/AGC processing. Native source consent passes audio only for the selected one-shot source; unsupported OS audio selection is blocked. A missing audio publication stops the requested combined share rather than claiming success. Audible output still requires physical acceptance.

## Actual verification

- Full local suite: 82 files / 628 tests passed (session78921), before the final revocation/diagnostic/shortcut additions.
- Subsequent focused suite: 7 files / 43 tests passed (session23811). Final media/Activity focused suite: 16 tests passed (session8653), including observed codec/FPS reporting. Final typecheck session43789 exited0. Production build session8823 exited0; large-chunk warnings remain, so no loading/performance target is certified.
- Local Chromium DEV components at 950x650, 1280x720, 1440x900: personal Cinema and YouTube main viewport had no vertical overflow or page exceptions. Final screen Cinema main scroll/client heights were 561/561, 631/631, 811/811, with all stages inside the viewport. Settings content intentionally scrolls within its panel; primary navigation is covered. Captures and geometry are private under `.local/remediation/`.
- Local Settings interaction: changing density shows Save/Discard; discard removes the draft; save persists compact density across reload. This is local browser evidence, not native device-application acceptance.

## Authorized core delivery

Owner-authorized service update completed at 20261011T153545Z after encrypted backup `/opt/rooms/backups/rooms-20261011T153558Z.tar.age`. The existing backup script resumed all its quiesced ROOMS writers. Only access and activities code bundles were replaced and those two containers restarted. Hoppers and other hosts were not accessed.

- access.cjs SHA256: 536bbdd45c38d60c2bf48642c9c4c3235f551ddca646e5cae72ad385f4c8281d
- activities.cjs SHA256: 474cef128fc147f67ff88424bd24d87edb19a315b7f1304daa9a076f68af8921
- Prior bundles retained as `<service>.cjs.before-20261011T153545Z`; deployment script restores both and restarts if health fails. Both localhost health endpoints succeeded. Public HTTPS private-call poll returned AUTH_REQUIRED without credentials, establishing route availability, not authenticated two-client call success.

## Remaining completion gates

1. Cache/stale-refresh behavior beyond conversations, Activity and management: review other server-backed screens, permissions/membership invalidation and end-to-end request budgets. Measure actual cold/warm navigation and M1 memory/CPU; do not infer performance from tests.
2. Complete unified drafts for remaining native desktop preference editors; verify account/admin editor Save semantics and failed native persistence recovery.
3. Exercise real two-Mac chat, YouTube queue/play/pause/seek/late join, private calls, camera, screen resolution/frame rate, audible stereo system audio, microphone separation and restrictive-network reconnect. Local mocks and health responses do not close these gates.
4. Complete the authorized together-watching workflow using host-authorized screen/audio without provider credential/source URL distribution or DRM bypass. Personal IPTV stays available; Real-Debrid client registration is deferred by owner.
5. New Mac DMG/ZIP 0.1.16-preview.1 was built successfully (session28756) with Developer ID/hardened runtime, source a3000e3. Strict deep codesign verification succeeded (session48663); the certificate chain and team match the authorized identity. Copies are in `/Users/egemenmermer/Downloads/ROOMS-0.1.16-preview.1`. DMG SHA256 2e42d9fbdd0e2f802aa20d45057c75bf297cbd3467fccdaa7902c731a46c3bf5; ZIP SHA256 4acb71418ec74f78476aa8b8d0de527d6390c9b747045686f7a9da6feaeba095. No credentials are included. Installed app/releases remain unchanged. Apple notarization is blocked: `notarytool history --keychain-profile ROOMS-notary` returned no Keychain item. Do not publish/install as notarized until Apple Accepted, stapling and Gatekeeper checks succeed. Preserve previous installed app, user data and releases.
6. Continue the complete reference inventory; no record becomes VERIFIED from these coarse viewport checks. Separate Agent host/accounts, Windows, signing and owner/device acceptance remain explicit gates.
