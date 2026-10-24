import { t } from '../../i18n';
import type { GameHistoryEntry } from '../registry';
import { array, object, type Card } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';
import { pokerCategory } from './poker-labels';

export function HoldemHistory({ entry }: { entry: GameHistoryEntry }) {
  const result = entry.result,
    historical = entry.seats ?? [],
    name = (id: string) => historical.find((seat) => seat.userId === id)?.name ?? t('Katılımcı');
  const players = array<Record<string, unknown>>(result.players);
    return (
      <>
        <div className="rh-board-cards">
          {array<Card>(result.board).map((card) => (
            <PlayingCard key={card.id} card={card} />
          ))}
        </div>
        <div className="rh-detail-rows">
          {players.length
            ? players.map((player) => (
                <div key={String(player.userId)}>
                  <span>{name(String(player.userId))}</span>
                  <strong>
                    {Number(player.net) > 0 ? '+' : ''}
                    {t('{amount} fiş', { amount: Number(player.net) })}
                  </strong>
                </div>
              ))
            : Object.entries(object(result.payouts)).map(([id, amount]) => (
                <div key={id}>
                  <span>{name(id)}</span>
                  <strong>{t('{amount} fiş ödendi', { amount: Number(amount) })}</strong>
                </div>
              ))}
        </div>
        {Object.entries(object(result.revealedCards)).map(([id, cards]) => (
          <div className="rh-revealed-hand" key={id}>
            <span>{name(id)}</span>
            <div>
              {array<Card>(cards).map((card) => (
                <PlayingCard key={card.id} card={card} />
              ))}
            </div>
            <small>
              {pokerCategory(String(object(object(result.showdown)[id]).category ?? ''))}
            </small>
          </div>
        ))}
        <p>
          {result.settlementReason === 'uncontested'
            ? t('Diğer oyuncular eli bıraktı.')
            : t('Showdown sonucu')}
        </p>
        {!result.revealedCards && <p>{t('Bu eski kayıtta açılmış kartlar bulunmuyor.')}</p>}
        <p>{t('Katlanan oyuncuların gizli kartları paylaşılmaz.')}</p>
      </>
    );
}
