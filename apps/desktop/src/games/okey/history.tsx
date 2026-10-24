import type { ClassicTile } from '../../../../../packages/games/src/okey-classic';
import { t } from '../../i18n';
import type { GameHistoryEntry } from '../registry';
import { array, object } from '../shared/model';
import { ClassicTileView } from './ClassicTile';
import { okeyEndReason, signed } from './OkeyRoundSummary';

/** A finished classic Okey round in the history page: reason, the open winning rack and points. */
export function OkeyClassicHistory({ entry }: { entry: GameHistoryEntry }) {
  const result = entry.result,
    points = array<number>(result.points),
    okey = object(result.okey) as { color: string; value: number },
    finish = (result.finish ?? null) as {
      seat: number;
      discard: ClassicTile;
      melds: ClassicTile[][];
      pairs: boolean;
      okeyDiscard: boolean;
    } | null;
  const nameOf = (position: number) =>
    entry.seats?.find((seat) => seat.position === position)?.name ??
    t('Koltuk sırası {number}', { number: position + 1 });
  return (
    <>
      <p>
        {okeyEndReason(
          {
            outcome: result.outcome === 'stock-exhausted' ? 'stock-exhausted' : 'finished',
            finish: finish ?? null,
          },
          nameOf,
        )}
      </p>
      {finish && (
        <div className="ok-open-rack">
          {array<ClassicTile[]>(finish.melds).map((meld, index) => (
            <span className="ok-meld" key={index}>
              {meld.map((tile) => (
                <ClassicTileView key={tile.id} tile={tile} okey={okey} small />
              ))}
            </span>
          ))}
        </div>
      )}
      <div className="rh-detail-rows">
        {points.map((score, position) => (
          <div key={position}>
            <span>{nameOf(position)}</span>
            <strong>{t('{score} puan', { score: signed(score) })}</strong>
          </div>
        ))}
      </div>
      {!entry.seats && <p>{t('Bu eski kayıtta oyuncu eşlemesi bulunmuyor.')}</p>}
    </>
  );
}

/** The viewer's own points on a history row. */
export function okeyClassicHistoryResult(
  result: Record<string, unknown>,
  entry: GameHistoryEntry,
  userId?: string,
) {
  const own = entry.seats?.find((seat) => seat.userId === userId),
    points = array<number>(result.points);
  return own && points[own.position] !== undefined
    ? t('{score} puan', { score: signed(points[own.position]) })
    : t('Koltuk puanları');
}
