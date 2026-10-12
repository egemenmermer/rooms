# S51/S52 authoritative history and recovery projection

Implemented 2026-10-10. Scope: `apps/services/activities/games.ts`, bounded additive types in `packages/activity-protocol/src/index.ts`, and `tests/game-history-recovery.test.ts`. No renderer, native bridge, Activity engine/server, voice or production changes.

## Reference review

Reviewed the existing `GAMES_51_54_REPORT.md`, each original S51 PNG (default, holdem, blackjack, batak, okey, empty, loading, error), S52 timeout/reclaimed originals, and immutable `05_prototype/games.js` lines 241–254. Source review included all four actual game engines and their public projections. Reference mock data is not runtime data.

## Stable additive contract

`GameHistoryEntry` retains `{hand, endedAt, result}` and optionally adds:

- `tableName`: actual configured Hold’em name; other games use the existing actual game-kind identifier because they have no configurable table name.
- `seats: {seat, position, userId, name, bot, startingChips?}[]`: identities captured at successful hand initialization. `seat` is physical table seat; `position` is the zero-based engine order for score/bid/team arrays. `bot` is control status at hand start. Starting virtual chips are present only for Hold’em/Blackjack.

Snapshots are cloned at completion. Late Hold’em joins do not become historic participants. Future seat names, hand state, or table context mutations cannot rewrite the record. Legacy archives and in-progress legacy hands without a captured context retain absent metadata; never reconstruct their identities from current seats.

`result` remains the existing extensible `Record<string, unknown>` and has these actual completed-engine values:

| Kind | Fields |
| --- | --- |
| Hold’em | Existing `payouts`, `board`, `pots`, `settlementReason`, `showdown`; new `revealedCards: Record<userId, Card[]>` from the actual anonymous public final view; `players: {userId, contribution, returned, net, finalChips, folded}[]`. Net equals payout minus actual contribution. |
| Blackjack | Existing `results`; new `dealer`, `dealerTotal`, `players: {userId, finalChips, net, hands: {hand, cards, bet, total, split, outcome}[]}[]`. Hand indexes match actual settlement results. Net equals actual returned amount minus final bets including split/double. |
| Batak | Existing `scores`; new `variant`, `contract: {bid, bidder, trump}`, `bids` only for koz-maca (otherwise null), `tricks`, `teams` (`[[0,2],[1,3]]` for eşli, otherwise null), `completedTricks`. Position-based fields use captured `seats.position`. |
| 101 | Existing `scores`, `winner`; new `rules`, `opened`, `highestOpening`, `melds`, `lastDiscards` (last currently retained public discard per seat), `lastDiscard` (winner’s actual final discarded tile or null). |

No deck, shoe, stock, buried cards, opponent racks, folded/uncontested hidden Hold’em cards, or reconstructed hidden state enters history. The Hold’em public result reveals cards only when the engine’s actual legal showdown projection does. Blackjack hands and final dealer cards are already public under its engine rules. Batak completed tricks and 101 melds/discards are public played objects.

`view.ownRecovery` preserves the existing `{disconnectedAt, takeoverAt, pendingReturn, takeover}` and adds optional `events: GameRecoveryEvent[]`, bounded to the latest eight for this seat:

```ts
interface GameRecoveryEvent {
  id: string;
  at: number;
  hand: number;
  type: 'takeover-started' | 'return-requested' | 'control-returned' | 'turn-timeout';
  action?: string;
  toCall?: number;
}
```

- 30-second actual disconnected-seat takeover emits `takeover-started`.
- Explicit seat return emits `return-requested` once per pending transition.
- Actual safe-turn control return, or a successfully validated action by the pending returning player, emits `control-returned`.
- An actual successful automatic action after the 45-second human turn deadline emits `turn-timeout`, with the exact action. Hold’em includes pre-action `toCall` so the UI can explain a free check or required-bet fold using real amounts.
- Invalid return actions preserve pending/bot control and emit no successful return event.
- Permanent bots have no private recovery events. Other players and spectators never receive these events. Existing seat projection remains unchanged.

Consumers should deduplicate by event ID, use `hand` and `at` to distinguish prior events, and use current recovery fields for current status. Persistent event evidence is not an invented transient loading/reclaimed state. No hand, chips, cards or voice resets are added.

## Honest remaining boundaries

Old archives cannot gain absent seat identities/table names. Shared history does not add a private per-user historical card store: a player's folded hidden historic hand remains unavailable rather than exposing it to all viewers. Detailed street-by-street contribution actions, per-player initial 101 opening points, and exact historical last tile processed were not recorded by the engine; this change does not infer them from final/current state. No cross-game aggregate currency, account-wide monthly statistics or invented table names are created. Existing Activity archive retention/access remain unchanged. Renderer integration and manual desktop acceptance belong to the coordinator/owner.

## Focused local verification

Command at 14:36:41:

`pnpm exec vitest run --config vitest.config.ts tests/game-history-recovery.test.ts tests/holdem-authority.test.ts tests/games-lifecycle.test.ts tests/game-suspension.test.ts`

Result: 4 files, 28 tests passed. Eight new cases cover frozen identities/late joins, hidden-card exclusion, actual showdown/payouts, legacy absence, own-only timeout check/fold evidence, 30-second same-hand takeover/reclaim including failed action and duplicate return requests, and actual completed public results for Blackjack/Batak/101 with private stock excluded and event bounds. Existing Hold’em authority/lifecycle/suspension regressions passed. Tests use local game fixtures; this is not two-client transport, physical media or desktop visual acceptance. No full build/typecheck or remote mutation performed in this batch.
