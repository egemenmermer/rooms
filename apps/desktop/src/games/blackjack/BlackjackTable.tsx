import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { t } from '../../i18n';
import { array, type Card } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';
import { SeatAvatar } from '../shared/SeatAvatar';
import { TableDock } from '../shared/TableDock';
import { useGameSounds, type GameSoundOptions } from '../shared/sounds';
import type { TableUI } from '../shared/table-ui';
import { TurnClock } from '../shared/TurnClock';
import {
  BET_CHIPS,
  actingUserId,
  blackjackMoves,
  chipStack,
  handTotal,
  isNatural,
  maxBet,
  outcomeOf,
  players as playersOf,
  results as resultsOf,
  rulesOf,
  totalLabel,
  type BlackjackHandView,
  type BlackjackMove,
  type BlackjackPlayerView,
} from './model';
import './blackjack.css';

const PLAY_ACTIONS = [
  ['hit', 'H'],
  ['stand', 'S'],
  ['double', 'D'],
  ['split', 'P'],
] as const;
const actionLabel = (name: string) =>
  ({
    hit: t('Kart al'),
    stand: t('Dur'),
    double: t('İkiye katla'),
    split: t('Ayır'),
    surrender: t('Teslim ol'),
  })[name] ?? name;

const outcomeLabel = (outcome: string) =>
  ({
    blackjack: 'Blackjack',
    win: t('Kazandı'),
    lose: t('Kaybetti'),
    push: t('Berabere'),
    surrender: t('Teslim oldu'),
  })[outcome] ?? outcome;

function moveText(move: BlackjackMove, name: string) {
  switch (move.kind) {
    case 'hit':
      return t('{name} kart aldı', { name });
    case 'bust':
      return t('{name} kart aldı ve aştı', { name });
    case 'stand':
      return t('{name} durdu', { name });
    case 'double':
      return t('{name} ikiye katladı', { name });
    case 'split':
      return t('{name} eli ayırdı', { name });
    case 'surrender':
      return t('{name} teslim oldu', { name });
    case 'insurance':
      return t('{name} sigorta aldı', { name });
    case 'decline-insurance':
      return t('{name} sigorta almadı', { name });
  }
}

const sumCards = (game: GamePublicState) =>
  array<Card>(game.view.dealer).length +
  playersOf(game).reduce(
    (sum, player) => sum + player.hands.reduce((count, hand) => count + hand.cards.length, 0),
    0,
  );
// Every card that lands (hit, double, split, the dealer's draw) gets the card cue.
const soundOptions: GameSoundOptions = { signals: (game) => ({ play: sumCards(game) }) };

/** A bet as a stack of chips, coloured by denomination. */
function ChipStack({ amount, className = '' }: { amount: number; className?: string }) {
  const chips = chipStack(amount),
    shown = chips.slice(-10);
  return (
    <span
      className={`bj-chips ${className}`}
      role="img"
      aria-label={t('{amount} fiş', { amount })}
      data-amount={amount}
    >
      {shown.map((value, index) => (
        <i
          key={index}
          className={`bj-chip bj-v${value}`}
          style={{ '--bj-i': index } as CSSProperties}
        />
      ))}
      <b>{amount}</b>
    </span>
  );
}

/** What changed since the previous view: new cards slide in from the shoe, the hole card flips. */
interface Motion {
  fresh: Set<string>;
  revealed: boolean;
  settled: boolean;
}
const cardKeys = (game: GamePublicState) => [
  ...array<Card>(game.view.dealer).map((card, index) => `dealer:${index}:${card.id}`),
  ...playersOf(game).flatMap((player) =>
    player.hands.flatMap((hand, index) =>
      hand.cards.map((card) => `${player.userId}:${index}:${card.id}`),
    ),
  ),
];
function useTableMotion(game: GamePublicState) {
  const previous = useRef<GamePublicState | null>(null),
    counter = useRef(0);
  const [motion, setMotion] = useState<Motion>({
    fresh: new Set(),
    revealed: false,
    settled: false,
  });
  const [log, setLog] = useState<{ id: number; move: BlackjackMove }[]>([]);
  // Layout effect: the class lands before paint, so a new card never flashes at its final place.
  // The first view is a baseline: opening a running table animates nothing.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = game;
    if (!before) return;
    if (before.history.length !== game.history.length) {
      const ended = game.history.length > before.history.length;
      setMotion({
        fresh: new Set(),
        revealed: ended && Number(before.view.dealerHiddenCount ?? 0) > 0,
        settled: ended && game.status === 'finished',
      });
      if (!ended || game.status === 'playing') setLog([]);
      return;
    }
    const seen = new Set(cardKeys(before));
    setMotion({
      fresh: new Set(cardKeys(game).filter((key) => !seen.has(key))),
      revealed:
        Number(before.view.dealerHiddenCount ?? 0) > 0 &&
        Number(game.view.dealerHiddenCount ?? 0) === 0,
      settled: before.status === 'playing' && game.status === 'finished',
    });
    const moves = blackjackMoves(before, game);
    if (moves.length)
      setLog((current) =>
        [...current, ...moves.map((move) => ({ id: ++counter.current, move }))].slice(-5),
      );
  }, [game]);
  return { motion, log };
}

function HandView({
  hand,
  index,
  player,
  active,
  open,
  outcome,
  motion,
  lastMove,
}: {
  hand: BlackjackHandView;
  index: number;
  player: BlackjackPlayerView;
  active: boolean;
  /** The round is still running: a soft total shows both values ("7/17"). */
  open: boolean;
  outcome: string | null;
  motion: Motion;
  lastMove: boolean;
}) {
  const total = handTotal(hand.cards),
    natural = isNatural(hand),
    bust = total.best > 21,
    // A split hand gets its second card only when play reaches it.
    pending = hand.split === true && hand.cards.length === 1;
  const badge = outcome
    ? outcomeLabel(outcome)
    : bust
      ? t('Aştı')
      : natural
        ? 'Blackjack'
        : hand.surrendered
          ? t('Teslim oldu')
          : null;
  const tone = outcome ?? (bust ? 'lose' : natural ? 'blackjack' : '');
  const won = outcome === 'win' || outcome === 'blackjack',
    lost = outcome === 'lose' || outcome === 'surrender',
    label = totalLabel(hand.cards, !open);
  return (
    <article
      className={`bj-hand${active ? ' active' : ''}${pending ? ' pending' : ''}${bust ? ' bust' : ''}${lastMove ? ' moved' : ''}`}
      aria-label={t('El {hand} · {total}', { hand: index + 1, total: label })}
      aria-current={active ? 'true' : undefined}
    >
      <div className="bj-cards">
        {hand.cards.map((card, cardIndex) => (
          <span
            key={card.id}
            className={`bj-card${motion.fresh.has(`${player.userId}:${index}:${card.id}`) ? ' enter' : ''}`}
            style={{ '--bj-n': cardIndex } as CSSProperties}
          >
            <PlayingCard card={card} />
          </span>
        ))}
      </div>
      <div className="bj-hand-meta">
        {hand.cards.length > 0 && <span className="bj-total">{label}</span>}
        {badge && <span className={`bj-badge ${tone}`}>{badge}</span>}
        {pending && <span className="bj-badge">{t('Sırası gelince kart alır')}</span>}
        {active && <span className="bj-badge turn">{t('Oynanıyor')}</span>}
      </div>
      <div className="bj-circle">
        {hand.bet > 0 && (
          <ChipStack
            amount={hand.bet}
            className={lost ? `collect${motion.settled ? ' animate' : ''}` : ''}
          />
        )}
        {won && outcome && (
          <ChipStack
            amount={outcome === 'blackjack' ? hand.bet * 1.5 : hand.bet}
            className={`pay${motion.settled ? ' animate' : ''}`}
          />
        )}
      </div>
    </article>
  );
}

export function BlackjackTable({ game, userId, can, action, timer }: TableUI) {
  useGameSounds(game, soundOptions);
  const { motion, log } = useTableMotion(game);
  const view = game.view,
    list = playersOf(game),
    resultList = resultsOf(game),
    rules = rulesOf(game),
    own = game.seats.find((seat) => seat.userId === userId),
    mine = list.find((player) => player.userId === userId),
    dealer = array<Card>(view.dealer),
    hidden = Math.max(0, Number(view.dealerHiddenCount ?? 0)),
    acting = actingUserId(game),
    insurance = view.insurancePending === true && game.status === 'playing',
    finished = game.status === 'finished',
    nameOf = (id: string) => game.seats.find((seat) => seat.userId === id)?.name ?? t('Oyuncu');
  const ownTurn = !!own && acting === userId;
  // Chips back (hands and insurance) minus chips staked this round.
  const netOf = (player: BlackjackPlayerView) =>
    resultList
      .filter((item) => item.userId === player.userId)
      .reduce((sum, item) => sum + item.returned, 0) +
    (player.insuranceReturned ?? 0) -
    player.hands.reduce((sum, hand) => sum + hand.bet, 0) -
    (player.insurance ?? 0);
  const lastMove = log[log.length - 1]?.move;

  // Bet between hands: chip buttons add even amounts, so any total stays a legal bet.
  const [bet, setBet] = useState(() => (mine?.bet && mine.bet >= 2 ? mine.bet : 20));
  const [sentBet, setSentBet] = useState<number | null>(null);
  const stack = own?.chips ?? 0,
    limit = maxBet(stack),
    betValid = bet >= 2 && bet % 2 === 0 && bet <= stack;
  const lastBet = mine?.bet ?? 0;

  // Keyboard: H hit, S stand, D double, P split (only when the server lists the move).
  const keys = useRef({ can, action });
  keys.current = { can, action };
  useEffect(() => {
    if (!ownTurn || insurance) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      const entry = PLAY_ACTIONS.find(([, key]) => key === event.key.toUpperCase());
      if (entry && keys.current.can(entry[0])) {
        event.preventDefault();
        void keys.current.action(entry[0]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ownTurn, insurance]);

  // Spots as the dealer sees them: seat 0 ("first base") on the dealer's left = the viewer's right.
  const seats = [...game.seats].sort((a, b) => b.seat - a.seat);
  const dealerTotal = handTotal(dealer);
  const insuranceStake = mine?.hands[0] ? mine.hands[0].bet / 2 : 0;
  const status = finished
    ? t('Sonraki el için bahsini seç')
    : insurance
      ? ownTurn
        ? t('Sigorta kararı senin')
        : t('Sigorta soruluyor · {name}', { name: acting ? nameOf(acting) : '—' })
      : ownTurn
        ? mine && mine.hands.length > 1
          ? t('Sıra sende · El {hand}', { hand: mine.activeHand + 1 })
          : t('Sıra sende')
        : acting
          ? t('{name} oynuyor', { name: nameOf(acting) })
          : t('Oyuncu bekleniyor');

  return (
    <div className="bj-table">
      {/* The fixed rules (decks, S17, 3:2, insurance, surrender) live in the rules popover. */}
      <div className="rx-badges">
        <span>{t('El {hand}', { hand: game.history.length + (finished ? 0 : 1) })}</span>
      </div>
      <section className="bj-felt" aria-label={t('Blackjack masası')}>
        <div className="bj-dealer">
          <div className="bj-shoe" role="img" aria-label={t('Kart kutusu')}>
            <span />
            <span />
            <span />
          </div>
          <small>{t('KRUPİYE')}</small>
          <div className="bj-cards dealer" aria-label={t('Krupiyenin kartları')}>
            {/* One list, so the hole card keeps its element from face down to face up and flips. */}
            {[...dealer, ...Array.from({ length: hidden }, () => undefined)].map((card, index) => (
              <span
                key={`d${index}`}
                className={`bj-card${
                  !card
                    ? ' hole'
                    : index === 1 && motion.revealed
                      ? ' flip'
                      : motion.fresh.has(`dealer:${index}:${card.id}`)
                        ? ' enter'
                        : ''
                }`}
                style={{ '--bj-n': index } as CSSProperties}
              >
                <PlayingCard card={card} />
              </span>
            ))}
          </div>
          {dealer.length > 0 && (
            <span className={`bj-total${dealerTotal.best > 21 ? ' bust' : ''}`}>
              {totalLabel(dealer, !hidden)}
            </span>
          )}
        </div>
        {finished ? (
          <ResultSummary game={game} dealer={dealer} netOf={netOf} nameOf={nameOf} />
        ) : insurance ? (
          // The decision itself is in the dock; the felt says who is being asked.
          <div className="bj-insurance" role="group" aria-label={t('Sigorta')}>
            <strong>{t('Krupiye As gösteriyor')}</strong>
            <span role="status">
              {t('Sigorta soruluyor · {name}', { name: acting ? nameOf(acting) : '—' })}
            </span>
          </div>
        ) : (
          <div className="bj-brand" aria-hidden="true">
            <strong>BLACKJACK PAYS 3:2</strong>
            <span>{rules.insurance ? 'INSURANCE PAYS 2:1' : 'DEALER STANDS ON 17'}</span>
          </div>
        )}
        <ol className="bj-spots">
          {seats.map((seat, index) => {
            const player = list.find((item) => item.userId === seat.userId),
              lift = Math.sin((Math.PI * (index + 0.5)) / seats.length);
            const net = player ? netOf(player) : 0;
            return (
              <li
                key={seat.userId}
                className={`bj-spot${seat.userId === userId ? ' own' : ''}${acting === seat.userId ? ' acting' : ''}${player?.hands.length ? '' : ' idle'}`}
                style={{ '--bj-lift': `${Math.round(lift * 34)}px` } as CSSProperties}
                aria-label={t('{name} · {chips} fiş', {
                  name: seat.name,
                  chips: player?.credits ?? seat.chips,
                })}
              >
                <div className="bj-hands">
                  {player?.hands.length ? (
                    player.hands.map((hand, handIndex) => (
                      <HandView
                        key={handIndex}
                        hand={hand}
                        index={handIndex}
                        player={player}
                        active={
                          acting === seat.userId && !insurance && player.activeHand === handIndex
                        }
                        open={!finished}
                        outcome={finished ? outcomeOf(resultList, player.userId, handIndex) : null}
                        motion={motion}
                        lastMove={
                          !!lastMove &&
                          lastMove.userId === player.userId &&
                          lastMove.hand === handIndex
                        }
                      />
                    ))
                  ) : (
                    <p className="bj-sitout">{t('Bu el oynamıyor')}</p>
                  )}
                </div>
                {!!player?.insurance && (
                  <span className="bj-badge insurance">
                    {t('Sigorta {amount}', { amount: player.insurance })}
                  </span>
                )}
                <div className="bj-seat">
                  <SeatAvatar seat={seat} game={game} timer={timer} />
                  <div>
                    <strong title={seat.name}>
                      {seat.name}
                      {seat.userId === userId ? t(' · sen') : ''}
                    </strong>
                    <small>
                      {t('{amount} fiş', { amount: player?.credits ?? seat.chips })}
                      {finished && player && net !== 0 && (
                        <b className={net > 0 ? 'up' : 'down'}>
                          {' '}
                          {net > 0 ? '+' : ''}
                          {net}
                        </b>
                      )}
                    </small>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      {log.length > 0 && (
        <ol className="bj-log" aria-label={t('Son hamleler')} aria-live="polite">
          {log.map((item) => (
            <li key={item.id}>{moveText(item.move, nameOf(item.move.userId))}</li>
          ))}
        </ol>
      )}
      {own && (
        <TableDock label={t('Hamle')} className="bj-dock">
          <div className="rg-hand-strip bj-strip">
            <div>
              <h3>{status}</h3>
              {ownTurn && !insurance && <p>{t('Kısayollar: H kart · S dur · D katla · P ayır')}</p>}
            </div>
            <TurnClock timer={timer} />
            {game.status === 'playing' ? (
              insurance ? (
                // Your own insurance question: both answers right here, disabled with a reason.
                ownTurn && (
                  <div
                    className="bj-insurance-choice"
                    role="group"
                    aria-label={t('Sigorta kararı')}
                  >
                    <p>
                      {t('Sigorta {stake} fiş. Krupiye blackjack yaparsa 2:1 öder.', {
                        stake: insuranceStake,
                      })}
                    </p>
                    <button
                      className="button primary"
                      disabled={!can('insurance')}
                      title={!can('insurance') ? t('Fişin sigortaya yetmiyor') : undefined}
                      onClick={() => void action('insurance')}
                    >
                      {t('Sigorta al')}
                    </button>
                    <button
                      className="button secondary"
                      disabled={!can('decline-insurance')}
                      onClick={() => void action('decline-insurance')}
                    >
                      {t('Sigorta alma')}
                    </button>
                  </div>
                )
              ) : (
                <div className="rg-actions">
                  {PLAY_ACTIONS.map(([name]) => (
                    <button
                      className={`button ${name === 'hit' ? 'primary' : 'secondary'}`}
                      key={name}
                      disabled={!can(name)}
                      title={
                        !can(name)
                          ? t('Bu hamle şu anda sunucu tarafından izinli değil')
                          : undefined
                      }
                      onClick={() => void action(name)}
                    >
                      {actionLabel(name)}
                    </button>
                  ))}
                  {can('surrender') && (
                    <button className="button secondary" onClick={() => void action('surrender')}>
                      {actionLabel('surrender')}
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="bj-bet" role="group" aria-label={t('Sonraki el bahsi')}>
                <ChipStack amount={betValid ? bet : 0} className="next" />
                <div className="bj-bet-chips">
                  {BET_CHIPS.map((value) => (
                    <button
                      key={value}
                      className={`bj-chip-button bj-v${value}`}
                      disabled={!can('bet') || (betValid ? bet : 0) + value > limit}
                      aria-label={t('{amount} fiş ekle', { amount: value })}
                      onClick={() => {
                        setSentBet(null);
                        setBet(
                          (current) => (current >= 2 && current <= stack ? current : 0) + value,
                        );
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <button
                  className="button secondary"
                  disabled={!can('bet')}
                  onClick={() => {
                    setSentBet(null);
                    setBet(0);
                  }}
                >
                  {t('Temizle')}
                </button>
                <button
                  className="button secondary"
                  disabled={!can('bet') || lastBet < 2 || lastBet > limit}
                  onClick={() => {
                    setSentBet(null);
                    setBet(lastBet);
                  }}
                >
                  {t('Aynı bahis')}
                </button>
                <button
                  className="button primary"
                  disabled={!can('bet') || !betValid}
                  title={
                    stack < 2
                      ? t('Fişin en küçük bahsi karşılamıyor.')
                      : !betValid
                        ? t('Bahis en az 2 ve çift olmalı')
                        : undefined
                  }
                  onClick={() =>
                    void action('bet', { amount: bet }).then((ok) => {
                      if (ok) setSentBet(bet);
                    })
                  }
                >
                  {sentBet === bet
                    ? t('Bahis {amount} · tamam', { amount: bet })
                    : t('Bahsi belirle')}
                </button>
              </div>
            )}
          </div>
        </TableDock>
      )}
    </div>
  );
}

/** The settled hand on the felt: the dealer's result and each player's net and outcomes. */
function ResultSummary({
  game,
  dealer,
  netOf,
  nameOf,
}: {
  game: GamePublicState;
  dealer: Card[];
  netOf: (player: BlackjackPlayerView) => number;
  nameOf: (id: string) => string;
}) {
  const dealerTotal = handTotal(dealer),
    resultList = resultsOf(game);
  return (
    <section className="bj-summary" aria-label={t('El sonucu')}>
      <h3>
        {dealerTotal.best > 21
          ? t('Krupiye {total} ile aştı', { total: dealerTotal.best })
          : isNatural({ cards: dealer })
            ? t('Krupiye blackjack yaptı')
            : t('Krupiye {total}', { total: dealerTotal.best })}
      </h3>
      <ul>
        {playersOf(game).map((player) => (
          <li key={player.userId}>
            <strong>{nameOf(player.userId)}</strong>
            <span>
              {netOf(player)
                ? `${netOf(player) > 0 ? '+' : ''}${t('{amount} fiş', { amount: netOf(player) })} · `
                : ''}
              {player.hands
                .map((_, index) => outcomeOf(resultList, player.userId, index))
                .filter((outcome): outcome is string => !!outcome)
                .map(outcomeLabel)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
