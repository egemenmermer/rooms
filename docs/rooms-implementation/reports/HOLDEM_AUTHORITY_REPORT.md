# Hold’em authority and shared-table contracts — 2026-10-10

## Scope and reference

Scoped Astra/medium server/game task approved by root. Read GAMES_40_43_REPORT, relevant source brief and prototype game rules, and complete F06–F09 journeys. F07 contains games/reconnection; F06 covers media and F08–F09 assistant workflows. Opened original S41/default, S41/activity_conflict, S43/buy_in, S43/sidepot and S43/showdown PNGs. This closes the Hold’em authority subset first. Root owns Games.tsx and all visual integration; this report is not pixel acceptance of S40–54.

Changed owned files: `packages/activity-protocol/src/index.ts`, `packages/games/src/cards.ts`, `packages/games/src/holdem.ts`, `apps/services/activities/games.ts`, `apps/services/activities/engine.ts`, and new focused tests. No voice, native IPC, renderer, social settings or game fixture changes.

## Stable UI contract

`HoldemTableRules` and `holdemTableRulesSchema` contain:

- `name`: trimmed 1–32 characters.
- `capacity`: integer 2–9.
- `smallBlind`, `bigBlind`: positive integers ≤100,000; small ≤big.
- `minBuyIn`, `maxBuyIn`, `initialChips`: positive integers ≤1,000,000; bigBlind ≤minBuyIn ≤initialChips ≤maxBuyIn.
- `spectatorsAllowed`: boolean.

Additive commands:

- `game.create`: optional `holdem: HoldemTableRules`; existing other-game variant/folding/teams preserved. Hold’em rules on another game are rejected.
- `game.configure`: `{holdem: HoldemTableRules}`; owner only, waiting before first hand only. Cannot invalidate an occupied seat index or already selected stack. Changing `initialChips` changes the default for future seats/bots, not already seated stacks. Rules lock once the first hand starts.
- `game.sit`: existing `seat`, optional integer `buyIn`. New Hold’em seat amount must be within table range. No amount means configured initial default. Existing-seat reconnect without amount preserves stack and hand. Explicit amount between hands selects a new virtual buy-in; changing an active hand’s chips is rejected. These chips have no monetary value, no payments or external wallet.
- `game.watch`: `{watching:boolean}` explicitly adds/removes an authenticated room member from the real spectator roster. No fabricated readiness or presence.
- `game.create.replacePrimary`: optional strict `{activity,startedAt}` identifying the confirmed current primary. Requires canCreate AND canControl, exact activity/start timestamp and existing command revision CAS.

`GamePublicState.seats[].pendingNextHand` marks new Hold’em seats that are not part of the current hand. Their chips/cards never enter that active hand; the next start includes them. Existing reconnect path is preserved. New seats/bots in other games are rejected while playing because those engines use fixed positional indices; they can join between hands.

Typed optional fields in `GamePublicState.view`:

- `tableName`, `rules` (Hold’em only).
- `spectators: {userId,name}[]`, `watching`, `spectatorAccess`.
- `ownHand: {category,score,bestFiveCardIds}|null`.
- `showdown: Record<userId,{category,score,bestFiveCardIds}>|null`.
- `pots: {kind:'main'|'side',amount,eligible:string[],winners:string[],awards:Record<userId,number>,split:boolean}[]`.
- `settlementReason: 'uncontested'|'showdown'|null`.

Category is `high-card|one-pair|two-pair|three-of-a-kind|straight|flush|full-house|four-of-a-kind|straight-flush`. Lexicographic score retains the actual engine scoring. Own hand is null before five total known cards; from flop onward its best five are computed server-side. Winning-card IDs always come from actually authorized hole/community cards. `showdown` appears only for a real multi-player showdown; folded or uncontested hidden hands are never included. Main/side-pot winners, awards and split flags are recorded by the actual payout operation, not inferred from the aggregate winners list. Odd-chip allocation remains clockwise from button; chip totals/statistics behavior is unchanged. Before settlement, pots have actual contribution/eligibility but empty winners/awards. Older persisted finished hands without new settlement metadata retain legacy payouts and may lack structured result details until a new hand; no synthetic backfill.

## Defaults and rule differences

Omitting config intentionally preserves native defaults: nine seats, 10/20 blinds, fixed 1,000 buy-in/initial chips, spectators allowed. Reference UI’s six seats, 20/40 and 500–2,000 are now valid explicit configuration, not silently substituted as server defaults. Blackjack/Batak/101 creation profiles remain unchanged in this first batch.

Reference S52 human timeout behavior corrected: a connected Hold’em player at 45 seconds checks if free and otherwise folds, without paying more virtual chips. A takeover/permanent bot retains its existing check/call strategy. Reconnect takeover remains 30 seconds. A new betting street receives a fresh 45-second deadline even when the same seat acts first on the next street. Cards/stack are not redealt on takeover or return.

## Authorization, spectators and replacement

Activity HTTP authorizer continues to verify current upstream room membership on every command and read, including long-poll wake. No new direct social reads or bearer cache. `game.watch` requires an already joined activity participant, and a seated player cannot become a spectator simultaneously. Explicit watchers receive only public game projection; they never receive a private seat/own hand. Without explicit watch, nonseated users see table/lobby metadata but no detailed board/hand/history. This applies to all game kinds. Spectator-disabled Hold’em rejects watch and removes existing roster entries when configured before play. Room leave/lease expiry removes spectators; taking a seat removes the spectator entry. Historical table details follow the same spectator access gate.

Replacement validates permission, expected primary and complete new game before mutating the previous primary, source declarations, queue, history or events. Game command changes execute on a candidate table and commit only after validation. Failed commands no longer refresh the participant lease/control field. Successful replacement preserves the existing queue and event log, archives the prior table result/statistics where present, stops the timeline, advances source epoch and clears Cinema declarations. No private path, provider credential, file capability or voice operation is transferred.

Returning later to Cinema/YouTube retains only compatible queued public metadata, resets selected item and timeline, and requires a new explicit selection/readiness cycle. This is one retained compatible queue in the room snapshot, not a multi-queue archive/history feature. Starting a different kind does not move private sources. Polls/whiteboard remain independent.

## Verification

Focused game run at 14:05:41 local: 27/27 tests across holdem-authority, holdem-authority-service, games-realtime, games-lifecycle, games-rule-edgecases and game-suspension. Prior 23/23 run passed before timeout refinement; all relevant suites passed after it.

After adding compatible queue restoration, final targeted run at 14:07:27 local passed 16/16: `pnpm exec vitest run --config vitest.config.ts tests/holdem-authority.test.ts tests/cinema-protocol.test.ts tests/activity-realtime.test.ts --maxWorkers=1`. This includes the new queue-return assertion and adjacent Cinema protocol/actual HTTP Activity behavior.

New tests cover strict/inconsistent bounds, old defaults, owner/pre-hand configuration, occupied-seat conflict atomicity, selected blinds/buy-ins, deferred mid-hand seat, reconnect/no-top-up, spectator policy/private projection, real distinct main/side-pot winners, equal-ranked split, ace-low evaluation, folded/uncontested secrecy, virtual chip conservation, human timeout, new-street deadline, and failed/stale/unauthorized replacement with unchanged queue/events/state.

Actual local HTTP service tests use separate owner/guest/viewer requests and a test membership authorizer: outsider reads/watch return HTTP403; explicit spectator sees no private cards; owner gets only own hand; viewer can reserve a future Hold’em seat without changing the current hand. Existing actual local service test completes a two-human hand, duplicate command replay, mid-hand bot join, history/statistics and all other native game lifecycles. These are local service checks, not production Stoat authentication or two physical desktop acceptance.

Root owns final integrated typecheck/build and renderer controls. No production writes/deployment, physical voice testing or remote load/disruption tests.

## Remaining game work after this batch

UI must wire the above contracts; current old UI will intentionally receive lobby-only projection for a nonseated nonwatching user. Cross-room table discovery/invitations, full archived-game exploration and game-specific S44–54 visual workflows remain subsequent integration work. Blackjack six-deck/S17/3:2 profile and Batak/101 variant rules were not changed in this batch. No unsupported readiness label, private-card reconstruction, synthetic winner or fabricated spectator roster was added.
