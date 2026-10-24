import { legalBatakCards } from '../../../../../packages/games/src/batak';
import type { Card as EngineCard, Suit } from '../../../../../packages/games/src/cards';
import { t } from '../../i18n';
import { useEffect, useState } from 'react';
import { Avatar } from '@rooms/design';
import { GameResults } from '../shared/GameResults';
import { array, suits, type Card } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';
import type { TableUI } from '../shared/table-ui';
import { TurnClock } from '../shared/TurnClock';

export function ReferenceBatak({ game, userId, can, action, timer }: TableUI) {
  const view = game.view,
    own = game.seats.find((seat) => seat.userId === userId),
    hands = array<Record<string, unknown>>(view.hands),
    mine = hands.find((hand) => hand.seat === own?.seat),
    cards = array<Card>(mine?.cards),
    stage = String(view.stage),
    variant = String(view.variant);
  const minimum =
      variant === 'koz-maca'
        ? 1
        : Math.max(variant === 'esli' || variant === 'gommeli' ? 8 : 5, Number(view.bid ?? 0) + 1),
    maximum = variant === 'gommeli' ? 16 : 13;
  const [bid, setBid] = useState(minimum),
    [selected, setSelected] = useState<string[]>([]),
    [trump, setTrump] = useState('spades');
  const cardIds = cards.map((card) => card.id).join('|');
  useEffect(() => {
    setBid(minimum);
    setSelected([]);
    setTrump('spades');
  }, [stage, game.history.length, own?.seat]);
  useEffect(() => {
    setSelected((ids) => ids.filter((id) => cards.some((card) => card.id === id)));
  }, [cardIds]);
  const trick = array<{ seat: number; card: Card }>(view.trick),
    valid =
      stage === 'playing' && cards.length
        ? legalBatakCards(
            cards as EngineCard[],
            trick as { seat: number; card: EngineCard }[],
            String(view.trump) as Suit,
          ).map((card) => card.id)
        : [];
  const bids = array<number>(view.bids),
    tricks = array<number>(view.tricks);
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 4 ? [...ids, id] : ids,
    );
  return (
    <>
      <div className="rx-badges">
        <span>
          {(
            {
              ihaleli: t('İhaleli'),
              esli: t('Eşli'),
              'koz-maca': t('Koz Maça'),
              gommeli: t('Gömmeli'),
            } as Record<string, string>
          )[variant] ?? 'Batak'}
        </span>
        <span>{t('İhale {bid}', { bid: view.bid ? String(view.bid) : '—' })}</span>
        <span>
          {t('Koz {trump}', {
            trump:
              stage === 'bidding' && variant !== 'koz-maca'
                ? '—'
                : (suits[String(view.trump)] ?? '—'),
          })}
        </span>
        <span>{t('El {hand}', { hand: game.history.length + 1 })}</span>
      </div>
      {['bidding', 'trump', 'bury'].includes(stage) ? (
        <div className="rx-batak-setup">
          <section>
            <header>
              <h2>
                {stage === 'bidding'
                  ? t('İhale ver')
                  : stage === 'trump'
                    ? t('Koz seç')
                    : t('4 kart göm')}
              </h2>
              <TurnClock timer={timer} />
            </header>
            {stage === 'bidding' ? (
              <>
                <p>
                  {own?.seat === game.turn
                    ? t('Sıra sende')
                    : t('{name} bekleniyor', {
                        name:
                          game.seats.find((seat) => seat.seat === game.turn)?.name ?? t('Oyuncu'),
                      })}
                </p>
                <div className="rx-bid-grid">
                  {Array.from(
                    { length: Math.max(0, maximum - minimum + 1) },
                    (_, index) => minimum + index,
                  ).map((value) => (
                    <button
                      key={value}
                      className={bid === value ? 'selected' : ''}
                      disabled={!can('bid')}
                      onClick={() => setBid(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <footer>
                  <button
                    className="button secondary"
                    disabled={!can('pass')}
                    onClick={() => void action('pass')}
                  >
                    {t('Pas')}
                  </button>
                  <button
                    className="button primary"
                    disabled={!can('bid') || bid < minimum || bid > maximum}
                    onClick={() => void action('bid', { amount: bid })}
                  >
                    {t('{bid} · İhale ver', { bid })}
                  </button>
                </footer>
              </>
            ) : stage === 'trump' ? (
              <>
                <div className="rx-trump">
                  {Object.entries(suits).map(([suit, symbol]) => (
                    <button
                      className={`${trump === suit ? 'selected' : ''} ${suit === 'hearts' || suit === 'diamonds' ? 'red' : ''}`}
                      key={suit}
                      disabled={!can('trump')}
                      onClick={() => setTrump(suit)}
                    >
                      {symbol}
                      <small>
                        {
                          (
                            {
                              clubs: t('Sinek'),
                              diamonds: t('Karo'),
                              hearts: t('Kupa'),
                              spades: t('Maça'),
                            } as Record<string, string>
                          )[suit]
                        }
                      </small>
                    </button>
                  ))}
                </div>
                <footer>
                  <button
                    className="button primary"
                    disabled={!can('trump')}
                    onClick={() => void action('trump', { trump })}
                  >
                    {t('Kozu onayla')}
                  </button>
                </footer>
              </>
            ) : (
              <>
                <div className="rx-bury-cards">
                  {cards.map((card) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      selected={selected.includes(card.id)}
                      disabled={
                        !can('bury') || (selected.length === 4 && !selected.includes(card.id))
                      }
                      onClick={() => toggle(card.id)}
                    />
                  ))}
                </div>
                <footer>
                  <span>{t('{selectedCount} / 4 kart', { selectedCount: selected.length })}</span>
                  <button
                    className="button primary"
                    disabled={!can('bury') || selected.length !== 4}
                    onClick={() =>
                      void action('bury', { tileIds: selected }).then((ok) => {
                        if (ok) setSelected([]);
                      })
                    }
                  >
                    {t('4 kartı göm')}
                  </button>
                </footer>
              </>
            )}
          </section>
          <aside>
            <h3>{t('Oyuncular')}</h3>
            {game.seats.map((seat) => (
              <div className="rx-bid-player" key={seat.userId}>
                <Avatar name={seat.name} />
                <strong>{seat.name}</strong>
                <span>
                  {bids[seat.seat] > 0
                    ? t('{bid} ihale', { bid: bids[seat.seat] })
                    : seat.seat === game.turn
                      ? t('Sıra onda')
                      : '—'}
                </span>
              </div>
            ))}
          </aside>
        </div>
      ) : (
        <>
          <section className="rx-batak-felt">
            <div className="rx-batak-center">
              {trick.length ? (
                trick.map((play, index) => (
                  <div style={{ transform: `rotate(${index * 8 - 10}deg)` }} key={play.card.id}>
                    <PlayingCard card={play.card} />
                    <small>{game.seats.find((seat) => seat.seat === play.seat)?.name}</small>
                  </div>
                ))
              ) : (
                <span>
                  {game.status === 'finished' ? t('El tamamlandı') : t('Kart bekleniyor')}
                </span>
              )}
            </div>
            {game.seats.map((seat) => {
              const relative =
                (seat.seat - (own?.seat ?? 0) + game.seats.length) % game.seats.length;
              return (
                <article
                  className={`rx-batak-seat side-${relative} ${seat.userId === userId ? 'own' : ''} ${seat.seat === game.turn ? 'turn' : ''}`}
                  key={seat.userId}
                >
                  <Avatar name={seat.name} />
                  <strong>{seat.name}</strong>
                  <small>
                    {t('{tricks} el · {cards} kart', {
                      tricks: tricks[seat.seat] ?? 0,
                      cards: Number(hands.find((hand) => hand.seat === seat.seat)?.count ?? 0),
                    })}
                  </small>
                  {seat.userId !== userId &&
                    Number(hands.find((hand) => hand.seat === seat.seat)?.count ?? 0) > 0 && (
                      <PlayingCard />
                    )}
                </article>
              );
            })}
          </section>
          {game.status === 'finished' && <GameResults game={game} result={view} />}
        </>
      )}
      {own && stage !== 'bury' && game.status === 'playing' && (
        <section className="rx-rack">
          <header>
            <strong>{t('ELİN · {count} kart', { count: cards.length })}</strong>
            <TurnClock timer={['bidding', 'trump'].includes(stage) ? null : timer} />
          </header>
          <div className="rx-card-rack">
            {cards.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                disabled={!can('play') || !valid.includes(card.id)}
                onClick={() => void action('play', { cardId: card.id })}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
