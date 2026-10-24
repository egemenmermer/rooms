import type { Card, Suit } from './cards';
export type BatakVariant = 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
export interface TrickPlay {
  seat: number;
  card: Card;
}
/**
 * House-rule switches for a Batak round. Published defaults: trump may not be led before it has
 * been played on another suit ("koz kırılmadan koz açılmaz"); the two scoring variants are off.
 */
export interface BatakRules {
  /** No trump lead until trump was played on a non-trump lead, unless the hand is all trump. */
  noTrumpLeadUntilBroken: boolean;
  /** A defender (or defending team) that takes 0 tricks scores minus the contract. */
  defenderBatakPenalty: boolean;
  /** A successful bidder writes exactly the contract ("ihale kadar yaz") instead of the tricks won. */
  writeContract: boolean;
}
export const BATAK_DEFAULT_RULES: Readonly<BatakRules> = Object.freeze({
  noTrumpLeadUntilBroken: true,
  defenderBatakPenalty: false,
  writeContract: false,
});
export function batakRules(rules?: Partial<BatakRules> | null): BatakRules {
  return { ...BATAK_DEFAULT_RULES, ...(rules ?? {}) };
}
export interface BatakLegalOptions {
  /** True once trump has been played on another suit. Omitted means "not yet" (conservative). */
  trumpBroken?: boolean;
  rules?: Partial<BatakRules>;
}
export function legalBatakCards(
  hand: Card[],
  trick: TrickPlay[],
  trump: Suit,
  options: BatakLegalOptions = {},
): Card[] {
  if (!trick.length) {
    // Leading: trump stays closed until broken, unless the hand holds nothing else. Without
    // options this is the conservative subset of the legal leads, so callers that do not know
    // whether trump is broken can never pick a card the engine would reject.
    if (batakRules(options.rules).noTrumpLeadUntilBroken && !options.trumpBroken) {
      const open = hand.filter((c) => c.suit !== trump);
      if (open.length) return open;
    }
    return [...hand];
  }
  const lead = trick[0].card.suit,
    following = hand.filter((c) => c.suit === lead);
  if (following.length) {
    // Following suit and heading the trick is mandatory when possible.
    const highest = Math.max(...trick.filter((p) => p.card.suit === lead).map((p) => p.card.rank));
    const higher = following.filter((c) => c.rank > highest);
    return higher.length && !trick.some((p) => p.card.suit === trump && lead !== trump)
      ? higher
      : following;
  }
  const trumps = hand.filter((c) => c.suit === trump);
  if (!trumps.length) return [...hand];
  const highestTrump = Math.max(
    0,
    ...trick.filter((p) => p.card.suit === trump).map((p) => p.card.rank),
  );
  const higher = trumps.filter((c) => c.rank > highestTrump);
  return higher.length ? higher : trumps;
}
export function batakTrickWinner(trick: TrickPlay[], trump: Suit): number {
  if (!trick.length) throw new Error('TRICK_EMPTY');
  const lead = trick[0].card.suit;
  return trick.reduce((best, play) =>
    play.card.suit === best.card.suit
      ? play.card.rank > best.card.rank
        ? play
        : best
      : play.card.suit === trump
        ? play
        : best.card.suit !== trump && play.card.suit === lead
          ? play
          : best,
  ).seat;
}
export function batakScores(
  variant: BatakVariant,
  tricks: number[],
  contractSeat: number,
  contract: number,
  rules?: Partial<BatakRules>,
): number[] {
  const { defenderBatakPenalty, writeContract } = batakRules(rules),
    seats = variant === 'gommeli' ? 3 : 4,
    total = variant === 'gommeli' ? 16 : 13;
  if (
    tricks.length !== seats ||
    tricks.some((n) => !Number.isInteger(n) || n < 0) ||
    tricks.reduce((a, b) => a + b, 0) !== total ||
    !Number.isInteger(contractSeat) ||
    contractSeat < 0 ||
    contractSeat >= seats ||
    !Number.isInteger(contract) ||
    contract < 1 ||
    contract > total
  )
    throw new Error('INVALID_BATAK_RESULT');
  const made = (won: number) => (writeContract ? contract : won),
    defended = (won: number) => (defenderBatakPenalty && won === 0 ? -contract : won);
  if (variant === 'esli') {
    const team = tricks[contractSeat] + tricks[(contractSeat + 2) % 4];
    return tricks.map((_, seat) => {
      if (seat % 2 === contractSeat % 2) return team >= contract ? made(team) : -contract;
      return defended(tricks[seat % 2] + tricks[(seat % 2) + 2]);
    });
  }
  return tricks.map((won, seat) =>
    seat === contractSeat ? (won >= contract ? made(won) : -contract) : defended(won),
  );
}
/**
 * Who "won" the hand, for statistics (not for score): the bidder wins by making the contract,
 * defenders win by setting it; Eşli works per team. Koz Maça has no bidder, so a seat wins by
 * making its own commitment with the best score among the seats that did (ties all win).
 */
export function batakWinners(
  variant: BatakVariant,
  tricks: number[],
  contractSeat: number,
  contract: number,
  bids?: number[],
): boolean[] {
  if (variant === 'koz-maca') {
    const scores = tricks.map((won, seat) => (won >= (bids?.[seat] ?? 1) ? won : -1)),
      best = Math.max(...scores);
    return scores.map((score) => score >= 0 && score === best);
  }
  if (variant === 'esli') {
    const made = tricks[contractSeat] + tricks[(contractSeat + 2) % 4] >= contract;
    return tricks.map((_, seat) => (seat % 2 === contractSeat % 2 ? made : !made));
  }
  const made = tricks[contractSeat] >= contract;
  return tricks.map((_, seat) => (seat === contractSeat ? made : !made));
}
