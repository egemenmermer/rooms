import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { t } from '../../i18n';
import { ClassicTileView } from './ClassicTile';
import type { OkeyTableView } from './OkeyClassicTable';

/** Why the round ended, in one line. */
export function okeyEndReason(
  view: Pick<OkeyTableView, 'outcome' | 'finish'>,
  nameOf: (seat: number) => string,
) {
  const finish = view.finish;
  if (view.outcome === 'stock-exhausted' || !finish)
    return t('Ortada taş kalmadı · Kazanan yok');
  const name = nameOf(finish.seat);
  if (finish.pairs && finish.okeyDiscard)
    return t('{name} çifte gidip okey atarak bitirdi', { name });
  if (finish.pairs) return t('{name} çifte gidip bitirdi', { name });
  if (finish.okeyDiscard) return t('{name} okey atarak bitirdi', { name });
  return t('{name} bitirdi', { name });
}

/** End of round: the winner's open rack, the reason, this round's points and the table totals. */
export function OkeyRoundSummary({
  game,
  view,
  nameOf,
}: {
  game: GamePublicState;
  view: OkeyTableView;
  nameOf(seat: number): string;
}) {
  const okey = view.okey ?? { color: 'red', value: 1 },
    finish = view.finish ?? null,
    points = view.result?.points ?? [],
    countdown = view.options?.scoring !== 'winner',
    start = view.options?.startingPoints ?? 20,
    order = [...game.seats].sort((a, b) => a.seat - b.seat);
  return (
    <section className="ok-summary" aria-label={t('El sonucu')}>
      <header>
        <h3>{okeyEndReason(view, nameOf)}</h3>
        {view.indicatorShown && (
          <p>
            {t('{name} göstergeyi gösterdi', { name: nameOf(view.indicatorShown.seat) })}
          </p>
        )}
      </header>
      {finish && (
        <div className="ok-open-rack" aria-label={t('{name} ıstakası', { name: nameOf(finish.seat) })}>
          {finish.melds.map((meld, index) => (
            <span className="ok-meld" key={index}>
              {meld.map((tile) => (
                <ClassicTileView key={tile.id} tile={tile} okey={okey} small />
              ))}
            </span>
          ))}
          <span className="ok-meld finishing">
            <small>{t('Bitiren taş')}</small>
            <ClassicTileView tile={finish.discard} okey={okey} small />
          </span>
        </div>
      )}
      <table className="rx-results ok-scores">
        <thead>
          <tr>
            <th>{t('Oyuncu')}</th>
            <th>{t('Bu el')}</th>
            <th>{countdown ? t('Kalan puan') : t('Toplam')}</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3].map((seat) => {
            const score = order[seat] ? view.statistics?.[order[seat].userId]?.score : undefined;
            return (
              <tr key={seat} className={view.result?.winners.includes(seat) ? 'winner' : ''}>
                <td>{nameOf(seat)}</td>
                <td>{points[seat] === undefined ? '—' : signed(points[seat])}</td>
                <td>{score === undefined ? '—' : countdown ? start + score : score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
