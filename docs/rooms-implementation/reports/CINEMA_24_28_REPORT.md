# Cinema S24–S28 implementation report

Date: 2026-10-10. Owner: GPT-6.1 Sol Cinema implementer. This report covers source implementation and focused local verification, not visual acceptance or live transport certification.

## Reference inventory reviewed

Read the S24–S28 source functions in `05_prototype/media.js`, design tokens, and original main PNGs. Reviewed all named variants: S24 empty; S25 buffering, reconnect, source_missing, host_left; S26 matching, late, mismatch, error; S27 presenter, source_lost; S28 empty, keyboard, shared. Reviewed the S25 900×700, 1280×800 and 1920×1080 original responsive PNGs. Layout selectors are responsive; actual rendered responsive acceptance remains a root verification task.

## Implemented behavior

- S24 source entry can explicitly start Cinema, add/select a public content identity, then open the existing native personal file selector. It never silently replaces an occupied primary Activity. URL/path titles are rejected. Native, connection and authority restrictions have concise reasons.
- S25 preserves the existing persistent video, source-version authority, private captions, readiness withdrawal, reconnect, mini-player and playback controls. Ready buttons share a finite-duration/readiness guard.
- S26 adds an actual source-check dialog using native filename and video metadata. Matching duration is a prerequisite, not proof of identical content. Joining requires explicit same-content/access confirmation, usable media, connected Activity and duration agreement within the existing two-second tolerance. Loading, mismatch, source failure and late join are distinct states.
- S27 uses the actual subscribed screen track. Controls operate on the local mix, native browser PiP and DOM fullscreen. Screen owner volume affects that participant's microphone and shared audio, and this is disclosed in the control tooltip. Local self-loopback is disabled with a reason. Idle control hiding preserves keyboard focus and reduced-motion behavior.
- S28 uses typed Activity queue commands. Current content cannot be removed or displaced by the UI. Keyboard controls preserve keyed row focus and announce completed movement. Empty-queue action focuses the actual input. YouTube queue content is added through the existing typed YouTube interface rather than sending Cinema media commands.
- Participant labels distinguish organizer, actual screen owner/viewer, source readiness and microphone activity from authoritative snapshots.

## Development fixtures

`dev/cinema-fixture.ts` is guarded by `import.meta.env.DEV`. It installs an isolated Activity adapter and existing isolated media provider, never native credentials or production accounts. Exact supported variants are validated. S28/shared deliberately retains a `cinema` primary while showing a physical shared track. A `screen` primary is not a synchronized-media timeline.

S25/S26 project a static package poster and synthetic DOM video metadata. They are component/visual examples, not real playback. S25 starts through the actual confirmation/readiness controls; buffering and source-loss fixtures dismiss the source-check dialog through its real Back action to reveal the player's error state. Host transfer occurs in the isolated room and is observed by the actual polling hook.

Root integration required: install social S19/default first, then `installCinemaFixture(id, variant)` during the existing DEV bootstrap. Routes: S24 `/cinema?view=start`, S25/S26 `/cinema?view=personal`, S27 `/cinema?view=screen`, S28 `/cinema?view=queue`. S25 host_left capture must wait at least 3.5 seconds. S28 keyboard capture must press Tab inside the queue layout. Root owns bootstrap/capture wiring and evidence receipts.

## Exact reference differences and limits

- Promotional movie-night copy is omitted as requested by the owner; screen labels and source/privacy reasons remain utilitarian.
- Captured screens have no true pause/seek timeline. S27 therefore omits the reference's fictional captured-stream transport controls and uses actual live local viewing controls.
- S26 uses the already implemented native personal-file source boundary. A fabricated Real-Debrid/provider library is not presented as an available synchronized source. Existing PersonalMedia integration is untouched.
- Screen-primary playback is intentionally unsupported by the current independent-source protocol. S28 requires a Cinema or YouTube primary, with a precise reason when occupied by screen sharing. The existing engine predicate is `(state.primary?.activity === 'cinema') !== (command.media.kind === 'independent-source')`; root owns backend current-item immutability.
- No new actual app screenshots were captured by this implementer: root-owned bootstrap/capture integration was not present during this work. These screens are not visually accepted yet.
- Real two-client synchronization, codecs, microphone/capture permissions, system audio, participant mix, native PiP/fullscreen, provider access and Windows require actual service/device acceptance. This work does not certify any of them.

## Verification

- `pnpm exec vitest run --config vitest.config.ts --maxWorkers=1 --testTimeout=15000 tests/cinema-reference-24-28.test.tsx tests/cinema-lifecycle.test.tsx tests/cinema-captions.test.tsx`: 17/17 tests passed across three files on 2026-10-10; final rerun after all owned edits started at 19:49:17 and passed in 53.89 seconds (the earlier parallel run had two historical suites time out under concurrent work; sequential rerun passed).
- `pnpm exec vitest run --config vitest.config.ts --maxWorkers=1 tests/cinema-reference-24-28.test.tsx`: 9/9 passed after adding non-finite expected-duration guards.
- Two `pnpm typecheck` attempts were blocked only by concurrent Agent.tsx/S59S61Entry changes (missing module/export and outdated tab comparisons). Neither reported Cinema diagnostics. This is not a successful whole-repository type check; root must rerun after sibling changes settle.
- No deployment, remote mutation, package release or acceptance claim made.

## Files handed back

`apps/desktop/src/Cinema.tsx`, `CinemaPlayback.tsx`, `CinemaScreenStage.tsx`, `CinemaSourceCheck.tsx`, `reference-cinema.css`, `dev/cinema-fixture.ts`; `tests/cinema-reference-24-28.test.tsx`; this report. Existing untracked CinemaPlayback/reference-cinema.css content from prior root work was preserved. Shared route/store/native files and progress tracker were not edited.
