# Private personal guide and Real-Debrid library metadata

Status: IMPLEMENTED BUT UNVERIFIED for actual providers, native UI, playback and target-platform acceptance. Focused mocked local checks pass. No real-account/provider acceptance, deployment or commit occurred.

## Native contract

- `rooms:provider-guide(connectionId, channelIds)` returns `PersonalGuide`: `{ status: 'available' | 'unavailable' | 'not-configured', programs: Record<string, PersonalProgram[]> }`. `PersonalProgram` contains only `title`, `description`, `startsAt` and `endsAt`.
- Arguments are validated as an exact tuple. The connection must belong to the current private scope. Channel IDs must already be loaded from that connection; IDs are bounded plain identifiers and the batch is limited to **32**. Renderer URLs, extra arguments, foreign/unloaded channels and larger batches are rejected before network access.
- No configured XMLTV URL returns `not-configured`. Requested channels without an actual EPG mapping return `unavailable`. No Xtream EPG is invented. Successful bounded XMLTV reads return only programs for requested owned channels, including empty arrays where the actual guide has no current/upcoming entry.
- Existing `rooms:provider-epg` uses the same helper/cache for one loaded owned channel. It returns actual programs or an empty array for safe unavailable/not-configured results; stale scope/connection work still rejects.
- Real-Debrid library metadata now optionally includes `addedAt` and `resumeAt`; neither is synthesized when missing/invalid. No duration, artwork, quality or playback-readiness inference was added.

## XMLTV privacy, bounds and lifetime

The private cache is keyed by the actual connection object, composite session/identity scope and configured XMLTV URL. Concurrent guide/per-row requests coalesce into one fetch and body read. Successful documents expire after 60 seconds. Updates, disconnects, session changes and clearPlayback invalidate caches. Failed/stale reads cannot publish a partial document or result.

The existing private network helper supplies DNS/public-address/redirect protections and its existing 5,000,000-byte response limit. DTD/external-entity content and unsupported XMLTV document wrappers are rejected without resolving external resources. The bounded document is scanned once into subsets for loaded owned EPG identities; unknown channel identities are not retained. Each requested EPG subset is parsed with the existing XMLTV helper and cached, avoiding repeated full-document scans for each row. Programs retain the helper's actual current/next-day filtering and per-channel 500-entry bound. Expired cached entries are filtered before returning. Program text containing URL forms is sanitized to avoid exposing raw URLs through metadata.

Safe fetch, body and parse failure returns `unavailable` and preserves the loaded channel record/cache. Session or connection obsolescence returns the existing precise scope/change error instead of disguising stale private work as a valid empty guide.

## Genuine RD fields and source

The official [Real-Debrid API documentation](https://api.real-debrid.com/) defines `/downloads` entries with `generated` as `jsonDate` and states that dates use JavaScript `date.toJSON` format. `addedAt` derives only from that documented download-generated timestamp; the torrent `added` field or arbitrary provider fields are not substituted.

Accepted timestamps are bounded strict UTC ISO strings with optional three-digit milliseconds, valid calendar roundtrips, nonnegative Unix time and no date beyond the current time plus one day. The native result normalizes valid timestamps to ISO; invalid/missing/non-string/impossible/out-of-bound values are omitted. `resumeAt` reads only the current private connection's existing saved resume value for the exact library item ID. It requires a finite numeric value between zero and 604800 seconds, matching saveResume bounds; zero remains an actual stored value. Strings, negatives and invalid/excess values are omitted.

Only the public documentation page was read on the web. No authenticated RD API call, actual provider/XMLTV fetch, live account operation or playback acceptance was executed.

## Executed focused verification

Command: `pnpm exec vitest run --config vitest.config.ts tests/provider-media-metadata.test.ts tests/provider-connections-ipc.test.ts tests/playlist-file.test.ts`.

Result: **44/44 passed**, three files passed, 984 ms; tool timestamp 02:47:31 on 2026-10-11. The new metadata/guide file contains 11 checks; existing mutation/privacy and native import suites retain 20 and 13 passing checks.

All provider/network/filesystem/Electron behavior is mocked. Checks cover actual program extraction, URL omission, per-channel sharing/coalescing, loaded ownership and batch bounds, absent configuration/mapping, TTL/source update/clear invalidation, safe fetch/body/parse failure, late update/disconnect/session/ABA receipts, body-consumption fences, genuine generated dates, invalid/undocumented timestamp filtering and existing/subsequently saved resume values. Previous atomic/private-vault/cancellation/stream-chunk boundaries remain passing.

## Ownership and remaining acceptance

This continuation changes only `providers.ts`, new `provider-media-metadata.test.ts` and this report. Root owns contract/preload/renderer integrations, fixtures, shared files/tracker, build/type checks and release review. No product screenshot or visual acceptance is claimed. Owner acceptance still needs configured personally authorized XMLTV data, actual RD timestamps/resume, native playback, failure UX and macOS/Windows validation.

## Root integration follow-up

The preceding44/44 result is the implementer's timestamped result. Root later added explicit non-success XMLTV HTTP rejection (including valid-looking XML in a403 body), loaded channel/EPG mapping index invalidation, and missing/invalid RD MIME omission instead of an MP4 guess. Final native metadata checks now include12 cases and are included in the root64-file/503-check full pass. See PERSONAL_MEDIA_METADATA_INTEGRATION.md for actual integration/build/capture evidence; no actual account/provider/platform acceptance is implied.
