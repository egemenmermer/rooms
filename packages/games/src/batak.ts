import type { Card, Suit } from './cards';
export type BatakVariant = 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
export interface TrickPlay {
  seat: number;
  card: Card;
}
export function legalBatakCards(hand: Card[], trick: TrickPlay[], trump: Suit): Card[] {
  if (!trick.length) return [...hand];
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
): number[] {
  const seats = variant === 'gommeli' ? 3 : 4,
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
  if (variant === 'esli') {
    const team = tricks[contractSeat] + tricks[(contractSeat + 2) % 4];
    return tricks.map((_, seat) =>
      seat % 2 === contractSeat % 2
        ? team >= contract
          ? team
          : -contract
        : tricks[seat % 2] + tricks[(seat % 2) + 2],
    );
  }
  return tricks.map((won, seat) =>
    seat === contractSeat ? (won >= contract ? won : -contract) : won,
  );
}
