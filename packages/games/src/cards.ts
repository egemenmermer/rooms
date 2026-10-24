import { secureRandomInt } from './random';
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export interface Card {
  id: string;
  suit: Suit;
  rank: number;
}
export function shuffledDeck(copies = 1): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < copies; copy++)
    for (const suit of ['clubs', 'diamonds', 'hearts', 'spades'] as const)
      for (let rank = 2; rank <= 14; rank++)
        deck.push({ id: `${copy}-${suit}-${rank}`, suit, rank });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
/** Lexicographic score: high card=0 through straight flush=8. Ace can be low in a wheel. */
export function evaluateFive(cards: Card[]): number[] {
  if (cards.length !== 5 || new Set(cards.map((c) => c.id)).size !== 5)
    throw new Error('FIVE_UNIQUE_CARDS_REQUIRED');
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const unique = [...new Set(ranks)];
  const straightHigh =
    unique.length === 5 && unique[0] - unique[4] === 4
      ? unique[0]
      : unique.join(',') === '14,5,4,3,2'
        ? 5
        : 0;
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const counts = unique
    .map((rank) => ({ rank, count: ranks.filter((r) => r === rank).length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  if (flush && straightHigh) return [8, straightHigh];
  if (counts[0].count === 4) return [7, counts[0].rank, counts[1].rank];
  if (counts[0].count === 3 && counts[1].count === 2) return [6, counts[0].rank, counts[1].rank];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (counts[0].count === 3) return [3, counts[0].rank, ...counts.slice(1).map((c) => c.rank)];
  if (counts[0].count === 2 && counts[1].count === 2)
    return [
      2,
      Math.max(counts[0].rank, counts[1].rank),
      Math.min(counts[0].rank, counts[1].rank),
      counts[2].rank,
    ];
  if (counts[0].count === 2) return [1, counts[0].rank, ...counts.slice(1).map((c) => c.rank)];
  return [0, ...ranks];
}
export function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}
export const holdemCategories = [
  'high-card',
  'one-pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
] as const;
export interface EvaluatedHoldemHand {
  category: (typeof holdemCategories)[number];
  score: number[];
  bestFiveCardIds: string[];
}
/** Uses the same five-card scoring as settlement; ties select a stable first subset. */
export function evaluateHoldemDetailed(cards: Card[]): EvaluatedHoldemHand {
  if (cards.length < 5 || cards.length > 7 || new Set(cards.map((c) => c.id)).size !== cards.length)
    throw new Error('FIVE_TO_SEVEN_UNIQUE_CARDS_REQUIRED');
  let best: number[] = [],
    bestFiveCardIds: string[] = [];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]],
              score = evaluateFive(five);
            if (!best.length || compareScores(score, best) > 0) {
              best = score;
              bestFiveCardIds = five.map((card) => card.id);
            }
          }
  return { category: holdemCategories[best[0]], score: best, bestFiveCardIds };
}
export function evaluateHoldem(cards: Card[]): number[] {
  return evaluateHoldemDetailed(cards).score;
}
export interface PotContribution {
  userId: string;
  amount: number;
  folded: boolean;
}
export function sidePots(
  contributions: PotContribution[],
): { amount: number; eligible: string[] }[] {
  if (
    contributions.some((c) => !Number.isSafeInteger(c.amount) || c.amount < 0) ||
    new Set(contributions.map((c) => c.userId)).size !== contributions.length
  )
    throw new Error('INVALID_CONTRIBUTIONS');
  const levels = [...new Set(contributions.map((c) => c.amount).filter((n) => n > 0))].sort(
    (a, b) => a - b,
  );
  let previous = 0;
  return levels.map((level) => {
    const involved = contributions.filter((c) => c.amount >= level);
    const pot = {
      amount: (level - previous) * involved.length,
      eligible: involved.filter((c) => !c.folded).map((c) => c.userId),
    };
    previous = level;
    return pot;
  });
}
