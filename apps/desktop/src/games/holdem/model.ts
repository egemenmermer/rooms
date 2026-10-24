import { locale, t } from '../../i18n';
import type {
  GamePublicState,
  HoldemTableRules,
} from '../../../../../packages/activity-protocol/src';
import { array, object } from '../shared/model';

/** A Hold'em table's rules: `view.rules` carries each game's own rules, Hold'em's on its own kind. */
export type HoldemViewRules = HoldemTableRules & {
  /** House rule from `game.create.options`; absent on servers that predate it. */
  muckLosers?: boolean;
};
export const holdemViewRules = (game: GamePublicState): HoldemViewRules | undefined =>
  game.kind === 'holdem' ? (game.view.rules as HoldemViewRules | undefined) : undefined;

/** One public betting action from `view.log` (server `HoldemLogEntry`). */
export interface HoldemLogItem {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  userId: string;
  action: 'smallBlind' | 'bigBlind' | 'fold' | 'check' | 'call' | 'raise';
  /** Chips moved by this action (a short stack pays less than asked). */
  amount: number;
  /** The player's street total after the action. */
  to: number;
  allIn: boolean;
}

export const holdemLog = (view: Record<string, unknown>): HoldemLogItem[] =>
  array<unknown>(view.log)
    .map(object)
    .filter((item) => typeof item.userId === 'string' && typeof item.action === 'string')
    .map((item) => ({
      street: String(item.street) as HoldemLogItem['street'],
      userId: String(item.userId),
      action: String(item.action) as HoldemLogItem['action'],
      amount: Number(item.amount ?? 0),
      to: Number(item.to ?? 0),
      allIn: item.allIn === true,
    }));

/**
 * Each player's latest action on the street being played (on the last street once the hand
 * ended), for the bubble over their seat. A new street starts with no bubbles.
 */
export function lastActions(log: HoldemLogItem[], stage: unknown) {
  const street = stage === 'ended' ? log[log.length - 1]?.street : stage;
  const latest = new Map<string, HoldemLogItem & { index: number }>();
  log.forEach((item, index) => {
    if (item.street === street) latest.set(item.userId, { ...item, index });
  });
  return latest;
}

/** Each player's final bet total on one street, from the log (blinds and folds included). */
export function streetTotals(log: HoldemLogItem[], street: unknown) {
  const totals = new Map<string, number>();
  for (const item of log) if (item.street === street) totals.set(item.userId, item.to);
  return totals;
}

/** The bubble text: "Gör 40", "Artır 120", "Bırak". */
export function actionLabel(item: HoldemLogItem) {
  if (item.allIn && item.action !== 'fold' && item.action !== 'check')
    return t('All-in {amount}', { amount: item.to.toLocaleString(locale) });
  switch (item.action) {
    case 'smallBlind':
      return t('Küçük kör {amount}', { amount: item.amount.toLocaleString(locale) });
    case 'bigBlind':
      return t('Büyük kör {amount}', { amount: item.amount.toLocaleString(locale) });
    case 'fold':
      return t('Bırak');
    case 'check':
      return t('Kontrol');
    case 'call':
      return t('Gör {amount}', { amount: item.amount.toLocaleString(locale) });
    case 'raise':
      return t('Artır {amount}', { amount: item.to.toLocaleString(locale) });
  }
}

/** Small and big blind of this hand, from the logged blinds. */
export function blindsOf(log: HoldemLogItem[]) {
  return {
    small: log.find((item) => item.action === 'smallBlind')?.userId,
    big: log.find((item) => item.action === 'bigBlind')?.userId,
  };
}

export interface RaiseRange {
  /** Every chip already in the pots, this street's bets included. */
  pot: number;
  /** Highest street total so far. */
  maximumBet: number;
  /** The viewer's street total. */
  streetBet: number;
  /** Server's smallest legal raise total (`maximumBet + minimumRaise`). */
  minRaise: number;
  /** All-in total: the viewer's chips plus their street bet. */
  maxRaise: number;
}
export type RaisePreset = { key: 'min' | 'half' | 'pot' | 'all-in'; label: string; amount: number };

/** Lowest total the raise input allows: the minimum raise, or all-in when the stack is shorter. */
export const raiseFloor = (range: RaiseRange) => Math.min(range.minRaise, range.maxRaise);
/** Clamp a typed total into the server's raise range. */
export const clampRaise = (range: RaiseRange, amount: number) =>
  Math.max(raiseFloor(range), Math.min(range.maxRaise, Math.round(amount)));

/**
 * Raise shortcuts as street totals. A pot-sized raise is a call plus the pot after that call;
 * every preset is clamped to the range the server accepts, so none can send an illegal total.
 */
export function raisePresets(range: RaiseRange): RaisePreset[] {
  const call = Math.max(0, range.maximumBet - range.streetBet),
    afterCall = range.pot + call;
  return [
    { key: 'min', label: t('Min'), amount: raiseFloor(range) },
    { key: 'half', label: t('½ pot'), amount: clampRaise(range, range.maximumBet + afterCall / 2) },
    { key: 'pot', label: t('Pot'), amount: clampRaise(range, range.maximumBet + afterCall) },
    { key: 'all-in', label: 'All-in', amount: range.maxRaise },
  ];
}

/** Chip denominations by colour, largest first (5/25/100/500 as at a home table, plus 1 and 1000). */
export const denominations = [1000, 500, 100, 25, 5, 1] as const;
/** The coloured chips that make up an amount, largest first, at most `limit` discs. */
export function chipsFor(amount: number, limit = 10) {
  const discs: number[] = [];
  let left = Math.max(0, Math.floor(amount));
  for (const value of denominations) {
    while (left >= value && discs.length < limit) {
      discs.push(value);
      left -= value;
    }
  }
  return discs;
}

/** Board slot of each seat; the viewer (or the bottom slot for spectators) sits at the bottom. */
const slots: Record<number, number[]> = {
  1: [3],
  2: [0, 3],
  3: [0, 2, 3],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 3, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 4, 6, 7, 8],
  8: [0, 1, 2, 3, 4, 5, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};
export function seatPosition(capacity: number, seat: number, ownSeat: number | undefined) {
  const positions = slots[capacity] ?? slots[9];
  const bottom = positions.indexOf(capacity > 6 ? 4 : 3);
  return positions[(seat - (ownSeat ?? bottom) + bottom + capacity) % capacity];
}
