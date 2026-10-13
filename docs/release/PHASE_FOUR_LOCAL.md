# Private release phase four — local preparation

## Before repair — 2026-10-12

REL-009/010: package source remains0.1.14 while installed/feed preview.4 uses a version override; signed packaging has no source/service/package provenance manifest. REL-010 historical installation ran out of disk before rollback; current packaging starts builds/native preparations before checking available space. Expected: candidate source/package version0.1.18-rc.1 and a fail-fast disk gate that cannot touch /Applications or user data. Local pipeline preparation is not candidate signing/distribution acceptance.

Existing preview.3 → preview.4 native Sparkle install-on-quit and next-launch evidence is retained. Physical fresh install, signed-in next-candidate upgrade, immediate restart and low-disk/interruption recovery remain open. Hosted CI uses no signing/provider/production credentials. Current retained current/rollback archives are immutable reference artifacts and will not be replaced by these local checks.

REL-011 source gap: Activity requests return a safe generic503 and background sweep failures are silently swallowed; /health does not actually query persistence. Local correction will emit only bounded error category, operation, build/source and timestamp; no error message, bearer, URL, room/user ID or message content. A persistence probe will check database/table reachability without reading rows. Actual production alert delivery/TLS/disk/backup drills remain operator/staging acceptance gates.

## Current pipeline preparation

Source version is0.1.18-rc.1; signed override must match it. Before native/build/signing work, a read-only preflight requires6GiB available on workspace and candidate-output filesystems and committed source. This is a conservative initial packaging budget, not measured recovery acceptance. The current real preflight passes at~6.3GiB. Injected shortage/unknown-space checks reject without creating output directories; no installed-app operation is present in the gate.

The signed pipeline independently verifies strict signatures, builds the four service bundles, requires Apple Accepted status, staples/Gatekeeper checks and matching candidate Info.plist version/build, then records hashes/source/storage compatibility in release-manifest.json. Service digests identify locally built files, not production deployment. No feed publication during local candidate preparation (ROOMS_PUBLISH_UPDATES=0).

Activity events log only fixed category/operation/version/source/time, throttled per category/operation per minute. Health checks DB/table reachability without loading records. Three focused tests verify safe503, incompatible-state diagnosis and no exception/request secrets in output. Other service/dependency/backup/TLS/disk alert delivery and operator drills remain OPEN. See PRIVATE_ACCEPTANCE.md for concrete outstanding journeys and boundaries.

## Local verification before packaging

Final local verify:ci PASS:101 files /685 tests, lint/typecheck/build/four services. Current signed-out Electron smoke PASS. Release/ops focused5 tests PASS; full production audit remains zero, one moderate dev packaging residual previously documented. Dirty-source release gate is also exercised and refuses before signing; source-SHA changes during packaging fail before publication/manifest acceptance. Final syntax/lint recheck covers the SHA-freeze guard.

A local signed candidate is being prepared only after committing this verified source, with publication explicitly disabled. Do not infer artifact/notarization success until the pipeline actually completes. PRIVATE_ACCEPTANCE.md remains the gate ledger; physical media, ordinary-account/mail, current production restore/export/deletion, alert delivery and measured six-identity session remain unaccepted.


## Actual candidate result — 2026-10-13

Signed candidate0.1.18-rc.1 /build1791842324 from sourceab03fe0 completed successfully. First Documents-output attempt failed at Sparkle Downloader signing with resource-fork/Finder metadata; failure retained and only its failed generated mac-arm64 tree removed. Retry used the pipeline's non-cloud /tmp output; strict signature then passed. Apple submission80bd3fd0-5d73-493a-a056-1f6129fbb9a0 Accepted, app/DMG staple/validate and Gatekeeper passed. Explicit notarytool pipeline enforces acceptance even though electron-builder's internal notarization is disabled for Keychain-profile handling.

Local manifest and final ZIP/DMG copied to release/candidates/0.1.18-rc.1 with exact hash parity. ZIP separately extracted under /tmp: strict nested signature, staple and version passed. Actual candidate executable launched with a random disposable profile, rendered welcome/About0.1.18-rc.1, exposed no renderer require, emitted no pageerrors and decoded the local640×798visual (21frames,1.003s). Profile removed after normal close. This is signed-out same-host launch, not fresh friend install or accepted authenticated/physical DJ playback.

Hosted CI on exact sourceab03fe0, run38313641233: Ubuntu and macOS native smoke PASS. GitHub warns pinned actions target deprecated Node20 and are automatically run with Node24; jobs passed, future action-runtime pin refresh is a documented maintenance follow-up. Intermediate branch runs were cancelled by the workflow's intended concurrency policy, not accepted as passing.

Installed /Applications/ROOMS.app stays preview.4; no update-feed/public release, production service deployment, retained-archive replacement or Hoppers change. Candidate remains unaccepted for physical media/current auth/data rights/full restore/update recovery/alerts/soak. It is not the final frozen distribution. RC_0_1_18_RESULTS.json binds exact hashes/results and explicit open gates.


## Owner-authorized installation — 2026-10-13

Owner requested installation on their Mac. No ROOMS process was running before replacement. Candidate strict nested signature, notarization staple and Gatekeeper passed before staging. With14GiB reported available and a~420MiB bundle, ditto copied the candidate to a hidden staging app on the Applications filesystem. Staged signature/staple/version/build passed. Prior preview.4 was atomically renamed to `/Applications/.ROOMS-before-0.1.18-rc.1-preview.4.app`, then staged RC moved to `/Applications/ROOMS.app`. Installed strict signature and Gatekeeper passed; app.asarSHA256ebc87d44c585177ed74d09b76b5acdc5c3120318733237eeb076c5bac7324093 matches candidate source. Existing retained ZIPs remain unchanged. Installer did not touch profile or account directories.

Normal application launch loaded the existing signed-in home, community and recent-conversation entries. Native About visibly showed `ROOMS Version 0.1.18-rc.1 (1791842324)`. Only home/About were inspected in this installation journey; no messages, room membership or preferences were changed. This manual local bundle replacement is not Sparkle preview.4→RC recovery acceptance, other-Mac fresh installation, or two-Mac physical media acceptance. Server bundles remain undeployed and update feed unpublished. User data was not reset.
