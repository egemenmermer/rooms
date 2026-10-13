# Main integration and friend download — 2026-10-13

Owner explicitly requested all verified work merged into main and a usable download. PR5 head37d07ed had passing baseline/native/security checks but conflicted with main's separately merged documentation and Sparkle work. Conflict resolution preserves current RC5 packaging/provenance/CI scripts, candidate release evidence, main project handbook/site/cleanup records, main Sparkle regression tests and actual preview3-to-preview4 update acceptance. No history rewrite, retained artifact replacement, account/data/Hoppers changes or backend deployment.

The immutable signed/notarized RC5 archive remains the friend download; package/source provenance is not rewritten as the merge SHA. GitHub repository visibility remains private; direct trusted HTTPS binary delivery already supports download without repository access. macOS14+ Apple Silicon, invite-only existing service. Physical two-Mac acceptance remains OPEN; main integration is not final V1 acceptance. Checks and merge/delivery results will be appended after verification.

## Resolved-source validation

Main merge introduces no application/package/dependency/script differences relative to immutable RC5 sourcea9911cb. Added main Sparkle tests are retained. Full integrated110files/725tests, lint/type/build/services PASS (exit0; .local/release-rc5/main-integration-verify.log). Original source37d07ed hosted baseline/native/security PASS. The resolved integration commit will be pushed to existing PR5 and must pass its baseline/native/security checks before merge; no admin override or bypass.

Friend installer: https://62.238.119.134/rooms-updates/ROOMS-0.1.18-rc.5-arm64.dmg, exact Apple Accepted immutable DMG hash19f314346f809fc772fdf5e053757dea3362e013620ba89dc14ab2295b786e00,160837501bytes. Original private GitHub prerelease and signed Sparkle channel are retained. Invite-only service, macOS14+ Apple Silicon; no Windows/Intel/final physical acceptance claim. Final public-download/merge status recorded in owner handoff and Trello after delivery.

## Hosted platform regression found before merge

Run38378489468 Linux baseline failed4 imported main Sparkle tests: the test fixture depended on the host process.platform, so it tested the non-Mac branch on Ubuntu. macOS native jobs and GitGuardian passed. No merge/check bypass. Correction scopes the fixture to darwin and restores the platform descriptor after each test; an explicit non-Mac case checks that native Sparkle is not invoked. This is a test-fixture correction, not an updater/security configuration change. Public HTTPS DMG download matched exact manifest hash and160837501bytes.

The added non-Mac check initially used a synchronous assertion for an asynchronous rejection; corrected to await rejects, with no production-code changes. Failure log retained locally; final scoped6tests and lint/type verification run before push.
