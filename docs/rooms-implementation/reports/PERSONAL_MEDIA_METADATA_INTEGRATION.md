# Personal media metadata integration — 2026-10-11

Status: local implementation, awaiting exact visual review and owner/provider/device acceptance. Source integration adds no production fixtures, shared media URLs, credentials or remote mutations.

## Actual behavior

- The native provider bridge exposes a bounded batch guide for up to 32 loaded channels owned by the current connection/account. The existing private XMLTV fetch is coalesced and cached for 60 seconds, indexed once for actual owned EPG IDs, and shared with the individual guide control. Non-success HTTP responses cannot supply a guide, even if their body resembles XML. Changes in loaded channel identity/EPG mapping invalidate the index. Missing configuration and failed/unmapped guides have distinct metadata states and do not remove channels.
- The channel page requests only its first 32 owned channel IDs, keeps individual guide controls for other rows, and ignores results after leaving the page or changing the connection/account. A programme title, time and elapsed progress appear only when genuine start/end times include the current time. No current entry means the actual channel group remains visible. The clock refreshes every 30 seconds; no network request is made for each tick.
- RD library rows expose only genuine native `generated` dates and actual saved resume positions. Invalid/missing metadata is omitted; absent container format is not guessed as MP4. Library columns are added date and saved position; the detail panel retains actual size/format. Position is shown as elapsed time, never as a percentage or remaining duration without an actual duration.
- Home's resume section loads only an actually connected owned RD account, shows up to three strictly positive saved positions, and starts the selected item through the native opaque playback capability bound to the current server/account. Missing/unreachable accounts do not trigger RD metadata requests. Failed reads keep source cards and report that saved positions could not be read. No artwork, duration or historical viewing is fabricated.
- Read generations fence stale source/status receipts. The latest owned route entry retries after a pending source read rather than replacing selection while the old request is still loading. Leaving browsing discards its result. The app-root player remains the only media owner.

## Development-only projection

The S33–S39 DEV metadata adapter gains local date/resume/guide fields with explicit local-demo labels. It still refuses actual playback, native calls and provider authorization. S35/empty now enters through a real unsuccessful search while preserving source counts; S35/no_guide uses the real provider-level absent-guide notice instead of opening an unrelated empty per-channel panel. Dates/programmes are fixture metadata only. Production bundles exclude this module.

## Reference review and deliberate differences

Root individually opened original S33/default, S35/default and S38/details. Their resume section, inline programme hierarchy and added-date/position columns guide the implementation. Production keeps concise screen names instead of the original promotional slogan. Neutral placeholders remain where no real artwork exists, and no synthetic resolution, track count, total duration or remaining-time indicator is restored. Original sample channel totals and participants are not production data. All entries remain NEEDS_RECHECK.

## Evidence and remaining work

Focused initial local integration: four files /55 tests passed before the later missing-format/native refresh/status-fence changes. A fresh integrated build and final focused/full regression are required for those later changes and S37 integration. Native provider report contains the independently observed mocked44/44 result preceding root's HTTP/format/index additions; do not relabel it as evidence for later source.

Exact new captures, original comparison, final check results and source hashes will be appended after the related S37 panel integration stabilizes. Actual XMLTV/RD accounts, native picker/storage/playback, platform verification and owner acceptance remain separate. S36/S38-playing/S39 player projection and external brokerage are still unfinished. No redesign release, publication, Hoppers or production service change occurred.

## Final integration evidence

Local source commit: `8b03fdd7d1976d84ca483f3b40fe1619cb0177dc`. The owner explicitly reauthorized Astra/high during this continuation; its bounded stateless S37 component and24 presentation checks were integrated by root. Root supplied actual native cancellation, distinct start/poll errors, confirmed owned status readback before connected state and real confirmation-first removal. Failed readback never offers connected actions. Native/provider scope and the single persistent player remain unchanged.

- Final full `pnpm test`, session4230, exit0: **64 files /503 tests passed**,44.40s. Includes native guide/library12, presentation24, metadata UI10 and updated route/import/readback18 checks.
- Initial integrated build passed. The later final build caught two unsupported `exact` query options in newly added DOM tests; only those ignored options were removed. Fresh `pnpm build`, session4335, exit0: strict typecheck, Vite,126 dependency notices, Electron bundle. Focused route/import/readback suite, session92533, **18/18 passed** after that test-only correction. Existing mixed-import/large-chunk warnings persist; no performance claim.
- Production `dist/assets` search for personal DEV metadata markers/IDs returned no matches. This is build-output inspection, not real-account acceptance.
- Capture manifests now sort source paths before hashing so moving a new file into Git cannot change the manifest purely from inventory ordering. This tool-only correction was committed and all16 exact entries were actually recaptured. Final receipts bind to commit8b03fdd and source hash `65dd61d007b73e5b698f4502d0dc1d23fd4a3b6d8cc3f8e3cd85a70857f335c6`, timestamps00:58:17–00:58:51 UTC. Each reports zero runtime errors, loaded Inter and no horizontal document overflow. Copies are archived in `evidence/2026-10-11/personal-metadata/`; actual images/manifests are under `.local/design-review/evidence/`.
- Exact captures: S33 all4, S35 all3, S38 default/empty/details3, S37 all6. Root opened all16 integrated app states across the first/final capture passes (app code unchanged between passes; only source-inventory sorting changed) and original S33/default, S35/default, S38/details and all six S37 originals. Earlier unsorted-manifest captures preceded the tool-only correction and are not relabeled as final receipts.

The shared shell, fixture counts/long demo labels, actual data placeholders, removed prototype disclaimers and some modal heights/actions differ. Full visual fidelity, responsive variants, all11 flows, personally authorized providers, actual native grants/storage/playback, code signing, Windows/physical-device/two-client and owner acceptance remain open. No record was marked visually VERIFIED, no release was published and no production service was changed.
