import { t } from '../../i18n';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { pokerCategory } from '../holdem/poker-labels';
import { OkeyTileView } from '../okey101/OkeyTile';
import { array, object, suits, type Card, type GameKind, type Tile } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';

export function HistoryDetails({
  kind,
  entry,
}: {
  kind: GameKind;
  entry: GamePublicState['history'][number];
}) {
  const result = entry.result,
    historical = entry.seats ?? [],
    name = (id: string) => historical.find((seat) => seat.userId === id)?.name ?? t('Katılımcı');
  const players = array<Record<string, unknown>>(result.players),
    scores = array<number>(result.scores),
    contract = object(result.contract);
  if (kind === 'holdem')
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
  if (kind === 'blackjack')
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
  return (
    <>
      {kind === 'batak' && Object.keys(contract).length > 0 && (
        <div className="rh-history-rules">
          <span>
            {t('İhale {bid} ·', { bid: Number(contract.bid) })}{' '}
            {historical.find((seat) => seat.position === Number(contract.bidder))?.name ??
              t('Katılımcı')}
          </span>
          <span>{t('Koz {trump}', { trump: suits[String(contract.trump)] ?? '—' })}</span>
          <span>{String(result.variant ?? 'Batak')}</span>
        </div>
      )}
      {kind === '101' && result.lastDiscard && (
        <div className="rh-last-discard">
          <span>{t('Son atılan taş')}</span>
          <OkeyTileView tile={result.lastDiscard as Tile} small />
        </div>
      )}
      <div className="rh-detail-rows">
        {scores.map((score, position) => {
          const seat = historical.find((seat) => seat.position === position);
          return (
            <div key={position}>
              <span>
                {seat?.name ?? t('Koltuk sırası {number}', { number: position + 1 })}
                {kind === 'batak' && array<number>(result.tricks)[position] !== undefined
                  ? ` · ${t('{count} el', { count: array<number>(result.tricks)[position] ?? 0 })}`
                  : ''}
                {kind === '101' && typeof result.winner === 'number' && result.winner === position
                  ? t(' · Bitirdi')
                  : ''}
              </span>
              <strong>{t('{score} puan', { score })}</strong>
            </div>
          );
        })}
      </div>
      {kind === 'batak' && array<number[]>(result.teams).length > 0 && (
        <div className="rh-history-teams">
          {array<number[]>(result.teams).map((team, index) => (
            <article key={index}>
              <small>{t('Takım {number}', { number: index + 1 })}</small>
              <strong>
                {team
                  .map(
                    (position) =>
                      historical.find((seat) => seat.position === position)?.name ?? t('Katılımcı'),
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
      )}
      {!entry.seats && <p>{t('Bu eski kayıtta oyuncu eşlemesi bulunmuyor.')}</p>}
      <p>
        {kind === '101'
          ? t('İlk açılış puanı ve son işlenen taş bu kayıtta bulunmuyor.')
          : t('El sonuçları sunucuda kaydedilen puanları gösterir.')}
      </p>
    </>
  );
}
