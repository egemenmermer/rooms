# RC11 friend test release

Owner authorized merge, compatible service rollout and new desktop publication on 2026-10-15. This is a friend test release, not completion of the outstanding physical acceptance gates. Existing accounts, installed applications and previous release archives must be preserved.

## Included changes

- Server monitoring and resumable host terminal surfaces, bounded shared Agent workspace and consented remote-input controls from the existing collaboration branch. Agent execution still requires an explicitly configured host/model/grant.
- Independent screen-share audio, own-view close/PiP cleanup, sender soundboard monitoring, crossed deafen controls and first-run window keep-alive while honoring saved preferences.
- Channel-entry scroll, larger photo viewing and message-authorized native file downloads.
- Identity-bound mention selection and real mention/read-state notification navigation with reconnect deduplication.
- Separate enqueue/play-now actions, explicit uncertain-song choices and clearer unavailable-search/provider failures.
- Persistent community playlists with revision conflict protection, member editing/reorder/delete, YouTube import and saving the queue or a historical session.

## Compatibility and publication gates

Upgrade Access and the music worker together before publishing the new client. Persist and back up `ROOMS_MUSIC_PLAYLISTS_DIRECTORY`; old clients remain compatible. Recreate only those required service containers and preserve the previous bundles/images/configuration for rollback. Do not restart unrelated Core or Hoppers services.

Require source CI, Mac signing/notarization/stapling/Gatekeeper checks, isolated packaged startup and updater-offer checks, and actual hosted Windows installer/native/UI checks. Windows remains unsigned and uses manual EXE installation. Publish only manifest-verified bytes; retain prior artifacts and feed entries.

The native iPhone interruption fix is in a separate repository and is not included in these desktop installers. No iPhone installation or App Store release is implied.

## Open physical acceptance

Actual Mac/Windows soundboard self-monitor, screen/speech gain isolation, own-view closure, background call persistence, real member mentions/shared-list replay and sustained IPTV/DJ transport remain open. Physical iPhone call/Instagram recovery remains open separately. Hosted synthetic decode, UI fixtures, builds and package checks do not close these gates. Full Spotify playlist authorization/import, closed-iPhone APNs, synchronized lyrics and expanded watch-together providers remain deferred.
