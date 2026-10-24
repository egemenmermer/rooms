import { t, tr } from '../../i18n';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { array } from './model';

export function GameResults({ game, result }: { game: GamePublicState; result: Record<string, unknown> }) {
  const scores = array<number>(result.scores),
    results = array<Record<string, unknown>>(result.results);
  if (scores.length)
    return (
      <table className="rx-results">
        <thead>
          <tr>
            <th>{t('Oyuncu')}</th>
            <th>{t('Puan')}</th>
          </tr>
        </thead>
        <tbody>
          {game.seats.map((seat, index) => (
            <tr key={seat.userId}>
              <td>{seat.name}</td>
              <td>{scores[seat.seat] ?? scores[index] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (results.length)
    return (
      <div className="rx-results">
        {results.map((item, index) => (
          <p key={index}>
            {t('{name} · El {hand}', {
              name: game.seats.find((seat) => seat.userId === item.userId)?.name ?? t('Oyuncu'),
              hand: Number(item.hand) + 1,
            })}{' '}
            ·{' '}
            {(
              {
                win: t('Kazandı'),
                lose: t('Kaybetti'),
                push: t('Berabere'),
                blackjack: 'Blackjack',
              } as Record<string, string>
            )[String(item.outcome)] ?? String(item.outcome ?? t('Sonuç'))}{' '}
            {t('· {amount} fiş geri aldı', { amount: Number(item.returned) })}
          </p>
        ))}
      </div>
    );
  return <p>{t('Sonuç ayrıntısı bu yanıtta bulunmuyor.')}</p>;
}
