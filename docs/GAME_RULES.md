# ROOMS friends table rules — v1

Game rules run only on the authoritative Activity server. Versioned commands require a current room membership, expected room revision and unique command ID. These are social games with virtual, nonredeemable chips; there are no payments or payouts in real currency.

## Shared table lifecycle

Create a table, take a seat, optionally add bots as table owner, and start a hand. Capacities: Holdem 2–9; Blackjack 1–7; Ihaleli/Esli/Koz Maca Batak 4; Gommeli Batak 3; 101 Okey 4. Players joining an empty seat during an ongoing Holdem or Blackjack hand wait for the next hand. Adding a bot never deals a replacement hand or replaces existing cards.

A disconnected person's seat retains its user ID, cards, contribution, position and score. After 30 seconds a rule bot operates that same seat. An idle turn times out after 45 seconds and executes a legal conservative bot action. Returning people use Take Seat on their existing seat and regain control at the safe turn boundary. Changing view or Activity does not call a voice leave API. The oldest eligible Activity participant becomes table owner when the previous room host leaves.

The repository stores the active private round for restart recovery. Public snapshots derive a separate view for each authenticated user. A completed-hand history contains results, community cards and scores, not hidden hands or the shoe/stock. Starting another table archives only history/statistics; previous private cards are not retained in that archive. Per-table statistics track hands, wins and cumulative Batak/101 points. No seasons exist.

## Texas Holdem — `rooms-holdem-v1`

Fixed 10/20 blinds; initial virtual buy-in 1000. Button rotates each hand. Heads-up button posts the small blind and acts first preflop. All betting streets, fold/check/call/raise, all-ins, side pots, split pots and showdown operate server-side. A full raise reopens betting; a short all-in does not reopen betting until the cumulative increase reaches the last full raise. Uncalled contributions are returned through the corresponding one-player side pot. Odd split chips go clockwise from the button. A burned card precedes each community street.

Only one's own hole cards appear before showdown. Folded cards stay hidden at completion; remaining showdown hands are revealed. The stock is never exposed. Chips are conserved across every hand; empty/small stacks need a new table until an explicit virtual rebuy flow is added. Bots call or check conservatively using only their own cards and public betting state.

## Blackjack — `rooms-blackjack-v1`

All table players face the same dealer. Six-deck shoe, dealer stands on soft 17, natural pays 3:2, insurance disabled. Virtual bets must be positive even integers so 3:2 payouts stay integral. Hit, stand, double on any original two cards, double after split, and up to four split hands are supported. Same-value ten cards may split. Aces cannot split with ten-value cards. Split aces get exactly one card each; split 21 pays a normal win, not natural blackjack. No resplitting aces.

The dealer hole card and shoe are excluded from public views until completion. Player cards are face up, as at a physical Blackjack table. Bots stand at 17 or higher and hit below 17. A natural dealer finishes the round immediately.

## Batak — `rooms-batak-v1`

All variants use an ordinary 52-card deck, no jokers. Ihaleli and Esli use 13 cards per player; Gommeli uses 16 per player with a four-card burial. Following suit is mandatory. When following can win the trick, head it if possible. When void, trump if possible and overtrump if possible. These obligations also apply when a teammate is winning; this is the published ROOMS profile rather than an undocumented house-rule exception.

- Ihaleli: ascending auction, minimum 5, maximum 13; winner chooses trump and leads. A successful declarer scores tricks taken; a failed declarer loses its bid. Defenders score their own tricks.
- Esli: opposing seats form teams; ascending auction, minimum 8. Declarer's team scores total tricks if the contract succeeds, otherwise negative bid; defenders score their team's tricks.
- Koz Maca: fixed spades trump; each player declares an individual contract of 1–13 once. Pass means the minimum contract of 1. Each succeeds when taking at least its own contract, scoring tricks taken; otherwise negative contract. This has no trump-selection screen.
- Gommeli: ascending auction, minimum 8, maximum 16. Declarer chooses trump, receives the four-card burial, then privately buries four owned cards. Buried cards stay secret. Contract and defender scoring follow Ihaleli.

All-pass auctions assign the minimum contract to the last remaining bidder. Completed tricks and scoring are public. Bids, trump, burial, follow-suit and overtrump are validated server-side. Bots pass, choose their longest suit, bury low nontrumps and play the lowest legal card; they never inspect another hand.

## 101 Okey — `rooms-101-v1`

Only 101 is implemented, not classic Okey. All combinations of katlamali/katlamasiz and esli/esiz are supported. The deck has 104 normal physical tiles and two false jokers; one normal tile is the indicator. The next value in the indicator color (13 wraps to 1) is the real wildcard. False jokers represent that normal value and are not wild. The first player gets 22 tiles, others 21; a turn draws then discards, with the first player initially discarding.

Runs have one color, length at least three and no 13→1 wrap. Groups have three or four distinct colors of one value. The client submits ordered physical tile IDs; the server checks ownership/uniqueness and infers wildcard substitutions. Opening requires 101 or more; katlamali additionally requires strictly more than the previous highest opening. Pair opening requires five physical pairs. Opening mode remains locked. Further same-mode melds may be laid without repeating the opening threshold. Opened players, including pair-opened players, may extend existing runs/groups. Exact natural replacement returns a laid wildcard to one's hand. Pair melds cannot be extended.

A discard picked from the preceding player must be used on the same turn. If it cannot be used, Draw reverses that pickup and draws from stock instead. Keep one tile to discard; finishing requires discarding the last tile. Unopened hands score 202; opened hands score remaining tile values, counting held wildcards as 101. Winner scores -101. Finishing with a real wildcard or by pairs doubles these scores (once, not compounded). Team mode sums opposing seat scores. Stock exhaustion ends the hand with remainder scores and no winner. Bots select legal natural melds, process legal extensions and retain tiles with stronger combinations; they only see their own tiles and public melds.

## Verification and remaining acceptance

`pnpm typecheck` and `pnpm test` pass. Tests include actual TCP service clients playing a complete two-human Holdem hand with private views and duplicate command replay; actual server-driven complete Blackjack, Batak and 101 rounds; unchanged mid-hand bot addition; full four Batak variants; all four 101 profiles; chip conservation, all-in reopening, tied side pots, wildcard opening/replacement, duplicate physical tiles, pair finish/processing, discard restrictions, soft aces and split-ace payouts.

These checks establish local rule/service behavior with an injected test membership resolver. Actual deployed Stoat authorization, desktop game interaction/screenshots, two physical computers, persisted PostgreSQL restart recovery and exhaustive strategy/house-rule review remain separate acceptance checks. The profiles above are explicit ROOMS choices, not claims that all Turkish friend groups use identical house rules.
