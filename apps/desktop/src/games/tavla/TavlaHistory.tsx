import { t } from '../../i18n';
import type { GameHistoryEntry } from '../registry';
import { array } from '../shared/model';

type Round = { points?: number[]; winners?: number[] };

/** A finished Tavla match: final score and one line per round (a 2-point round was a mars). */
export function TavlaHistory({ entry }: { entry: GameHistoryEntry }) {
  const result = entry.result,
    totals = array<number>(result.totals),
    rounds = array<Round>(result.rounds),
    seatName = (position: number) =>
      entry.seats?.find((seat) => seat.position === position)?.name ??
      t('Koltuk sırası {number}', { number: position + 1 });
  return (
    <>
      <div className="rh-detail-rows">
        {totals.map((total, position) => (
          <div key={position}>
            <span>{seatName(position)}</span>
            <strong>{t('{score} puan', { score: total })}</strong>
          </div>
        ))}
      </div>
      {rounds.length > 0 && (
        <ol className="rh-history-rules tv-history-rounds">
          {rounds.map((round, index) => {
            const winner = round.winners?.[0] ?? 0,
              points = round.points?.[winner] ?? 0;
            return (
              <li key={index}>
                {t('El {hand}', { hand: index + 1 })} · {seatName(winner)} ·{' '}
                {points >= 2 ? t('Mars! (2 puan)') : t('{score} puan', { score: points })}
              </li>
            );
          })}
        </ol>
      )}
      {!entry.seats && <p>{t('Bu eski kayıtta oyuncu eşlemesi bulunmuyor.')}</p>}
    </>
  );
}

/** The viewer's match points on a history row. */
export function tavlaHistoryResult(
  result: Record<string, unknown>,
  entry: GameHistoryEntry,
  userId?: string,
) {
  const own = entry.seats?.find((seat) => seat.userId === userId),
    totals = array<number>(result.totals);
  return own && totals[own.position] !== undefined
    ? t('{score} puan', { score: totals[own.position] })
    : t('Koltuk puanları');
}
