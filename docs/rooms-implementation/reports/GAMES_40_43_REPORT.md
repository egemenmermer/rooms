# S40–S43 game area, lobby and Hold'em implementation

## Scope and original review

All 32 assigned original PNGs were opened individually with view_image at readable scale, including each named state and the three S42 responsive originals. Original PNGs remain immutable; no screenshot was embedded in production. PROGRESS.json was read for exact keys and paths and remains root-owned. BRIEF, prior instructions, Games.tsx, activity.ts, activity protocol, actual native game projection, prototype games.js/games.css and F07 flow were inspected.

- `S40/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S40_game_hub.png`
- `S40/empty`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S40_game_hub__empty.png`
- `S40/error`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S40_game_hub__error.png`
- `S40/loading`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S40_game_hub__loading.png`
- `S40/offline`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S40_game_hub__offline.png`
- `S41/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S41_table_lobby.png`
- `S41/activity_conflict`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S41_table_lobby__activity_conflict.png`
- `S41/blackjack`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S41_table_lobby__blackjack.png`
- `S41/bot_added`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S41_table_lobby__bot_added.png`
- `S41/full`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S41_table_lobby__full.png`
- `S41/not_owner`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S41_table_lobby__not_owner.png`
- `S41/seated`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S41_table_lobby__seated.png`
- `S41/spectator`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S41_table_lobby__spectator.png`
- `S42/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S42_holdem_table.png`
- `S42/full_table`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S42_holdem_table__full_table.png`
- `S42/heads_up`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S42_holdem_table__heads_up.png`
- `S42/not_turn`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S42_holdem_table__not_turn.png`
- `S42/spectator`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S42_holdem_table__spectator.png`
- `S43/default`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results.png`
- `S43/all_in`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__all_in.png`
- `S43/buy_in`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__buy_in.png`
- `S43/check`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__check.png`
- `S43/fold`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__fold.png`
- `S43/raise`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__raise.png`
- `S43/raise_result`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__raise_result.png`
- `S43/raised`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__raised.png`
- `S43/showdown`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__showdown.png`
- `S43/sidepot`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__sidepot.png`
- `S43/split`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S43_holdem_actions_results__split.png`
- `S42/1280x800`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S42_holdem_table__1280x800.png`
- `S42/900x700`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S42_holdem_table__900x700.png`
- `S42/1920x1080`: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S42_holdem_table__1920x1080.png`

## Entry and files

Existing /games entry is retained. Games.tsx selects catalog when no native game is active, reference lobby for actual waiting games, and reference table for all actual Hold'em lifecycle states. Running and finished Blackjack, Batak and 101 views retain their existing controls and private state handling. Native game creation preserves Batak variants and 101 folding/team options. New reference-games.css is scoped to rg classes; shared shell/router/stores/contracts were not edited.

Changed files: apps/desktop/src/Games.tsx, apps/desktop/src/reference-games.css, docs/rooms-implementation/reports/GAMES_40_43_REPORT.md.

## Per-state implementation

- S40/default: four real game-family entries and game creation dialogs; illustration cards are aria-hidden catalog art, never player hands. The approved exact reference welcome copy takes priority over older utilitarian-copy guidance for this reference task. Current-room table context is used because native cross-room table discovery is absent. No synthetic open-table list, participants or presence.
- S40/empty: actual no-game state. S40/loading: actual activity loading state. S40/error: actual native errors plus retry. S40/offline: actual missing connection or room, retry or real connection-settings route. Exact list skeleton/offline roster remains a native discovery TODO.
- S41/default/seated/bot_added/full: actual capacity, authenticated own seat, owner, native bot label and connected state; actual sit, bot-add, leave and owner-only legal start. Ready state is not invented: seats display Masada, not unsupported readiness. Full state follows actual seat count.
- S41/not_owner: start and bot-add restricted to actual owner; precise disabled reason. S41/spectator: actual non-seated user view, private hands omitted, spectator roster unavailable reason. S41/blackjack: same real waiting lobby with native capacity and preserved real even-number virtual bet action. Reference six-seat blackjack rules are not substituted for actual server profile.
- S41/activity_conflict: game creation disabled while actual primary activity exists, exact current title shown, current media entry navigation offered. Atomic activity replacement remains a native implementation TODO; no fake replacement.
- S42/default: actual board, delivered private cards, hidden-card count, chips, contribution pot, dealer marker, turn and native deadline. Native legalActions gate fold/check/call/raise. Amount is total street wager; current call/minimum raise/maximum stack are used. Timer uses activity serverOffsetMs and native turnDeadline, never a sample countdown.
- S42/full_table and heads_up: seat layout supports 2–9 native capacities, nine-seat and two-seat geometry; players are positioned from actual seat identity. S42/not_turn: actions unavailable and real active player shown. S42/spectator: actual non-seated view and no private cards or action permission; current native seating during a running hand remains disabled pending agreed next-hand semantics.
- S42/1280x800, 900x700, 1920x1080: responsive board/card/seat and lobby rules added after reviewing originals. Root shell dimensions, overlap, modal placement and typography require integrated captures; no fidelity certification.
- S43/buy_in: actual native sit confirmation with the current fixed 1,000 virtual chips. Adjustable 500–2,000 entry cannot be implemented through current command; limitation appears in dialog. No false selectable amount.
- S43/raise: real number and range inputs, actual minimum and all-in presets, integer and native legal validation, actual raise command; modal remains open on native failure and shows real error. F/C/R shortcuts use native permissions and are ignored in forms, dialogs or modified/repeated key events.
- S43/all_in: actual projected zero-chip player state and real full-stack raise command; no fake progress. S43/fold: actual folded projection, no revealed folded hand. S43/check: real legal check command.
- S43/raised: actual street wager and contributions update after native response. Specific last-action provenance/text is not invented. S43/raise_result/default/showdown: actual finished state, native payouts, delivered showdown cards and owner-only next-hand start. No client reconstruction of opposing cards or predetermined result.
- S43/split: actual multiple positive payout recipients with generic Pot dağıtıldı copy. Equal-ranked split cannot be distinguished from separate side-pot winners without structured result metadata.
- S43/sidepot: actual aggregate pot and native payouts retained. Separate main/side-pot totals, eligibility, evaluated hand ranks and winning-card highlighting remain unfinished native projection requirements; no reference sample totals are shipped.

## Production and fixture boundaries

All new native writes require actual connected state, no pending operation and explicit non-fixture runtime. Explicit DEV fixture query disables real game commands with a precise reason; no fixture actions spoof success. The preserved other-game send wrapper and direct end/create actions are also guarded. Root owns isolated fixture snapshot/activity adapter setup and fixture interaction support. There is no new fixture generator or production sample hand in this change.

Other players' faces are rendered only from delivered authorized native cards at actual finished showdown; folded hands are excluded. Hidden-card backs use only native hiddenCardCount. Own delivered cards remain local to authenticated seat. Voice remains owned by independent runtime; closing or leaving a game sends no voice command. No voice/presence success is asserted.

## Additive native/shared requests and unfinished integration

1. Table creation/configuration: actual table name, capacity selection, blinds, initial chip amount, permitted buy-in range and sit buy-in command. Current native profile uses fixed capacity/10–20 blinds/1,000 chips; reference 6 seats/20–40 blinds/500–2,000 entry is not hardcoded as real data.
2. Typed authorized spectator roster/policy, invitation operation and next-hand seating semantics. Current room membership is not falsely labeled spectator presence.
3. Public/private last action provenance, own evaluated hand/rank, main and side-pot breakdown with recipient eligibility, split reason and showdown winning-card metadata. Existing view exposes legalActions, capacity, turnDeadline, payouts and filtered cards, which are used now.
4. Cross-room game-table discovery and persistent personal/table history beyond active native game history. Empty active history does not fabricate archived hands.
5. Atomic primary activity replacement authorization and native transaction; UI currently requires finishing existing activity.
6. Root-controlled DEV snapshots/fixtures and integrated captures. Root can add compatible view fields without widening UI hidden-card access. These are implementation TODOs, not permanent external blockers.

## Evidence and limitations

Original review and code inspection were completed. No automated tests, typecheck, build, capture, remote writes or two-client game verification were run by this agent. Root controls integrated checks. Actual runtime lifecycle, hidden-hand privacy, deadline/transport behavior, keyboard actions, all seat geometries and the three responsive layouts remain NEEDS_RECHECK until integrated evidence and owner acceptance. Reference hero/table list, configurable rules, evaluated hand labels, spectator list and side-pot results are explicitly unfinished; reviewed does not mean visually verified.


## GPT-6.1 Sol bounded continuation — 2026-10-10

This addendum supersedes the older projection-gap statements above where the current contract now supplies data. Current server inspection confirms configurable Holdem rules/buy-in/spectator policy, ownHand/showdown evaluations, bestFiveCardIds and structured pot awards/split flags are already present. No protocol, server, fixture infrastructure or tracker was edited in this continuation.

Reviewed original S40/default, S42/default, S43/raise and S43/split individually against the current renderer source. Added:

- Public settled winning-card emphasis uses only the server's bestFiveCardIds for positive payout recipients and only after `finished`. No opposing private hand is reconstructed; pre-settlement cards receive no winning annotation.
- Structured split flags drive `Pot paylaşıldı`, while separate positive recipients without a split use `Potlar dağıtıldı`. Main/side pot chips and per-winner awards are rendered from actual typed settlement; seat winner labels use server showdown categories.
- Raise dialog explains the actual call and raise portions of the total wager; a short-stack all-in has a distinct truthful explanation. Legal actions remain server-owned.
- A modal opened on a subsequently occupied seat cannot send a new sit command. It displays the real occupied-seat reason. Existing own seat also prevents duplicate seat entry.
- Raise dialog closes after the actual turn ends or legal raise permission disappears, while explicit DEV capture intents remain stable. Own pending-next-hand, disconnected, takeover and pending-return state disables local game action controls.
- Command completions are bound to room/user/primary activity identity; a late response for a previous scope cannot close the current scope's buy-in/raise modal or signal local success.
- Removed internal `Atomic activity replacement ...` wording from the product modal. The current conflict explains that the active activity must finish first.

Changed only `Games.tsx`, `reference-games.css` and this report. CSS adds scoped settlement outline and multiline pot labels. No tests/typecheck/build/capture/release/push ran in this bounded continuation; root owns integrated type/build and current application captures. Existing historical tests do not validate these edits. Full S40–S43 fidelity and responsive/manual acceptance remain NEEDS_RECHECK.

Remaining implementation gaps: cross-room table discovery, invite operation, detailed last-action provenance, exact screen comparison and current functional interaction receipts. These are internal work items rather than permanent external blockers. Structured settlement and configurable buy-in are no longer missing server contracts.

## Native-supported continuation — 2026-10-10

Further inspection confirmed `social.createInvite(channelId)` is an existing authorized native method backed by the ROOMS access broker. The waiting-table invitation control now opens a real scoped create/copy modal instead of a permanently disabled button. It creates a community/channel invite through the existing native boundary, provides code or supported `rooms://invite` URL copying, and reports actual generation/clipboard errors. Its wording explicitly distinguishes community admission from a table seat reservation. It never sends a message automatically, guesses invitation lifetime or claims that accepting selects the table. DEV fixtures disable all native invitation creation. Request identity and dialog generation prevent an old invitation result appearing after close, account/server/room or primary-activity change.

The current protocol and `apps/services/activities/engine.ts` now implement `game.create.replacePrimary`. Hold'em creation can explicitly consent to end the identified active activity and establish the new table. The checkbox captures `{activity,startedAt}`; the confirmation becomes disabled if that identity or actual participant `canCreate`/`canControl` capability no longer matches. The server still performs revision/identity/permission validation and validates the replacement before changing the prior activity. Existing queue preservation is supported by current engine code; UI does not send voice commands. Other game-family replacement remains outside this assigned Hold'em continuation.

These renderer additions edit only `Games.tsx`, scoped `reference-games.css`, and this report. Original S41/activity_conflict was reread visually. No tests, builds, captures or publication were performed, as directed by root. Root must perform integrated current-state functional/type/visual checks; there is no acceptance claim.

Internal remaining prerequisites: no native cross-room game-table discovery method currently exists, so the S40 multi-table list cannot be completed by this renderer scope; game-specific invite navigation/seat reservation would require a separate native/deep-link contract; fine-grained last-action provenance and full exact-PNG/responsive/flow verification remain. External prerequisites: real deployed access-broker and game authority/account permissions, multi-client manual verification, and signing/physical Windows or macOS device delivery checks. None was represented by synthetic state or remote mutation in this continuation.
