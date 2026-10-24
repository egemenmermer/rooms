import { t } from '../../i18n';
import type { GameHistoryEntry } from '../registry';
import { array, object } from '../shared/model';

/**
 * A finished Pişti match in the history page: points per deal and the match total per side. The
 * service records `{ totals, winners, rounds: [{ points }] }` with points per player (partners carry
 * the same team points), so a 4-player match is read as two sides.
 */
export function PistiHistory({ entry }: { entry: GameHistoryEntry }) {
  const result = entry.result,
    totals = array<number>(result.totals),
    rounds = array<Record<string, unknown>>(result.rounds).map((round) =>
      array<number>(object(round).points),
    ),
    winners = array<number>(result.winners),
    historical = entry.seats ?? [],
    teams = totals.length === 4,
    sides = teams ? [0, 1] : totals.map((_, index) => index),
    name = (position: number) =>
      historical.find((seat) => seat.position === position)?.name ??
      t('Koltuk sırası {number}', { number: position + 1 }),
    sideLabel = (side: number) => (teams ? `${name(side)} + ${name(side + 2)}` : name(side));
  if (!totals.length) return <p>{t('Bu kayıtta maç puanı bulunmuyor.')}</p>;
  return (
    <>
      <div className="rh-detail-rows">
        {sides.map((side) => (
          <div key={side}>
            <span>
              {sideLabel(side)}
              {winners.includes(side) ? ` · ${t('Kazandı')}` : ''}
            </span>
            <strong>{t('{score} puan', { score: totals[side] ?? 0 })}</strong>
          </div>
        ))}
      </div>
      {rounds.length > 0 && (
        <table className="pp-summary pp-history">
          <thead>
            <tr>
              <th scope="col">{t('El')}</th>
              {sides.map((side) => (
                <th scope="col" key={side} title={sideLabel(side)}>
                  {sideLabel(side)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((points, index) => (
              <tr key={index}>
                <th scope="row">{index + 1}</th>
                {sides.map((side) => (
                  <td key={side}>{points[side] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!entry.seats && <p>{t('Bu eski kayıtta oyuncu eşlemesi bulunmuyor.')}</p>}
      <p>{t('Maç puanları sunucuda kaydedilen el sonuçlarının toplamıdır.')}</p>
    </>
  );
}

/** The viewer's match total on a history row. */
export function pistiHistoryResult(
  result: Record<string, unknown>,
  entry: GameHistoryEntry,
  userId?: string,
) {
  const own = entry.seats?.find((seat) => seat.userId === userId),
    totals = array<number>(result.totals);
  return own && totals[own.position] !== undefined
    ? t('{score} puan', { score: totals[own.position] })
    : t('Maç puanları');
}
