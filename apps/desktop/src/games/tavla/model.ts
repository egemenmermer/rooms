import type {
  TavlaFrom,
  TavlaStep,
  TavlaTo,
  TavlaView,
} from '../../../../../packages/games/src/tavla';
import type { MatchView } from '../../../../../packages/games/src/match';
import { t } from '../../i18n';

export type { TavlaFrom, TavlaStep, TavlaTo };
/** What the service sends for a Tavla table: the round view plus the match (`series`). */
export type TavlaTableView = TavlaView & {
  series?: MatchView<TavlaView>;
  legalActions?: string[];
};

export const MATCH_TARGETS = [3, 5, 7] as const;

/**
 * Where a point index sits on the drawn board for a viewer. The viewer's home board is bottom
 * right; seat 0 moves toward index 0, seat 1 toward index 23, so seat 1 sees the board mirrored
 * (`23 - index`). Spectators get seat 0's side. `col` is 0..11 from the left; the bar is between
 * columns 5 and 6.
 */
export function pointSlot(
  index: number,
  you: number | null,
): { row: 'top' | 'bottom'; col: number } {
  const local = you === 1 ? 23 - index : index;
  return local < 12 ? { row: 'bottom', col: 11 - local } : { row: 'top', col: local - 12 };
}

/** The seat drawn at the bottom (the viewer's own side, seat 0 for spectators). */
export const bottomSeat = (you: number | null) => (you === 1 ? 1 : 0);

/** A point's number (1..24) from `seat`'s side, as players call it ("6'lık hane"). */
export const pointNumber = (index: number, seat: number) => (seat === 0 ? index + 1 : 24 - index);

export function targetsFrom(legal: readonly TavlaStep[], from: TavlaFrom): TavlaTo[] {
  const seen = new Set<TavlaTo>();
  for (const step of legal) if (step.from === from) seen.add(step.to);
  return [...seen];
}

export function movableSources(legal: readonly TavlaStep[]): TavlaFrom[] {
  return [...new Set(legal.map((step) => step.from))];
}

/** The dice still to play, doubles as four dice. */
export function diceFaces(view: Pick<TavlaView, 'dice' | 'remaining'>) {
  const dice = view.dice ?? [];
  const all =
    dice.length === 2 && dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice;
  const left = [...view.remaining];
  // Mark used dice from the end so "5 5 5 5" with two left shows the first two as open.
  return all.map((value) => {
    const at = left.indexOf(value);
    if (at < 0) return { value, used: true };
    left.splice(at, 1);
    return { value, used: false };
  });
}

/**
 * The opponent's moves to draw as arrows: their live steps while they move, otherwise their last
 * finished turn until the viewer rolls (once the viewer is moving, nothing).
 */
export function opponentTrail(view: TavlaView, you: number | null): TavlaStep[] {
  const opponent = you === null ? null : 1 - you;
  if (view.phase === 'moving' && view.turn !== you) return view.moves;
  if (view.phase === 'moving') return [];
  const last = view.lastTurn;
  if (!last || last.passed) return [];
  if (opponent !== null && last.seat !== opponent) return [];
  return last.moves;
}

/** "5'e" style suffix for match lengths (Turkish vowel harmony: 3'e, 5'e, 7'ye). */
export function matchToLabel(matchTo: number) {
  return matchTo === 3
    ? t("3'e")
    : matchTo === 5
      ? t("5'e")
      : matchTo === 7
        ? t("7'ye")
        : String(matchTo);
}
