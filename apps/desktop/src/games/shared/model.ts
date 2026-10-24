import { gameNames } from '../../Kiraathane';
import { t } from '../../i18n';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';

export type GameKind = GamePublicState['kind'];
export type Card = {
  id: string;
  suit: string;
  rank: number;
};
export type Tile = {
  id: string;
  color: string;
  value: number;
  joker?: boolean;
};
export const names = gameNames;
/** Older servers titled tables with the raw game id ("blackjack"); show the real name instead. */
export const tableTitle = (title: string | undefined, kind: GameKind | undefined) =>
  !title || (kind && (title === kind || title === `${kind}`))
    ? kind
      ? names[kind]
      : title
    : title;
export const suits: Record<string, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
// Spoken names: screen readers say "Kupa As", not "14 ♥".
export const suitNames: Record<string, string> = {
  clubs: t('Sinek'),
  diamonds: t('Karo'),
  hearts: t('Kupa'),
  spades: t('Maça'),
};
export const rankNames: Record<number, string> = {
  11: t('Vale'),
  12: t('Kız'),
  13: t('Papaz'),
  14: t('As'),
};
export const tileColors: Record<string, string> = {
  red: t('Kırmızı'),
  black: t('Siyah'),
  blue: t('Mavi'),
  yellow: t('Sarı'),
};
export const array = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
