import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Spade } from 'lucide-react';
import { EmptyState } from '@rooms/design';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { t } from '../../i18n';
import { rankNames, suitNames, suits, type Card } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';
import type { TableUI } from '../shared/table-ui';
import {
  bidRange,
  lastBid,
  legalCardIds,
  readBatak,
  relativePosition,
  roundSeats,
  roundSummary,
  scoreSheet,
  takenBy,
  sortHand,
  target,
  variantName,
  type BatakState,
  type TrickPlay,
} from './model';
import { SeatAvatar } from '../shared/SeatAvatar';
import { playGameCue, useGameSounds } from '../shared/sounds';
import './batak.css';

/** How long a completed trick stays on the felt before it sweeps to the winner. */
export const TRICK_HOLD_MS = 1200;
export const TRICK_SWEEP_MS = 350;
const LOG_LENGTH = 6;

const cardName = (card: Card) =>
  `${suitNames[card.suit] ?? card.suit} ${rankNames[card.rank] ?? card.rank}`;
const seatName = (game: GamePublicState, round: number) =>
  roundSeats(game)[round]?.name ?? t('Oyuncu');
const suitLabel = (suit: string | null) => (suit ? `${suits[suit]} ${suitNames[suit]}` : '—');
const playLine = (game: GamePublicState, play: TrickPlay) =>
  t('{name} {card} attı', { name: seatName(game, play.seat), card: cardName(play.card) });

interface HeldTrick {
  key: string;
  plays: TrickPlay[];
  winner: number;
  sweeping: boolean;
}

/**
 * Table events derived from consecutive views (the server sends no event bodies). The first view
 * after mount is the baseline: nothing replays when the page opens or reconnects. A trick that
 * completes stays on the felt for `TRICK_HOLD_MS`, then sweeps to its winner; the next lead cuts
 * the pause short.
 */
function useTableEvents(game: GamePublicState, state: BatakState) {
  const done = state.completedTricks.length;
  const seen = useRef({
    done,
    played: state.trick.length,
    bids: state.bidLog.length,
    trump: state.trump,
  });
  const [baseline] = useState(() => new Set(state.trick.map((play) => play.card.id)));
  const [held, setHeld] = useState<HeldTrick | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const eventKey = `${done}:${state.trick.length}:${state.bidLog.length}:${state.trump}`;
  useEffect(() => {
    const before = seen.current,
      // A new deal resets the tricks and the auction; everything in it is new.
      fresh = done < before.done || state.bidLog.length < before.bids,
      lines: string[] = [];
    for (const entry of state.bidLog.slice(fresh ? 0 : before.bids))
      lines.push(
        state.variant === 'koz-maca'
          ? t('{name} {count} el dedi', {
              name: seatName(game, entry.seat),
              count: entry.amount ?? 1,
            })
          : entry.action === 'pass'
            ? t('{name} pas dedi', { name: seatName(game, entry.seat) })
            : t('{name} {bid} dedi', { name: seatName(game, entry.seat), bid: entry.amount ?? 0 }),
      );
    if (!fresh && state.trump && before.trump !== state.trump && state.variant !== 'koz-maca')
      lines.push(t('Koz {trump} oldu', { trump: suitLabel(state.trump) }));
    if (!fresh && done > before.done) {
      const last = state.completedTricks[done - 1];
      // The cards of the finished trick this client had not shown yet, then who took it.
      for (const play of last.plays.slice(done === before.done + 1 ? before.played : 0))
        lines.push(playLine(game, play));
      lines.push(t('{name} eli aldı', { name: seatName(game, last.winner) }));
      // The next lead in the same update sweeps the finished trick at once.
      setHeld({
        key: `${game.history.length}:${done}`,
        ...last,
        sweeping: state.trick.length > 0,
      });
      playGameCue('capture');
    }
    const from = !fresh && done === before.done ? before.played : 0;
    for (const play of state.trick.slice(from)) lines.push(playLine(game, play));
    if (state.trick.length > from && !(done > before.done && !fresh)) playGameCue('play');
    if (lines.length) setLog((current) => [...lines.reverse(), ...current].slice(0, LOG_LENGTH));
    seen.current = {
      ...before,
      done,
      played: state.trick.length,
      bids: state.bidLog.length,
      trump: state.trump,
    };
  }, [eventKey]);
  // Hold, then sweep, then clear.
  useEffect(() => {
    if (!held) return;
    const timeout = setTimeout(
      () =>
        held.sweeping ? setHeld(null) : setHeld((value) => value && { ...value, sweeping: true }),
      held.sweeping ? TRICK_SWEEP_MS : TRICK_HOLD_MS,
    );
    return () => clearTimeout(timeout);
  }, [held?.key, held?.sweeping]);
  // The winner already led the next trick: sweep now instead of hiding the new card.
  useEffect(() => {
    if (held && !held.sweeping && state.trick.length > 0)
      setHeld((value) => value && { ...value, sweeping: true });
  }, [state.trick.length]);
  return { held, log, animate: (id: string) => !baseline.has(id) };
}

export function ReferenceBatak(ui: TableUI) {
  // Deal, your-turn and end-of-hand cues; card and trick cues come from the table events, so the
  // empty signals keep the hook from adding a second move cue.
  useGameSounds(ui.game, { signals: () => ({}) });
  const state = readBatak(ui.game, ui.userId);
  if (!state)
    return (
      <EmptyState size="inline" icon={<Spade size={22} />} title={t('Kartlar dağıtılıyor')}>
        {t('Masanın durumu birazdan gelir.')}
      </EmptyState>
    );
  return <BatakBoard {...ui} state={state} />;
}

function BatakBoard({ game, can, action, timer, state }: TableUI & { state: BatakState }) {
  const seats = roundSeats(game).slice(0, state.seats),
    events = useTableEvents(game, state),
    finished = state.stage === 'ended' || game.status === 'finished',
    auction = state.stage === 'bidding' || state.stage === 'trump' || state.stage === 'bury',
    yourTurn = state.viewerSeat !== null && state.turn === state.viewerSeat && !finished,
    legal = legalCardIds(state),
    hand = state.hand ? sortHand(state.hand, state.trump) : null,
    teams = state.variant === 'esli',
    [showLast, setShowLast] = useState(false),
    [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [state.stage, game.history.length]);
  const lastTrick = state.completedTricks.at(-1) ?? null,
    held = events.held,
    shown: TrickPlay[] = held
      ? held.plays
      : state.trick.length
        ? state.trick
        : showLast && lastTrick
          ? lastTrick.plays
          : [],
    turnName = state.turn === null ? '' : seatName(game, state.turn);
  const toggle = (id: string) =>
    setPicked((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 4 ? [...ids, id] : ids,
    );
  return (
    <div className="bt-table">
      <div className="rx-badges">
        <span>{variantName(state.variant)}</span>
        {state.variant !== 'koz-maca' && state.stage !== 'bidding' && (
          <span>
            {t('İhale {bid} · {name}', { bid: state.bid, name: seatName(game, state.bidder) })}
          </span>
        )}
        <span>{t('Koz {trump}', { trump: suitLabel(state.trump) })}</span>
        {state.rules.noTrumpLeadUntilBroken && state.trump && (
          <span
            className={`bt-broken ${state.trumpBroken ? 'open' : ''}`}
            title={t('Koz kırılmadan koz açılmaz')}
          >
            {state.trumpBroken ? t('Koz kırıldı') : t('Koz kırılmadı')}
          </span>
        )}
        <span>{t('El {hand}', { hand: game.history.length + (finished ? 0 : 1) })}</span>
        {lastTrick && !finished && !auction && (
          <button
            type="button"
            className="bt-badge-button"
            aria-pressed={showLast}
            disabled={state.trick.length > 0 || !!held}
            onClick={() => setShowLast((value) => !value)}
          >
            {t('Son eli göster')}
          </button>
        )}
      </div>
      <div className="bt-layout">
        <section
          className={`bt-felt seats-${state.seats}`}
          aria-label={t('Batak masası')}
          data-turn={state.turn ?? undefined}
        >
          {seats.map((seat, round) => {
            const position = relativePosition(state, round),
              turn = state.turn === round && !finished,
              count = state.handCounts[round] ?? 0,
              own = round === state.viewerSeat,
              goal = target(state, round),
              tricks = takenBy(state, round),
              said = state.stage === 'bidding' ? lastBid(state, round) : null,
              partner =
                teams && state.viewerSeat !== null && !own && round % 2 === state.viewerSeat % 2;
            return (
              <article
                key={seat.userId}
                className={`bt-seat pos-${position} ${turn ? 'turn' : ''} ${own ? 'own' : ''} ${teams ? `team-${round % 2}` : ''}`}
                data-position={position}
                aria-label={
                  turn
                    ? t('{name} · sırası · {count} kart', { name: seat.name, count })
                    : t('{name} · {count} kart', { name: seat.name, count })
                }
              >
                <SeatAvatar seat={seat} game={game} timer={timer} />
                <span className="bt-seat-text">
                  <strong title={seat.name}>{seat.name}</strong>
                  <small>
                    {partner
                      ? t('Eşin')
                      : seat.bot
                        ? t('Bot')
                        : teams
                          ? t('Takım {number}', { number: (round % 2) + 1 })
                          : t('{count} kart', { count })}
                    {turn && timer !== null && ` · ${t('{seconds} sn', { seconds: timer })}`}
                  </small>
                </span>
                {state.stage !== 'bidding' && (
                  <span
                    className={`bt-tricks ${goal !== null && tricks >= goal ? 'made' : ''}`}
                    aria-label={
                      goal === null
                        ? t('{count} el aldı', { count: tricks })
                        : t('{count} / {goal} el', { count: tricks, goal })
                    }
                  >
                    {goal === null ? tricks : `${tricks}/${goal}`}
                  </span>
                )}
                {round === state.bidder &&
                  state.variant !== 'koz-maca' &&
                  state.stage !== 'bidding' && (
                    <span className="bt-bidder" title={t('İhaleyi aldı')}>
                      {t('İhale')}
                      {state.trump && <b className={state.trump}>{suits[state.trump]}</b>}
                    </span>
                  )}
                {said !== null && (
                  <span className="bt-bubble" aria-label={t('Son sözü: {bid}', { bid: said })}>
                    {said}
                  </span>
                )}
                {!own && count > 0 && (
                  <span className="bt-backs" aria-hidden="true">
                    {Array.from({ length: Math.min(count, 5) }, (_, index) => (
                      <i key={index} />
                    ))}
                  </span>
                )}
              </article>
            );
          })}

          {auction ? (
            <Auction
              game={game}
              state={state}
              can={can}
              action={action}
              picked={picked}
              onBuried={() => setPicked([])}
            />
          ) : (
            <div className="bt-trick" aria-label={t('Ortadaki el')}>
              {shown.map((play) => {
                const from = relativePosition(state, play.seat);
                return (
                  <span
                    key={play.card.id}
                    className={`bt-played at-${from} ${events.animate(play.card.id) ? `bt-fly-${from}` : ''} ${held?.sweeping ? `sweep-${relativePosition(state, held.winner)}` : ''} ${held && play.seat === held.winner ? 'winner' : ''}`}
                    aria-label={t('{name}: {card}', {
                      name: seatName(game, play.seat),
                      card: cardName(play.card),
                    })}
                  >
                    <PlayingCard card={play.card} />
                  </span>
                );
              })}
              {!shown.length && (
                <span className="bt-trick-empty">
                  {finished
                    ? t('El tamamlandı')
                    : yourTurn
                      ? t('Sıra sende · bir kart aç')
                      : t('{name} açıyor', { name: turnName || t('Oyuncu') })}
                </span>
              )}
              {held && (
                <small className="bt-trick-winner" role="status">
                  {t('{name} eli aldı', { name: seatName(game, held.winner) })}
                </small>
              )}
            </div>
          )}
        </section>

        <aside className="bt-side">
          {finished && <RoundSummary game={game} state={state} />}
          <ScoreSheet game={game} state={state} />
          {state.buried.length > 0 && (
            <section className="bt-panel bt-gomu">
              <h3>{t('Gömü')}</h3>
              <div>
                {state.buried.map((card) => (
                  <PlayingCard key={card.id} card={card} />
                ))}
              </div>
              <p>{t('Gömdüğün kartları yalnızca sen görürsün.')}</p>
            </section>
          )}
          <section className="bt-panel bt-log">
            <h3>{t('Son hamleler')}</h3>
            {events.log.length ? (
              <ol aria-live="polite">
                {events.log.map((line, index) => (
                  <li key={`${index}:${line}`}>{line}</li>
                ))}
              </ol>
            ) : (
              <p>{t('Henüz hamle yok.')}</p>
            )}
          </section>
        </aside>
      </div>

      {hand && !finished && (
        <section className="rx-rack bt-rack">
          <header>
            <strong>
              {state.stage === 'bury'
                ? yourTurn
                  ? t('Gömeceğin 4 kartı seç')
                  : t('{name} kart gömüyor', { name: turnName || t('Oyuncu') })
                : auction
                  ? t('Elin · ihale sürüyor')
                  : yourTurn
                    ? t('Sıra sende · bir kart at')
                    : t('{name} oynuyor', { name: turnName || t('Oyuncu') })}
            </strong>
            <small>{t('ELİN · {count} kart', { count: hand.length })}</small>
          </header>
          <div className="bt-hand" style={{ '--count': hand.length } as CSSProperties}>
            {hand.map((card, index) => {
              const burying = state.stage === 'bury' && can('bury'),
                playable = !auction && can('play') && legal.includes(card.id);
              return (
                <span
                  key={card.id}
                  className={`bt-hand-card ${playable ? 'legal' : ''} ${!auction && yourTurn && !playable ? 'illegal' : ''} ${card.suit === state.trump ? 'trump' : ''}`}
                  style={{ '--i': index } as CSSProperties}
                >
                  <PlayingCard
                    card={card}
                    selected={burying && picked.includes(card.id)}
                    disabled={
                      burying ? picked.length === 4 && !picked.includes(card.id) : !playable
                    }
                    onClick={
                      burying
                        ? () => toggle(card.id)
                        : () => void action('play', { cardId: card.id })
                    }
                  />
                </span>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Auction({
  game,
  state,
  can,
  action,
  picked,
  onBuried,
}: Pick<TableUI, 'game' | 'can' | 'action'> & {
  state: BatakState;
  picked: string[];
  onBuried(): void;
}) {
  const { minimum, maximum } = bidRange(state),
    [bid, setBid] = useState(minimum),
    [trump, setTrump] = useState<string>('spades'),
    turnName = state.turn === null ? t('Oyuncu') : seatName(game, state.turn),
    bidderName = seatName(game, state.bidder);
  useEffect(() => setBid(minimum), [minimum, state.stage]);
  const title =
    state.stage === 'bidding'
      ? state.variant === 'koz-maca'
        ? t('Kaç el alacaksın?')
        : t('İhale')
      : state.stage === 'trump'
        ? t('Koz seçimi')
        : t('Gömü');
  return (
    <section className="bt-auction" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <span>
          {state.stage !== 'bidding'
            ? t('İhale {bid} · {name}', { bid: state.bid, name: bidderName })
            : state.variant === 'koz-maca'
              ? t('Koz maça · herkes tahmin söyler')
              : state.bid
                ? t('En yüksek {bid} · {name}', { bid: state.bid, name: bidderName })
                : t('Henüz ihale yok')}
        </span>
      </header>
      <ol className="bt-bidlog" aria-label={t('İhale geçmişi')}>
        {state.bidLog.map((entry, index) => (
          <li
            key={index}
            className={entry.action === 'pass' && state.variant !== 'koz-maca' ? 'pass' : ''}
          >
            <span title={seatName(game, entry.seat)}>{seatName(game, entry.seat)}</span>
            <b>
              {state.variant === 'koz-maca'
                ? t('{count} el', { count: entry.amount ?? 1 })
                : entry.action === 'pass'
                  ? t('Pas')
                  : String(entry.amount ?? '')}
            </b>
          </li>
        ))}
        {!state.bidLog.length && (
          <li className="empty">{t('İlk söz {name}', { name: turnName })}</li>
        )}
      </ol>
      {state.stage === 'bidding' &&
        (can('bid') ? (
          <>
            <div className="bt-bid-grid" role="group" aria-label={t('İhale miktarı')}>
              {Array.from(
                { length: Math.max(0, maximum - minimum + 1) },
                (_, index) => minimum + index,
              ).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={bid === value ? 'selected' : ''}
                  aria-pressed={bid === value}
                  onClick={() => setBid(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <footer>
              {state.variant !== 'koz-maca' && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={!can('pass')}
                  onClick={() => void action('pass')}
                >
                  {t('Pas')}
                </button>
              )}
              <button
                type="button"
                className="button primary"
                disabled={bid < minimum || bid > maximum}
                onClick={() => void action('bid', { amount: bid })}
              >
                {state.variant === 'koz-maca'
                  ? t('{count} el de', { count: bid })
                  : t('{bid} · İhale ver', { bid })}
              </button>
            </footer>
          </>
        ) : (
          <p className="bt-wait">{t('{name} düşünüyor', { name: turnName })}</p>
        ))}
      {state.stage === 'trump' &&
        (can('trump') ? (
          <>
            <div className="bt-trump-pick" role="group" aria-label={t('Koz rengi')}>
              {Object.entries(suits).map(([suit, symbol]) => (
                <button
                  type="button"
                  key={suit}
                  className={`${trump === suit ? 'selected' : ''} ${suit === 'hearts' || suit === 'diamonds' ? 'red' : ''}`}
                  aria-pressed={trump === suit}
                  aria-label={suitNames[suit]}
                  onClick={() => setTrump(suit)}
                >
                  <span aria-hidden="true">{symbol}</span>
                  <small aria-hidden="true">{suitNames[suit]}</small>
                </button>
              ))}
            </div>
            <footer>
              <button
                type="button"
                className="button primary"
                onClick={() => void action('trump', { trump })}
              >
                {t('Kozu onayla')}
              </button>
            </footer>
          </>
        ) : (
          <p className="bt-wait">{t('{name} kozu seçiyor', { name: turnName })}</p>
        ))}
      {state.stage === 'bury' &&
        (can('bury') ? (
          <footer>
            <span>{t('{selectedCount} / 4 kart', { selectedCount: picked.length })}</span>
            <button
              type="button"
              className="button primary"
              disabled={picked.length !== 4}
              onClick={() =>
                void action('bury', { tileIds: picked }).then((ok) => {
                  if (ok) onBuried();
                })
              }
            >
              {t('4 kartı göm')}
            </button>
          </footer>
        ) : (
          <p className="bt-wait">{t('{name} 4 kart gömüyor', { name: turnName })}</p>
        ))}
    </section>
  );
}

function RoundSummary({ game, state }: { game: GamePublicState; state: BatakState }) {
  const rows = roundSummary(state),
    bidder = rows.find((row) => row.seat === state.bidder);
  const mark = (value: (typeof rows)[number]['mark']) =>
    value === 'made' ? t('Çıktı') : value === 'set' ? t('Battı') : t('Batak');
  return (
    <section className="bt-panel bt-summary" aria-label={t('El özeti')}>
      <h3>
        {state.variant === 'koz-maca'
          ? t('El bitti')
          : bidder?.mark === 'made'
            ? t('{name} ihaleyi çıkardı', { name: seatName(game, state.bidder) })
            : t('{name} battı', { name: seatName(game, state.bidder) })}
      </h3>
      <table className="bt-grid">
        <thead>
          <tr>
            <th scope="col">{t('Oyuncu')}</th>
            <th scope="col">{t('Aldığı / söz')}</th>
            <th scope="col">{t('Puan')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.seat} className={row.mark ?? ''}>
              <th scope="row" title={seatName(game, row.seat)}>
                {seatName(game, row.seat)}
              </th>
              <td>
                {row.contract === null ? row.tricks : `${row.taken} / ${row.contract}`}
                {row.mark && <em className={`bt-mark ${row.mark}`}>{mark(row.mark)}</em>}
              </td>
              <td>{row.points > 0 ? `+${row.points}` : row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.variant !== 'koz-maca' && state.rules.writeContract && (
        <p>{t('İhale kadar yazılır')}</p>
      )}
      {state.variant !== 'koz-maca' && state.rules.defenderBatakPenalty && (
        <p>{t('Hiç el almayan savunma ihale kadar düşer')}</p>
      )}
    </section>
  );
}

function ScoreSheet({ game, state }: { game: GamePublicState; state: BatakState }) {
  const { rows, totals } = scoreSheet(game, state.seats);
  if (!rows.length) return null;
  const best = Math.max(...totals);
  return (
    <section className="bt-panel bt-sheet" aria-label={t('Puan cetveli')}>
      <h3>{t('Puan cetveli')}</h3>
      <table className="bt-grid">
        <thead>
          <tr>
            <th scope="col">{t('El')}</th>
            {totals.map((_, seat) => (
              <th scope="col" key={seat} title={seatName(game, seat)}>
                {seatName(game, seat)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.hand}>
              <th scope="row">{row.hand}</th>
              {row.points.map((points, seat) => (
                <td key={seat} className={points < 0 ? 'minus' : ''}>
                  {points}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t('Toplam')}</th>
            {totals.map((total, seat) => (
              <td key={seat} className={total === best ? 'lead' : ''}>
                {total}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
