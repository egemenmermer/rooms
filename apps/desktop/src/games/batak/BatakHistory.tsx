import { t } from '../../i18n';
import { ScoreHistory } from '../card-history/CardHistory';
import type { GameHistoryEntry } from '../registry';
import { array, object, suits } from '../shared/model';

export function BatakHistory({ entry }: { entry: GameHistoryEntry }) {
  const result = entry.result,
    historical = entry.seats ?? [];
  const scores = array<number>(result.scores),
    contract = object(result.contract);
  return (
    <ScoreHistory
      entry={entry}
      header={
        Object.keys(contract).length > 0 && (
          <div className="rh-history-rules">
            <span>
              {t('İhale {bid} ·', { bid: Number(contract.bid) })}{' '}
              {historical.find((seat) => seat.position === Number(contract.bidder))?.name ??
                t('Katılımcı')}
            </span>
            <span>{t('Koz {trump}', { trump: suits[String(contract.trump)] ?? '—' })}</span>
            <span>{String(result.variant ?? 'Batak')}</span>
          </div>
        )
      }
      seatSuffix={(position) =>
        array<number>(result.tricks)[position] !== undefined
          ? ` · ${t('{count} el', { count: array<number>(result.tricks)[position] ?? 0 })}`
          : ''
      }
      footer={
        array<number[]>(result.teams).length > 0 && (
          <div className="rh-history-teams">
            {array<number[]>(result.teams).map((team, index) => (
              <article key={index}>
                <small>{t('Takım {number}', { number: index + 1 })}</small>
                <strong>
                  {team
                    .map(
                      (position) =>
                        historical.find((seat) => seat.position === position)?.name ??
                        t('Katılımcı'),
                    )
                    .join(' + ')}
                </strong>
                <span>
                  {t('{score} puan', {
                    score: team.reduce((sum, position) => sum + (scores[position] ?? 0), 0),
                  })}
                </span>
              </article>
            ))}
          </div>
        )
      }
    />
  );
}
