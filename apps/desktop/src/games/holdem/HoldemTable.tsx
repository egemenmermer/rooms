import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Coins, Eye, Plus, Trophy } from 'lucide-react';
import { locale, t } from '../../i18n';
import { ActionLog } from '../card-history/ActionLog';
import type { GameHistoryEntry, LobbyTableProps } from '../registry';
import { useGameFixtureMetadata } from '../shared/fixture';
import { array, object, type Card } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';
import { SeatAvatar } from '../shared/SeatAvatar';
import { holdemCatalog } from './catalog';
import { ChipStack } from './ChipStack';
import {
  actionLabel,
  blindsOf,
  clampRaise,
  holdemLog,
  lastActions,
  raiseFloor,
  raisePresets,
  seatPosition,
  streetTotals,
} from './model';
import { pokerCategory } from './poker-labels';
import './holdem.css';

/** How long the street's bets take to slide into the pot (matches `ho-to-pot` in holdem.css). */
export const BET_SWEEP_MS = 420;
type ProjectedSeat = Record<string, unknown>;
type Sweep = { key: number; bets: { userId: string; amount: number; position: number }[] };

/**
 * The Hold'em table, rendered by `shared/Lobby.tsx` under its header (late seating and the
 * buy-in dialog stay there). Commands go through the lobby's own `can`/`send`.
 */
export function HoldemTable({
  game,
  userId,
  can,
  send,
  onSit,
  shortcuts,
  ready,
  busy,
  fixtureReason,
  timer,
  startReason,
}: LobbyTableProps) {
  const fixture = !!fixtureReason,
    fixtureMetadata = useGameFixtureMetadata();
  const view = game.view,
    playing = game.status === 'playing',
    finished = game.status === 'finished';
  const own = game.seats.find((seat) => seat.userId === userId),
    access = !!own || view.watching === true;
  const projected = array<ProjectedSeat>(view.seats),
    mine = projected.find((seat) => seat.userId === userId);
  const capacity = Math.min(
    9,
    Math.max(1, Number(view.rules?.capacity ?? view.capacity ?? holdemCatalog.fallbackCapacity)),
  );
  const legal = array<string>(view.legalActions),
    myTurn = !!own && own.seat === game.turn;
  const pots = array<{ amount: number }>(view.pots);
  const pot = pots.length
    ? pots.reduce((total, item) => total + item.amount, 0)
    : projected.reduce((total, seat) => total + Number(seat.contribution ?? 0), 0);
  const streetBet = Number(mine?.streetBet ?? 0),
    chips = Number(mine?.chips ?? own?.chips ?? 0),
    maximumBet = Number(view.maximumBet ?? 0),
    range = {
      pot,
      maximumBet,
      streetBet,
      minRaise: maximumBet + Number(view.minimumRaise ?? 20),
      maxRaise: chips + streetBet,
    },
    call = Math.max(0, maximumBet - streetBet);
  const [amount, setAmount] = useState(raiseFloor(range));
  const slider = useRef<HTMLInputElement>(null);
  const log = holdemLog(view),
    bubbles = lastActions(log, view.stage),
    blinds = blindsOf(log),
    mucked = array<string>(view.mucked);
  const seatName = (id: string) =>
    game.seats.find((seat) => seat.userId === id)?.name ?? t('Oyuncu');
  const payouts = object(view.payouts),
    winners = Object.entries(payouts).filter(([, value]) => Number(value) > 0);
  // Highlight only server-delivered winning evaluations after public settlement.
  const winningCards = new Set(
    finished ? winners.flatMap(([id]) => view.showdown?.[id]?.bestFiveCardIds ?? []) : [],
  );
  const splitPot = view.pots?.some((item) => item.split) === true;
  const positionOf = (id: string | undefined) => {
    const seat = game.seats.find((item) => item.userId === id);
    return seat ? seatPosition(capacity, seat.seat, own?.seat) : undefined;
  };
  const buttonUser = projected[Number(view.button)]?.userId as string | undefined,
    buttonPosition = positionOf(buttonUser);

  // A new turn starts the raise input at the server's minimum.
  const turnKey = `${game.history.length}:${String(view.stage)}:${game.turn}:${maximumBet}`;
  useEffect(() => {
    if (!fixtureMetadata || fixtureMetadata.ui.modal !== 'raise') setAmount(raiseFloor(range));
  }, [turnKey]);
  useEffect(() => {
    if (fixtureMetadata?.ui.modal === 'raise' && fixtureMetadata.ui.amount !== null)
      setAmount(fixtureMetadata.ui.amount);
  }, [fixtureMetadata]);

  // Bets slide into the pot when a street (or the hand) ends.
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const previous = useRef<{ stage: unknown; hand: number } | null>(null),
    lastBets = useRef<Sweep['bets']>([]);
  const liveBets = playing
    ? projected
        .filter((seat) => Number(seat.streetBet ?? 0) > 0)
        .map((seat) => ({
          userId: String(seat.userId),
          amount: Number(seat.streetBet),
          position: positionOf(String(seat.userId)) ?? -1,
        }))
        .filter((bet) => bet.position >= 0)
    : [];
  useEffect(() => {
    const before = previous.current,
      hand = game.history.length;
    previous.current = { stage: view.stage, hand };
    // Same hand, next street; or the hand just ended (its history entry was appended).
    if (
      !before ||
      before.stage === view.stage ||
      !(before.hand === hand || (finished && before.hand === hand - 1))
    )
      return;
    // The street's final totals come from the public log: the last call usually moves the hand
    // to the next street in the same update. Without a log, the bets last seen on the felt.
    const totals = streetTotals(log, before.stage);
    const bets = totals.size
      ? [...totals]
          .map(([id, amount]) => ({ userId: id, amount, position: positionOf(id) ?? -1 }))
          .filter((bet) => bet.amount > 0 && bet.position >= 0)
      : lastBets.current;
    if (!bets.length) return;
    const next = { key: Date.now(), bets };
    setSweep(next);
    const timer = setTimeout(
      () => setSweep((value) => (value?.key === next.key ? null : value)),
      BET_SWEEP_MS + 80,
    );
    return () => clearTimeout(timer);
  }, [String(view.stage), game.history.length]);
  // Declared after the sweep so the sweep reads the previous render's bets.
  useEffect(() => {
    lastBets.current = liveBets;
  });

  // Cards on the first render (or a board that shrank: a new hand) are already on the felt. Each
  // later card keeps its place in its deal batch, so the flip survives the lobby's clock ticks.
  const board = array<Card>(view.board);
  const dealt = useRef<Map<string, number> | null>(null);
  if (!dealt.current || board.length < dealt.current.size)
    dealt.current = new Map(board.map((card) => [card.id, -1]));
  let batch = 0;
  for (const card of board) if (!dealt.current.has(card.id)) dealt.current.set(card.id, batch++);

  const action = (value: 'fold' | 'check' | 'call') =>
    void send({ type: 'game.action', action: value });
  const raiseTo = (total: number) =>
    void send({ type: 'game.action', action: 'raise', amount: total });
  const raiseValid =
    Number.isInteger(amount) && amount >= raiseFloor(range) && amount <= range.maxRaise;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest('input, textarea, select, button, [role=dialog]'))) ||
        !shortcuts ||
        !playing ||
        !myTurn
      )
        return;
      const key = event.key.toLowerCase();
      if (key === 'f' && can('fold')) {
        event.preventDefault();
        action('fold');
      }
      if (key === 'c' && (can('check') || can('call'))) {
        event.preventDefault();
        action(can('check') ? 'check' : 'call');
      }
      if (key === 'r' && can('raise')) {
        event.preventDefault();
        slider.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [shortcuts, playing, myTurn, ready, fixture, busy, legal.join(','), can]);

  if (!access)
    return (
      <section className="rx-watch">
        <Eye size={32} />
        <h2>{t('Masayı izle')}</h2>
        <p>
          {view.rules?.spectatorsAllowed === false
            ? t('Bu masada izleyici erişimi kapalı.')
            : t('Masaya izleyici olarak katıl.')}
        </p>
        <button
          className="button primary"
          disabled={fixture || !ready || busy || view.rules?.spectatorsAllowed === false}
          onClick={() => void send({ type: 'game.watch', watching: true })}
        >
          {t('İzle')}
        </button>
      </section>
    );

  const presets = raisePresets(range);
  const historyEntry: GameHistoryEntry = {
    hand: game.history.length + 1,
    endedAt: 0,
    result: { actions: log, mucked },
    seats: game.seats.map((seat) => ({
      seat: seat.seat,
      position: seat.seat,
      userId: seat.userId,
      name: seat.name,
      bot: seat.bot,
    })),
  };
  return (
    <>
      {!own && (
        <div className="rg-banner">
          {t('İzleyici · Gizli kartlar gösterilmez.')}
          <button
            disabled={fixture || !ready || busy}
            onClick={() => void send({ type: 'game.watch', watching: false })}
          >
            {t('İzlemeyi bırak')}
          </button>
        </div>
      )}
      <div
        className={`rg-board count-${capacity} ${capacity > 6 ? 'rg-nine-layout' : ''} ${winningCards.size ? 'ho-settled' : ''}`}
      >
        <div className="rg-felt" />
        <div className="rg-center">
          <small>
            {(
              {
                preflop: 'Preflop',
                flop: 'Flop',
                turn: 'Turn',
                river: 'River',
                ended: t('El tamamlandı'),
              } as Record<string, string>
            )[String(view.stage)] ?? t('Masa')}
            {finished && view.runoutFrom ? ` · ${t('All-in, kalan kartlar açıldı')}` : ''}
          </small>
          <strong className="ho-pot">
            {pot > 0 && !finished ? <ChipStack amount={pot} /> : <Coins size={18} />}
            {pot.toLocaleString(locale)} <span>{t('pot')}</span>
          </strong>
          <div>
            {board.map((card) => {
              const fresh = dealt.current!.get(card.id) ?? -1;
              return (
                <span
                  key={card.id}
                  className={`ho-board-card${fresh >= 0 ? ' ho-dealt' : ''}`}
                  style={fresh >= 0 ? ({ '--deal-index': fresh } as CSSProperties) : undefined}
                >
                  <PlayingCard card={card} winning={winningCards.has(card.id)} />
                </span>
              );
            })}
            {Array.from({ length: Math.max(0, 5 - board.length) }, (_, index) => (
              <span className="rg-card-outline" key={index} />
            ))}
          </div>
          {view.pots && (
            <div className="rg-pot-details">
              {view.pots.map((item, index) => (
                <span key={index} className={item.kind === 'side' ? 'ho-side-pot' : undefined}>
                  {item.kind === 'main' ? t('Ana pot') : t('Yan pot {number}', { number: index })} ·{' '}
                  {item.amount.toLocaleString(locale)}
                  {item.split ? t(' · Paylaşıldı') : ''}
                  {item.winners.length
                    ? ` · ${item.winners.map((id) => `${seatName(id)}${Number.isFinite(item.awards[id]) ? ` +${item.awards[id].toLocaleString(locale)}` : ''}`).join(', ')}`
                    : ''}
                </span>
              ))}
            </div>
          )}
        </div>
        {liveBets.map((bet) => (
          <ChipStack
            key={`bet:${bet.userId}`}
            className={`ho-bet ho-at-${bet.position}`}
            amount={bet.amount}
            label
          />
        ))}
        {sweep?.bets.map((bet) => (
          <ChipStack
            key={`sweep:${sweep.key}:${bet.userId}`}
            className={`ho-bet ho-sweep ho-at-${bet.position}`}
            amount={bet.amount}
          />
        ))}
        {finished &&
          winners.map(([id, value]) => {
            const position = positionOf(id);
            return position === undefined ? null : (
              <ChipStack
                key={`won:${game.history.length}:${id}`}
                className={`ho-bet ho-push ho-at-${position}`}
                amount={Number(value)}
                label
              />
            );
          })}
        {buttonPosition !== undefined && (
          <b
            className={`ho-dealer ho-at-${buttonPosition}`}
            aria-label={t('Krupiye: {name}', { name: seatName(buttonUser ?? '') })}
          >
            D
          </b>
        )}
        {Array.from({ length: capacity }, (_, index) => {
          const seat = game.seats.find((item) => item.seat === index),
            details = projected.find((item) => item.userId === seat?.userId);
          const isOwn = !!seat && seat.userId === userId;
          const position = seatPosition(capacity, index, own?.seat);
          const deliveredCards = array<Card>(details?.cards);
          const visibleCards =
            isOwn || (finished && !!view.showdown?.[seat?.userId ?? '']) ? deliveredCards : [];
          const hidden = Math.min(2, Math.max(0, Number(details?.hiddenCardCount ?? 0)));
          const bubble = seat ? bubbles.get(seat.userId) : undefined;
          return (
            <div
              className={`rg-table-seat p-${position} ${isOwn ? 'own' : ''} ${details?.folded ? 'folded' : ''} ${game.turn === index ? 'turn' : ''}`}
              key={index}
            >
              {seat ? (
                <>
                  {bubble && (
                    <span
                      key={bubble.index}
                      className={`ho-bubble ${bubble.action}${bubble.allIn ? ' all-in' : ''}`}
                      role="status"
                    >
                      {actionLabel(bubble)}
                    </span>
                  )}
                  <div className="rg-seat-cards">
                    {visibleCards.map((card) => (
                      <PlayingCard key={card.id} card={card} winning={winningCards.has(card.id)} />
                    ))}
                    {Array.from({ length: hidden }, (_, i) => (
                      <PlayingCard key={i} />
                    ))}
                  </div>
                  <div className="rg-seat-info">
                    <SeatAvatar seat={seat} game={game} timer={timer} />
                    <div>
                      <strong>
                        {seat.name}
                        {isOwn ? t(' · sen') : ''}
                      </strong>
                      <small>
                        <ChipStack amount={Number(details?.chips ?? seat.chips)} compact />
                        {Number(details?.chips ?? seat.chips).toLocaleString(locale)} {t('fiş')}
                        {seat.bot ? ' · BOT' : ''}
                      </small>
                    </div>
                    {(blinds.small === seat.userId || blinds.big === seat.userId) && !finished && (
                      <em className="ho-blind">{blinds.big === seat.userId ? 'BB' : 'SB'}</em>
                    )}
                  </div>
                  <small>
                    {seat.pendingNextHand
                      ? t('Sonraki el bekleniyor')
                      : details?.folded
                        ? t('Eli bıraktı')
                        : finished && Number(payouts[seat.userId]) > 0
                          ? `${splitPot ? t('Ortak kazanan') : t('Kazanan')}${view.showdown?.[seat.userId] ? ` · ${pokerCategory(view.showdown[seat.userId].category)}` : ''}`
                          : finished && mucked.includes(seat.userId)
                            ? t('Kartını açmadı')
                            : details && Number(details.chips) === 0 && playing
                              ? 'All-in'
                              : game.turn === index
                                ? isOwn
                                  ? t('Sıra sende')
                                  : t('Sıra {name} kişisinde', { name: seat.name })
                                : !seat.connected
                                  ? t('Bağlantısı kesildi')
                                  : details && Number(details.streetBet) > 0
                                    ? t('Bahis · {amount}', {
                                        amount: String(details.streetBet),
                                      })
                                    : t('Masada')}
                  </small>
                </>
              ) : (
                <button
                  className="rg-empty-seat"
                  disabled={!!own || fixture || busy || !ready}
                  title={
                    fixture
                      ? fixtureReason
                      : own
                        ? t('Zaten masadasın')
                        : playing
                          ? t('Sonraki el için katıl')
                          : undefined
                  }
                  onClick={() => onSit(index)}
                >
                  <Plus size={20} />
                  {t('Boş koltuk')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className={`rg-hand-strip ${finished ? 'result' : ''}`}>
        <div>
          {finished ? (
            <>
              <h3>
                <Trophy size={20} />
                {splitPot
                  ? t('Pot paylaşıldı')
                  : winners.length > 1
                    ? t('Potlar dağıtıldı')
                    : t('El tamamlandı')}
              </h3>
              <p>
                {winners
                  .map(
                    ([id, value]) =>
                      `${t('{name} · {chips} fiş', { name: seatName(id), chips: Number(value).toLocaleString(locale) })}${view.showdown?.[id] ? ` · ${pokerCategory(view.showdown[id].category)}` : ''}`,
                  )
                  .join(' / ') || t('Sonuç ayrıntısı bu yanıtta bulunmuyor.')}
                {view.settlementReason === 'uncontested'
                  ? ` · ${t('Herkes bıraktı, kartlar açılmadı')}`
                  : ''}
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">{own ? t('ELİN') : t('CANLI MASA')}</span>
              <h3>
                {mine?.folded
                  ? t('Bu eli bıraktın')
                  : mine && Number(mine.chips) === 0
                    ? t('Bütün fişlerin masada')
                    : myTurn
                      ? t('Sıra sende')
                      : game.seats.find((seat) => seat.seat === game.turn)?.name
                        ? t('{name} bekleniyor', {
                            name: game.seats.find((seat) => seat.seat === game.turn)!.name,
                          })
                        : t('El devam ediyor')}
              </h3>
              {own && (
                <p>
                  {t('Kalan fişin: {chips}', { chips: chips.toLocaleString(locale) })}
                  {view.ownHand ? ` · ${pokerCategory(view.ownHand.category)}` : ''}
                </p>
              )}
            </>
          )}
        </div>
        {playing && timer !== null && (
          <div className="rg-timer">
            <b>{timer}</b>
            <span>
              {myTurn ? t('Sıra sende') : t('Oyuncu bekleniyor')}
              <small>{t('Sunucu hamle süresi')}</small>
            </span>
          </div>
        )}
        {playing && myTurn && (
          <div className="rg-actions">
            <button
              className="button secondary"
              disabled={!can('fold')}
              title={fixture ? fixtureReason : undefined}
              onClick={() => action('fold')}
            >
              {t('Bırak')}
            </button>
            {legal.includes('check') ? (
              <button
                className="button secondary"
                disabled={!can('check')}
                onClick={() => action('check')}
              >
                {t('Kontrol et')}
              </button>
            ) : (
              <button
                className="button secondary"
                disabled={!can('call')}
                onClick={() => action('call')}
              >
                {t('Gör · {min}', { min: Math.min(chips, call) })}
              </button>
            )}
            <button
              className="button primary"
              disabled={!can('raise') || !raiseValid}
              title={fixture ? fixtureReason : undefined}
              onClick={() => raiseTo(amount)}
            >
              {amount >= range.maxRaise
                ? t('All-in · {maxRaise}', { maxRaise: range.maxRaise })
                : t('{amount} fişe artır', { amount })}
            </button>
          </div>
        )}
        {finished && (
          <button
            className="button primary"
            disabled={!can('start') || !!startReason}
            title={fixture ? fixtureReason : startReason}
            onClick={() => void send({ type: 'game.action', action: 'start' })}
          >
            {t('Sonraki el')}
          </button>
        )}
        {own && !own.connected && (
          <button
            className="button secondary"
            disabled={fixture || !ready || busy}
            onClick={() => void send({ type: 'game.sit', seat: own.seat })}
          >
            {t('Masaya geri dön')}
          </button>
        )}
      </div>
      {playing && myTurn && legal.includes('raise') && (
        <div className="ho-raise" role="group" aria-label={t('Artırma tutarı')}>
          <div className="ho-raise-presets">
            {presets.map((preset) => (
              <button
                key={preset.key}
                className="button secondary small"
                aria-pressed={amount === preset.amount}
                disabled={!can('raise')}
                onClick={() => setAmount(preset.amount)}
              >
                {preset.label} · {preset.amount.toLocaleString(locale)}
              </button>
            ))}
          </div>
          <label className="ho-raise-range">
            <span>{raiseFloor(range).toLocaleString(locale)}</span>
            <input
              ref={slider}
              aria-label={t('Artırma tutarı')}
              type="range"
              min={raiseFloor(range)}
              max={range.maxRaise}
              value={Number.isFinite(amount) ? amount : 0}
              disabled={!can('raise')}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
            <span>{range.maxRaise.toLocaleString(locale)}</span>
          </label>
          <label className="ho-raise-amount">
            {t('Bu turdaki toplam tutarın')}
            <input
              type="number"
              min={raiseFloor(range)}
              max={range.maxRaise}
              value={amount}
              disabled={!can('raise')}
              onChange={(event) => setAmount(Number(event.target.value))}
              onBlur={() => setAmount(clampRaise(range, amount || 0))}
            />
          </label>
          <p>
            {range.maxRaise < range.minRaise
              ? t('All-in toplamı {maxRaise}. Minimum artırma için yeterli fişin yok.', {
                  maxRaise: range.maxRaise.toLocaleString(locale),
                })
              : t(
                  'Minimum toplam artırma {minRaise}. Bunun {call} fişi görme, {max} fişi artırmadır.',
                  {
                    minRaise: range.minRaise.toLocaleString(locale),
                    call: call.toLocaleString(locale),
                    max: Math.max(0, range.minRaise - maximumBet).toLocaleString(locale),
                  },
                )}
          </p>
        </div>
      )}
      {log.length > 0 && (
        <details className="ho-hand-log" open>
          <summary>{t('Bu elin hamleleri · {count}', { count: log.length })}</summary>
          <ActionLog entry={historyEntry} />
        </details>
      )}
      <p className="rg-footer-note">
        {t(
          'Yalnızca sunucunun açtığı eller görünür. Katlanmış eller diğer oyunculara gösterilmez.',
        )}
      </p>
    </>
  );
}
