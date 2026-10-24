/**
 * The 101 view carries no "last action"; the table derives short move lines by comparing two consecutive
 * public views (discard tops, tile counts, melds, gösterge and penalties). Nothing hidden is used.
 */
import { t } from '../../i18n';
import { array, type Tile } from '../shared/model';
import { tileLabel, type TileFace } from './OkeyTile';

type View = Record<string, unknown>;
type Meld = { owner: number; tiles: Tile[]; pairs: boolean };
export type PenaltyEntry = { seat: number; reason: string; amount: number };

export function penaltyReason(reason: string) {
  switch (reason) {
    case 'islek':
      return t('İşlek taş attı');
    case 'pickup':
      return t('Yandan aldığı taşı kullanmadı');
    case 'reclaimed-okey':
      return t('Geri aldığı okeyi kullanmadı');
    case 'gosterge':
      return t('Göstergeyi gösterdi');
    default:
      return reason;
  }
}
export const signed = (amount: number) => (amount > 0 ? `+${amount}` : String(amount));

const tops = (view: View) => array<Tile[]>(view.discards).map((pile) => pile?.at(-1) ?? null);
const counts = (view: View) =>
  array<{ seat: number; count?: number }>(view.hands).map((hand) => Number(hand.count ?? 0));

export function describeMoves(
  before: View,
  after: View,
  nameOf: (seat: number) => string,
  okey: TileFace | null,
): string[] {
  const lines: string[] = [];
  const topsBefore = tops(before),
    topsAfter = tops(after),
    countBefore = counts(before),
    countAfter = counts(after);
  const takenFrom = new Set<number>();
  for (let seat = 0; seat < 4; seat++) {
    const taker = (seat + 1) % 4,
      gone = topsBefore[seat];
    if (gone && topsAfter[seat]?.id !== gone.id && (countAfter[taker] ?? 0) > (countBefore[taker] ?? 0)) {
      takenFrom.add(taker);
      lines.push(
        t('{name} yandan {tile} aldı', { name: nameOf(taker), tile: tileLabel(gone, okey) }),
      );
    }
  }
  for (let seat = 0; seat < 4; seat++)
    if ((countAfter[seat] ?? 0) > (countBefore[seat] ?? 0) && !takenFrom.has(seat))
      lines.push(t('{name} ortadan çekti', { name: nameOf(seat) }));
  const meldsBefore = array<Meld>(before.melds),
    meldsAfter = array<Meld>(after.melds);
  const opened = new Map<number, number>();
  meldsAfter.slice(meldsBefore.length).forEach((meld) => {
    opened.set(meld.owner, (opened.get(meld.owner) ?? 0) + 1);
  });
  opened.forEach((count, owner) =>
    lines.push(t('{name} {count} per açtı', { name: nameOf(owner), count })),
  );
  const mover = typeof before.turn === 'number' ? before.turn : null;
  if (
    mover !== null &&
    meldsBefore.some((meld, index) =>
      meldsAfter[index]
        ? meldsAfter[index].tiles.map((tile) => tile.id).join() !==
          meld.tiles.map((tile) => tile.id).join()
        : false,
    )
  )
    lines.push(t('{name} yerdeki pere taş işledi', { name: nameOf(mover) }));
  for (let seat = 0; seat < 4; seat++) {
    const top = topsAfter[seat];
    if (top && top.id !== topsBefore[seat]?.id && (countAfter[seat] ?? 0) < (countBefore[seat] ?? 0))
      lines.push(t('{name} {tile} attı', { name: nameOf(seat), tile: tileLabel(top, okey) }));
  }
  array<PenaltyEntry>(after.penaltyLog)
    .slice(array(before.penaltyLog).length)
    .forEach((entry) =>
      lines.push(
        t('{name} · {reason} · {amount}', {
          name: nameOf(entry.seat),
          reason: penaltyReason(entry.reason),
          amount: signed(entry.amount),
        }),
      ),
    );
  return lines;
}
