import { t } from '../../i18n';
import type { GameHistoryEntry } from '../registry';
import { array, type Card } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';

export function BlackjackHistory({ entry }: { entry: GameHistoryEntry }) {
  const result = entry.result,
    historical = entry.seats ?? [],
    name = (id: string) => historical.find((seat) => seat.userId === id)?.name ?? t('Katılımcı');
  const players = array<Record<string, unknown>>(result.players);
  return (
    <>
      {array<Card>(result.dealer).length > 0 && (
        <div className="rh-dealer-history">
          <small>{t('Krupiye · {total}', { total: Number(result.dealerTotal) })}</small>
          <div className="rh-board-cards">
            {array<Card>(result.dealer).map((card) => (
              <PlayingCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      )}
      {players.length ? (
        players.map((player) => (
          <section className="rh-blackjack-history" key={String(player.userId)}>
            <h3>
              {name(String(player.userId))}{' '}
              <span>
                {Number(player.net) > 0 ? '+' : ''}
                {t('{amount} fiş', { amount: Number(player.net) })}
              </span>
            </h3>
            {array<Record<string, unknown>>(player.hands).map((hand) => (
              <div className="rh-history-hand" key={Number(hand.hand)}>
                <div>
                  {array<Card>(hand.cards).map((card) => (
                    <PlayingCard key={card.id} card={card} />
                  ))}
                </div>
                <div>
                  <strong>
                    {t('El {hand} · {total}', {
                      hand: Number(hand.hand) + 1,
                      total: Number(hand.total),
                    })}
                  </strong>
                  <small>
                    {t('Bahis {amount} ·', { amount: Number(hand.bet) })}{' '}
                    {(
                      {
                        win: t('Kazandı'),
                        lose: t('Kaybetti'),
                        push: t('Berabere'),
                        blackjack: 'Blackjack',
                      } as Record<string, string>
                    )[String(hand.outcome)] ?? String(hand.outcome)}
                    {hand.split ? ' · Split' : ''}
                  </small>
                </div>
              </div>
            ))}
          </section>
        ))
      ) : (
        <>
          <div className="rh-detail-rows">
            {array<Record<string, unknown>>(result.results).map((item, index) => (
              <div key={index}>
                <span>
                  {t('{name} · El {hand}', {
                    name: name(String(item.userId)),
                    hand: Number(item.hand) + 1,
                  })}
                </span>
                <strong>
                  {t('{outcome} · {amount} fiş geri aldı', {
                    outcome: String(item.outcome),
                    amount: Number(item.returned),
                  })}
                </strong>
              </div>
            ))}
          </div>
          <p>{t('Bu eski kayıtta kartlar ve başlangıç bahsi bulunmuyor.')}</p>
        </>
      )}
    </>
  );
}
