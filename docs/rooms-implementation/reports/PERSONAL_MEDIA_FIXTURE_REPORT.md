# Personal media DEV fixture boundary — 2026-10-11

Scope: new `personal-provider-runtime.ts`, new `dev/personal-media-fixture.ts`, and focused tests only. No production component, router, native provider, shared contract, tracker or immutable reference was edited by this assignment.

The private typed `getPersonalProviders()` returns the most recent explicit development installation, otherwise `window.rooms?.providers`. The fixture installer is guarded by `import.meta.env.DEV`, never replaces `window.rooms`, and returns an idempotent disposer. Out-of-order nested disposal removes only its own installation and cannot resurrect a disposed bridge.

`installPersonalMediaFixture(screen, variant)` returns `{dispose, seed}`. Seed contains `label`, `initialView`, `initialDialog`, `selectedConnectionId?` and `intent:{screen,variant,channelId,libraryItemId}`. Exactly the approved 31 S33–S39 variants are accepted. Numeric responsive aliases are deliberately rejected here: root normalizes those before invoking this module. Unsupported screen/variant values fail closed.

`getPersonalMediaFixtureSeed()` returns a copy of the newest installed seed, or null in production/after final disposal. Nested out-of-order teardown preserves the current live seed without reinstalling. Playlist ID is `00000000-0000-4000-8000-000000000033`; RD ID is `00000000-0000-4000-8000-000000000037`. Locally created connections use incrementing opaque UUID-shaped IDs so strict route ID validation works; removed IDs are not reused within an installation. Seed returns are copies, preventing route consumers from mutating the stored intent.

All connections, five original-reference-inspired channel names, four library names and EPG rows contain `DEV fixture · local demo`. The channel count is the actual five local sample rows, not the original prototype's synthetic 48. `connected` means seeded local connection metadata only; it does not establish provider/account connectivity, live channel reachability or authorization. S33/offline marks cached local connections as `error`; S36/expired marks the local playlist as `auth-expired`. Reads return independent copies. Favorites, names, local connection creation/removal and cancellation mutate only isolated fixture memory; URL, username/password and XMLTV inputs are neither stored nor read remotely.

The picker returns null; file-token submission fails precisely. `play`, `rdPlay` and `saveResume` fail with a specific DEV reason and never yield a native capability, external/network URL or path. No native IPC, filesystem, credentials, account service, external browser or media network operation is consulted. RD grants contain visibly synthetic `DEV-DEMO`, inert `about:blank`, fixed expiry and interval metadata only. Polling returns pending/expired and never fabricates account progression to connected. S37/connected is an explicitly seeded saved metadata state. Cancellation fences the local poll. Disposal invalidates every retained bridge and releases local arrays.

S34/checking intentionally leaves a local connection Promise pending so an actual submit produces the component's own busy state; disposal rejects it as cancelled. No timer or successful provider progression is synthesized. S34/error and S37/error throw only after the corresponding actual user action. Waiting/expired/cancelled, edit/remove, no-guide, details, player/options routes require root/capture to apply seed intent through actual interactions. These intent values do not claim the corresponding screen was rendered or verified.

## Root integration

1. Inside the existing explicit DEV fixture bootstrap, dynamically import `./dev/personal-media-fixture`, call `installPersonalMediaFixture(screen, variant)` and retain its disposer for teardown.
2. Change production PersonalMedia provider reads/calls to `getPersonalProviders()`, preserving native fallback and production lifecycle guards.
3. Read `getPersonalMediaFixtureSeed()` from the root-owned DEV entry without reinstalling, then apply seed view/dialog/selected ID and intent through actual component state/actions. Capture clicks may trigger submit/checking/error, RD start/cancel/expiry, edit/remove and library details. Do not call native external-open on the inert DEV authorization URL.
4. S36 playback and S38/playing/S39 options need root's separate development playback projection. This provider fixture intentionally supplies no playable URL; production player/native capability requests must remain disabled in that projection.

## Evidence and limitations

Read AGENTS, BRIEF, CHECKPOINT, DECISIONS, PROGRESS, full master prompt and both visual reference files. Opened the immutable original S33/default, S35/default and S38/default PNGs to inform local names and grouping. No app screenshot capture, exact-state visual acceptance, real provider account, OS picker or playback acceptance was performed by this assignment.

Command `pnpm exec vitest run --config vitest.config.ts tests/personal-media-fixture.test.ts` passed after the final UUID/seed getter adjustment: 1 file, 18 tests, 349 ms reported duration, exit 0. Tests cover native non-consultation, UUID route shapes, all approved variants, unsupported/responsive refusal, copied reads, isolated mutations, stale bridge disposal, auth cancellation, pending checking cancellation, input non-retention, production guard/native fallback and out-of-order provider/seed teardown.

The first attempted command `pnpm test -- tests/personal-media-fixture.test.ts` incorrectly passed a separator to the package wrapper and began the broader suite. It was interrupted with exit 130 after observing the unrelated current `personal-media-import.test.tsx` case `closing a pending RD start fences native approval and ignores its late grant` fail because the dialog remained mounted. This partial run is not a full-suite result. Root was informed; concurrent PersonalMedia edits require coordinated recheck. No build/typecheck or publication was performed here.

Root subsequently reported a fix for the loading effect reopening an initial dialog and 65/65 combined focused checks passing. That is root integration evidence; this assignment reran only its 18-test fixture suite. S36 and S39 visual/functional captures remain unavailable until the root player projection integrates; root capture must refuse those unsupported states in the interim.
