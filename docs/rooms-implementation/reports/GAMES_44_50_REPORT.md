# S44–S50 game surface implementation report

Date: 2026-10-10. Scope: Games.tsx, reference-games.css, this report only.
Status: NEEDS_RECHECK. Original review is complete; implementation is not visually verified. No screenshots, automated tests, typechecks or builds were run by this implementer. Root owns integrated checks and captures.

## References reviewed

All 73 originals below were individually opened at readable scale with the image viewer. Source files reviewed: 05_prototype/games.js and games.css; 06_handoff/flows.json (F07 games and per-screen contracts); current BRIEF.md, DECISIONS.md and CHECKPOINT.md; existing game protocol, activity hook, services/activities/games.ts and relevant game engines. Exact PNG appearance takes priority over older utilitarian-copy preferences, while actual service semantics and privacy remain authoritative.

## Production entry and implementation

Existing /games route, existing native Activity bridge and authenticated room context are retained. No App, router, stores, protocol, engine, native or fixture adapters were modified.

- S44: green Blackjack dealer/player felt, actual dealer-hidden count, public delivered cards, separate own split hands and active-hand state, actual card totals and bet values; hit/stand/double/split follow projected legalActions. Real results and next-owner hand actions. Rules reflect actual engine (equal point value split) rather than falsely claiming exact same-rank restriction.
- S45: full-page Batak creation with four selectable variants, actual current room participants, summary, rules dialog and real game.create. Participants are not silently seated or synthetic ready players.
- S46: projected bidding, trump and bury stages; current legal bid grid, precise four-card cap, confirmation controls, actual own private hand. Native Gömmeli sequence is preserved as bid → trump → bury → play; reference bid → bury → trump remains an internal implementation difference.
- S47: blue Batak felt, real trick cards/player counts/trick counts, real own rack, legalBatakCards restrictions from the renderer-safe pure engine module; three-player Gömmeli stays three players. Actual result score rows, owner next-round and authenticated rejoin.
- S48: full-page 101 creation with actual folding/teams commands, current participants, summary and rules dialog. No preset seated players.
- S49: green 101 public meld table, stock count/indicator/discards, actual public counts, private own rack only, local sort, stage-aware draw/discard. Responsive wrapping for the three inventory sizes. Explicit native watcher opt-in required; no hidden opponent rack DOM.
- S50: uncommitted ordered groups, separate normal/pair modes, pure validation with wildcard assignment preview, threshold/keep-one-discard checks, native open/open-pairs, public target-meld selection, real edge processing and exact joker-replacement controls. Discard uses correct cardId (legacy UI used tileIds). Native discard-return-and-draw action remains available when projected legalActions allow it. Finish uses real last discard; results only use native scores. No simulated penalty or result state.
- S41–S43 additive integration requested by root: actual Hold’em rules in creation and owner pre-first-hand configure, native min/max buy-in, next-hand pending seats, actual spectators/watch opt-in, native pots and showdown authorization. No renderer-side hand evaluator or hidden hands. Existing Hold’em board/catalog/lobby layout retained.

Timers use turnDeadline minus Date.now and Activity serverOffsetMs, never a synthetic decrementing turn. Non-Hold’em send lock closes the same-event duplicate window; pending/native errors remain visible and failed drafts stay available. Draft ids are pruned when the private hand changes, and table/hand/seat lifecycle resets transient state. Inputs/buttons remain keyboard accessible; existing modal focus behavior comes from the shared Modal. Hold’em shortcuts ignore focused form controls and open dialogs, including rule configuration. DEV fixture query blocks native commands before dispatch.

## Internal unfinished work and acceptance gaps

These are implementation TODOs, not permanent external-service blockers:
- Reference regional Batak score profile differs from engine: reference successful contract 10×bid plus overtricks; current engine returns trick totals / negative bid. Eşli reference minimum 5 versus current engine 8; Koz Maça reference bypasses bidding versus current engine per-player prediction. UI exposes actual values and does not invent reference scores.
- Batak bid/pass event history, cumulative match totals, explicit configured round limit and match-complete state are not projected. Current result/history shows real per-round scores; no synthetic 10-round championship.
- S50 penalty variant needs an actual typed, recorded penalty event/rule projection; current native engine has no such event. No fake +101 toast/modal or unauthorized local penalty.
- 101 preview follows current assignedMeld semantics locally, then native server repeats validation. A shared browser-safe pure projection/helper would reduce this duplication; server remains authoritative.
- Fine visual geometry, token/color calibration, table seats at all narrow widths, animation, modal focus and actual legal command transitions need root-integrated captures and owner/manual review. CSS implementation is not visual acceptance.
- Existing reference inline sample names, hands, synthetic presence and prototype forward-result buttons are intentionally not shipped.
- Hold’em category/best-five visual emphasis still needs final integrated design pass using native ownHand/showdown. The new fields exist; no missing external prerequisite is claimed.
- Native activity transport/authorized two-client private-hand, reconnect and timeout acceptance remains root-owned. Existing host prerequisites only affect live integration, not permission to finish internal UI.

## Reviewed inventory (originals opened individually)

| ID | Variant | Exact immutable original path |
| --- | --- | --- |
| S44 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table.png |
| S44 | blackjack | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__blackjack.png |
| S44 | bust | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__bust.png |
| S44 | double | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__double.png |
| S44 | hit | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__hit.png |
| S44 | pair | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__pair.png |
| S44 | result | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__result.png |
| S44 | rules | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__rules.png |
| S44 | split | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split.png |
| S44 | split_double | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_double.png |
| S44 | split_double_resolved_double | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_double_resolved_double.png |
| S44 | split_double_resolved_hit | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_double_resolved_hit.png |
| S44 | split_double_resolved_stand | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_double_resolved_stand.png |
| S44 | split_played | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_played.png |
| S44 | split_played_resolved_double | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_played_resolved_double.png |
| S44 | split_played_resolved_hit | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_played_resolved_hit.png |
| S44 | split_played_resolved_stand | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_played_resolved_stand.png |
| S44 | split_second | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_second.png |
| S44 | split_second_resolved_double | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_second_resolved_double.png |
| S44 | split_second_resolved_hit | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_second_resolved_hit.png |
| S44 | split_second_resolved_stand | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__split_second_resolved_stand.png |
| S44 | stand | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S44_blackjack_table__stand.png |
| S45 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S45_batak_settings.png |
| S45 | buried | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S45_batak_settings__buried.png |
| S45 | pairs | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S45_batak_settings__pairs.png |
| S45 | rules | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S45_batak_settings__rules.png |
| S45 | spades | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S45_batak_settings__spades.png |
| S46 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S46_batak_start_phases.png |
| S46 | buried | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S46_batak_start_phases__buried.png |
| S46 | buried_bid | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S46_batak_start_phases__buried_bid.png |
| S46 | buried_trump | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S46_batak_start_phases__buried_trump.png |
| S46 | pairs | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S46_batak_start_phases__pairs.png |
| S46 | pairs_trump | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S46_batak_start_phases__pairs_trump.png |
| S46 | spades | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S46_batak_start_phases__spades.png |
| S46 | trump | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S46_batak_start_phases__trump.png |
| S47 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table.png |
| S47 | buried | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__buried.png |
| S47 | buried_played | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__buried_played.png |
| S47 | ece_bid | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__ece_bid.png |
| S47 | game_end | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__game_end.png |
| S47 | pairs | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__pairs.png |
| S47 | pairs_result | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__pairs_result.png |
| S47 | played | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__played.png |
| S47 | round_end | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__round_end.png |
| S47 | spades | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S47_batak_table__spades.png |
| S48 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S48_okey101_settings.png |
| S48 | folded | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S48_okey101_settings__folded.png |
| S48 | folded_pairs | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S48_okey101_settings__folded_pairs.png |
| S48 | pairs | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S48_okey101_settings__pairs.png |
| S48 | rules | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S48_okey101_settings__rules.png |
| S49 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table.png |
| S49 | drawn | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__drawn.png |
| S49 | drawn_folded | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__drawn_folded.png |
| S49 | drawn_pairs | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__drawn_pairs.png |
| S49 | folded | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__folded.png |
| S49 | folded_pairs | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__folded_pairs.png |
| S49 | pairs | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__pairs.png |
| S49 | spectator | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__spectator.png |
| S50 | default | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results.png |
| S50 | add | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__add.png |
| S50 | add_done | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__add_done.png |
| S50 | discarded | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__discarded.png |
| S50 | doubles | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__doubles.png |
| S50 | doubles_opened | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__doubles_opened.png |
| S50 | finish | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__finish.png |
| S50 | folded_invalid | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__folded_invalid.png |
| S50 | invalid | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__invalid.png |
| S50 | opened | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__opened.png |
| S50 | penalty | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__penalty.png |
| S50 | result | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S50_okey101_moves_results__result.png |
| S49 | 1280x800 | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__1280x800.png |
| S49 | 900x700 | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__900x700.png |
| S49 | 1920x1080 | /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S49_okey101_table__1920x1080.png |
