# Publication review — existing ROOMS repository

Date: 2026-10-14. The publication target remains **egemenmermer/rooms**, under MIT. Visibility remains private pending final review. The private archive is a backup, not a replacement open-source project.

## History preservation

The frozen original review covered 240 reachable commits (including fetched PR merge refs), 25 tags and 50 local refs. All 240 commits are preserved unchanged in a verified local Git bundle and the independent PRIVATE `rooms-private-archive` backup. The archival GitHub branch/tag references and all three backup asset digests were checked. The public-history candidate also contains 240 mapped commits, with zero pruned commits; author names, timestamps and parent relationships are preserved. The maintainer email is replaced with the GitHub noreply address. Original and redacted commit IDs necessarily differ. The complete mapping remains in the private archive.

484 historical private/archive paths are excluded, with every path listed in HISTORY_FILE_DISPOSITIONS.csv. This includes private-community PNG/WebM, private operator records, screenshot/reference evidence and internal planning archives. These are publication-scope exclusions, not 484 asserted security vulnerabilities. Thirteen retained source paths have known private host/email/filesystem literals replaced. Twenty-one safe historical engineering documents and legacy tools were retained after review. Four historical artwork references are retained without redistributing the private binaries, preserving current legacy-title handling.

The latest prepared application/source tree was byte-for-byte identical before and after history redaction. Final changes after that comparison are publication documentation only. Source work retains the Electron/React client, Stoat adapter, media transport, game rules and services.

## Release inspection

All 96 original GitHub release assets across 25 releases were downloaded and inspected: 8,063,147,400 bytes. Every downloaded asset matched GitHub's declared SHA-256 and size. ZIP/DMG/Windows installer application ASAR contents were inspected statically; DMGs were mounted read-only and no packaged application was executed. Small text receipts and agent archives were examined. Four release PNGs were viewed and show generic signed-out settings, with no visible personal account/chat.

54 assets contain directly observed private-community material or maintainer infrastructure references. The remainder is not mislabeled as secret: it includes public checksums/notarization identifiers/technical receipts, generic settings captures and two early unflagged packages. The disposition of every asset is listed in RELEASE_ASSET_DISPOSITIONS.csv. Historical packaged distributions are separated from the source project; existing code version tags are retained after redaction.

RC8 (last published working community build) and RC7 (rollback) are retained privately with original filenames and digest verification. The initial archival copy detected two same-name metadata collisions between versions; these were corrected and reverified in the new private archive. No original published bytes were altered. Other superseded release files are removed from this repository's distribution surface after preservation of the complete original release metadata/inventory. No source-only alpha is falsely advertised as a new signed installer.

## Other GitHub surfaces

PR descriptions/comments/reviews were captured through 43 metadata endpoints and text-scanned with no confirmed secret detection. At the log snapshot, 111 available Actions runs were inspected and 10.76 MB of log text scanned without secret detections. This is bounded automated evidence, not proof that all privacy-sensitive data is recognizable by a detector. Private evidence copies are archived; historical execution artifacts are excluded from publication. Two Windows artifact archive downloads timed out, and are explicitly not claimed inspected; their matching release installers were inspected separately. One Linux native artifact's container/member hashes were inspected.

The original all-ref scan produced 16 source-triaged non-secrets. The redacted-history scan retains three detector hits on the public Sparkle verification key; it is not a private signing key and is not rotated or erased as a supposed leak. Required third-party licenses, font notices and author attributions are retained.

## Verification and production boundary

The exact preceding runtime/source candidate passed 801 tests in 119 files, lint, typecheck, app/service builds, formatting and macOS onboarding shell smoke (GitHub run 38553988545). History redaction did not change its current source tree. No new signed release, installer acceptance, physical media test or production deployment is inferred from this audit.

A read-only HTTPS check of the current community appcast found six enclosure URLs, all community-hosted and none GitHub-hosted. The community server, update feed, installed apps, live accounts and server-only private artwork are unchanged. The public source uses the original generated static DJ and optional per-community customization.

## Remaining publication gates

1. GitHub-retained old PR refs, cached old commit/diff URLs and attachments need an explicit disposition. Replacing branches/tags does not guarantee GitHub purges them. Local cleaning cannot remove read-only PR refs. A maintainer support request is prepared privately and has not been sent. Do not make this repository public until those retained views are resolved or an informed publication decision covers their contents.
2. Verify a usable private vulnerability-reporting route and branch/required-check policy on the chosen account/visibility configuration. Documentation alone does not enable a platform feature.
3. Owner reviews final source, file/asset decisions and the precise remote cleanup receipt, then explicitly approves visibility change.

Official GitHub explanation: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository . A visibility change is not performed by this work.
