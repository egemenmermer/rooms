import type { Card as EngineCard } from '../../../../../packages/games/src/cards';
import { t } from '../../i18n';
import { useState } from 'react';
import { Avatar } from '@rooms/design';
import { GameResults } from '../shared/GameResults';
import { array, type Card } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';
import type { TableUI } from '../shared/table-ui';
import { TurnClock } from '../shared/TurnClock';

// Presentational total of already-delivered cards; game decisions remain server-owned.
function blackjackTotal(cards: Card[]) {
  let total = 0,
    aces = 0;
  for (const card of cards) {
    if (card.rank === 14) {
      total += 11;
      aces++;
    } else total += Math.min(card.rank, 10);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}
export function ReferenceBlackjack({ game, userId, can, action, timer }: TableUI) {
  const view = game.view,
    players = array<Record<string, unknown>>(view.players),
    own = game.seats.find((seat) => seat.userId === userId),
    mine = players.find((player) => player.userId === userId);
  const hands = array<Record<string, unknown>>(mine?.hands),
    dealer = array<Card>(view.dealer);
  const [bet, setBet] = useState(20);
  return (
    <>
      <div className="rx-badges">
        <span>{t('6 deste')}</span>
        <span>Soft 17 · S17</span>
        <span>Blackjack 3:2</span>
        <span>{t('Insurance kapalı')}</span>
        <span>{t('El {hand}', { hand: game.history.length + 1 })}</span>
      </div>
      <section className="rx-blackjack-felt">
        <div className="rx-dealer">
          <small>{t('KRUPİYE')}</small>
          <div>
            {dealer.map((card) => (
              <PlayingCard key={card.id} card={card} />
            ))}
            {Array.from(
              { length: Math.max(0, Number(view.dealerHiddenCount ?? 0)) },
              (_, index) => (
                <PlayingCard key={index} />
              ),
            )}
          </div>
          {dealer.length > 0 && <strong>{blackjackTotal(dealer as EngineCard[])}</strong>}
        </div>
        <div className="rx-felt-brand" aria-hidden="true">
          BLACKJACK <span>PAYS 3:2</span>
        </div>
        <div className="rx-blackjack-hands">
          {hands.map((hand, index) => {
            const cards = array<Card>(hand.cards),
              active =
                game.status === 'playing' &&
                own?.seat === game.turn &&
                Number(mine?.activeHand) === index;
            return (
              <article
                className={`${active ? 'active' : ''} ${hand.state === 'bust' ? 'bust' : ''}`}
                key={index}
              >
                <small>
                  {t('EL {hand} ·', { hand: index + 1 })}{' '}
                  {active
                    ? t('Sıra sende')
                    : hand.state === 'bust'
                      ? t('Aştı')
                      : hand.state === 'stood'
                        ? t('Durdu')
                        : t('El tamamlandı')}
                </small>
                <div>
                  {cards.map((card) => (
                    <PlayingCard key={card.id} card={card} />
                  ))}
                </div>
                <strong>{blackjackTotal(cards as EngineCard[])}</strong>
                <p>{t('{amount} sanal fiş', { amount: Number(hand.bet) })}</p>
              </article>
            );
          })}
        </div>
      </section>
      <div className="rx-player-row">
        {game.seats.map((seat) => (
          <article className={seat.userId === userId ? 'own' : ''} key={seat.userId}>
            <Avatar name={seat.name} />
            <div>
              <strong>
                {seat.name}
                {seat.userId === userId ? t(' · sen') : ''}
              </strong>
              <small>
                {Number(
                  players.find((player) => player.userId === seat.userId)?.credits ?? seat.chips,
                )}{' '}
                {t('fiş')}
              </small>
            </div>
          </article>
        ))}
      </div>
      {game.status === 'finished' && <GameResults game={game} result={view} />}
      {own && (
        <div className="rg-hand-strip">
          <div>
            <h3>
              {own.seat === game.turn
                ? t('Sıra sende')
                : game.status === 'finished'
                  ? t('El tamamlandı')
                  : t('Oyuncu bekleniyor')}
            </h3>
          </div>
          <TurnClock timer={timer} />
          {game.status === 'playing' ? (
            <div className="rg-actions">
              {(
                [
                  ['hit', t('Kart al')],
                  ['stand', t('Dur')],
                  ['double', t('İkiye katla')],
                  ['split', t('Ayır')],
                  ['insurance', t('Sigorta al')],
                  ['decline-insurance', t('Sigorta alma')],
                  ['surrender', t('Teslim ol')],
                ] as const
              )
                // Insurance (dealer shows an ace) and surrender (table rule) appear only when the server offers them.
                .filter(
                  ([name]) =>
                    !['insurance', 'decline-insurance', 'surrender'].includes(name) || can(name),
                )
                .map(([name, label]) => (
                  <button
                    className={`button ${name === 'hit' ? 'primary' : 'secondary'}`}
                    key={name}
                    disabled={!can(name)}
                    title={
                      !can(name) ? t('Bu hamle şu anda sunucu tarafından izinli değil') : undefined
                    }
                    onClick={() => void action(name)}
                  >
                    {label}
                  </button>
                ))}
            </div>
          ) : (
            <label className="rg-lobby-bet">
              {t('Sonraki el bahsi')}
              <input
                type="number"
                min={2}
                step={2}
                max={own.chips}
                value={bet}
                onChange={(event) => setBet(Number(event.target.value))}
              />
              <button
                disabled={
                  !can('bet') ||
                  !Number.isInteger(bet) ||
                  bet < 2 ||
                  bet % 2 !== 0 ||
                  bet > own.chips
                }
                onClick={() => void action('bet', { amount: bet })}
              >
                {t('Bahsi belirle')}
              </button>
            </label>
          )}
        </div>
      )}
    </>
  );
}
