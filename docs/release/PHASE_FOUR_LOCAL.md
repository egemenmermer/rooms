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
