import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Layers } from 'lucide-react';
import { Avatar, EmptyState } from '@rooms/design';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { t } from '../../i18n';
import { rankNames, suitNames, type Card } from '../shared/model';
import { PlayingCard } from '../shared/PlayingCard';
import type { TableUI } from '../shared/table-ui';
import {
  dealSummary,
  readDeal,
  readSeries,
  relativePosition,
  roundSeats,
  sideCount,
  sideName,
  sideOf,
  sidePoints,
  takesPile,
  type PistiDeal,
  type PistiSeries,
  type Position,
} from './model';
import { playPistiCue } from './sounds';
import './pisti.css';

/** Seconds a turn lasts on the server (`TURN_DURATION_MS`); only scales the seat clock ring. */
const TURN_SECONDS = 45;
const LOG_LENGTH = 5;

export const cardName = (card: Card) =>
  `${suitNames[card.suit] ?? card.suit} ${rankNames[card.rank] ?? card.rank}`;

const seatName = (game: GamePublicState, round: number) =>
  roundSeats(game)[round]?.name ?? t('Oyuncu');

function playLine(game: GamePublicState, deal: PistiDeal) {
  const play = deal.lastPlay;
  return play
    ? t('{name} {card} attı', { name: seatName(game, play.seat), card: cardName(play.card) })
    : '';
}

function captureLine(game: GamePublicState, deal: PistiDeal) {
  const capture = deal.lastCapture;
  if (!capture) return '';
  const name = seatName(game, capture.seat);
  switch (capture.kind) {
    case 'pisti':
      return t('{name} pişti yaptı · +10', { name });
    case 'jack-pisti':
      return t('{name} vale pişti yaptı · +20', { name });
    case 'remainder':
      return t('Yerde kalan {count} kart son alan {name} tarafına gitti', {
        name,
        count: capture.count,
      });
    default:
      return capture.card?.rank === 11
        ? t('{name} valeyle {count} kart aldı', { name, count: capture.count })
        : t('{name} {count} kart aldı', { name, count: capture.count });
  }
}

interface Moment {
  key: string;
  kind: 'pisti' | 'jack-pisti';
  name: string;
}
interface Ghost {
  key: string;
  count: number;
  top: Card | null;
  toward: Position;
}

/**
 * Table events derived from consecutive views (the server sends no event bodies). The first view
 * after mount is the baseline: nothing replays when the page opens or reconnects. A finished deal
 * shows up as `series.rounds` growing, with its last play in `series.previous`.
 */
function useTableEvents(game: GamePublicState, deal: PistiDeal, series: PistiSeries) {
  const rounds = series.rounds.length,
    key = `${rounds}:${deal.lastPlay?.seq ?? 0}`;
  const [baseline] = useState(key);
  const seen = useRef({ key, rounds, turn: `${rounds}:${deal.turn}` });
  const [log, setLog] = useState<string[]>(() =>
    [captureLine(game, deal), playLine(game, deal)].filter(Boolean),
  );
  const [moment, setMoment] = useState<Moment | null>(null),
    [ghost, setGhost] = useState<Ghost | null>(null),
    [summaryFor, setSummaryFor] = useState<number | null>(null);
  useEffect(() => {
    if (seen.current.key === key) return;
    const dealEnded = rounds > seen.current.rounds;
    seen.current = { ...seen.current, key, rounds };
    // The match module deals the next round inside the same action, so a finished deal is in
    // `series.previous`; the final deal of a match stays the current view (`previous` is older).
    const source = dealEnded && !series.winners && series.previous ? series.previous : deal,
      play = source.lastPlay,
      capture = source.lastCapture;
    if (dealEnded) setSummaryFor(rounds);
    if (!play) return;
    const lines = [playLine(game, source)];
    const fresh = capture && capture.seq === play.seq ? capture : null;
    if (fresh) {
      lines.push(captureLine(game, source));
      setGhost({
        key,
        count: fresh.count,
        top: fresh.kind === 'remainder' ? null : fresh.card,
        toward: relativePosition(source, fresh.seat),
      });
      if (fresh.kind === 'pisti' || fresh.kind === 'jack-pisti') {
        setMoment({ key, kind: fresh.kind, name: seatName(game, fresh.seat) });
        playPistiCue('pisti');
      } else playPistiCue(fresh.kind === 'remainder' ? 'play' : 'capture');
    } else playPistiCue('play');
    setLog((current) => [...lines.reverse(), ...current].slice(0, LOG_LENGTH));
  }, [key]);
  // Clear the transient sweep and the PİŞTİ! moment after they have played.
  useEffect(() => {
    if (!ghost) return;
    const timeout = setTimeout(() => setGhost(null), 500);
    return () => clearTimeout(timeout);
  }, [ghost?.key]);
  useEffect(() => {
    if (!moment) return;
    const timeout = setTimeout(() => setMoment(null), 1800);
    return () => clearTimeout(timeout);
  }, [moment?.key]);
  const turnKey = `${rounds}:${deal.turn}`;
  useEffect(() => {
    if (seen.current.turn === turnKey) return;
    seen.current = { ...seen.current, turn: turnKey };
    if (deal.viewerSeat !== null && deal.turn === deal.viewerSeat) playPistiCue('turn');
  }, [turnKey]);
  return {
    animate: key !== baseline,
    key,
    log,
    moment,
    ghost,
    summaryOpen: summaryFor === rounds,
    closeSummary: () => setSummaryFor(null),
  };
}

export function PistiTable(ui: TableUI) {
  const deal = readDeal(ui.game.view);
  if (!deal)
    return (
      <EmptyState size="inline" icon={<Layers size={22} />} title={t('Kartlar dağıtılıyor')}>
        {t('Masanın durumu birazdan gelir.')}
      </EmptyState>
    );
  // A rematch is a new history entry: start its log, summary and baselines afresh.
  return (
    <PistiBoard
      key={ui.game.history.length}
      {...ui}
      deal={deal}
      series={readSeries(ui.game.view)}
    />
  );
}

function PistiBoard({
  game,
  can,
  action,
  timer,
  deal,
  series,
}: TableUI & { deal: PistiDeal; series: PistiSeries }) {
  const seats = roundSeats(game),
    events = useTableEvents(game, deal, series),
    [showPrevious, setShowPrevious] = useState(false),
    finished = !!series.winners || game.status === 'finished',
    viewerSide = deal.viewerSeat === null ? null : sideOf(deal, deal.viewerSeat),
    // Own side at the bottom-left corner, the other side top-right (spectators: side 0 below).
    homeSide = viewerSide ?? 0,
    play = deal.lastPlay,
    flyFrom = play && !play.captured ? relativePosition(deal, play.seat) : null,
    hand = deal.hand,
    yourTurn = deal.viewerSeat !== null && deal.turn === deal.viewerSeat && !finished;
  const turnName = deal.turn === null ? '' : seatName(game, deal.turn);
  const previousPoints = series.rounds.at(-1)?.points ?? [];
  return (
    <div className="pp-table">
      <div className="rx-badges">
        <span>{t('Maç {target} puan', { target: deal.target })}</span>
        <span>{t('El {hand}', { hand: series.rounds.length + (finished ? 0 : 1) })}</span>
        {deal.teams && <span>{t('Eşli · karşılıklı')}</span>}
        {series.previous && !finished && (
          <button
            type="button"
            className="pp-badge-button"
            aria-expanded={showPrevious || events.summaryOpen}
            onClick={() =>
              events.summaryOpen ? events.closeSummary() : setShowPrevious((v) => !v)
            }
          >
            {t('Önceki el özeti')}
          </button>
        )}
      </div>
      <div className="pp-layout">
        <section
          className={`pp-felt seats-${deal.seats}`}
          aria-label={t('Pişti masası')}
          data-turn={deal.turn ?? undefined}
        >
          {seats.slice(0, deal.seats).map((seat, round) => {
            const position = relativePosition(deal, round),
              turn = deal.turn === round && !finished,
              count = deal.handCounts[round] ?? 0,
              own = round === deal.viewerSeat,
              partner =
                deal.teams &&
                deal.viewerSeat !== null &&
                !own &&
                sideOf(deal, round) === viewerSide;
            return (
              <article
                key={seat.userId}
                className={`pp-seat pos-${position} ${turn ? 'turn' : ''} ${own ? 'own' : ''}`}
                aria-label={
                  turn
                    ? t('{name} · sırası · {count} kart', { name: seat.name, count })
                    : t('{name} · {count} kart', { name: seat.name, count })
                }
              >
                <span className="pp-avatar">
                  <Avatar name={seat.name} />
                  {turn && timer !== null && <SeatClock seconds={timer} />}
                </span>
                <span className="pp-seat-text">
                  <strong title={seat.name}>{seat.name}</strong>
                  <small>
                    {partner
                      ? t('Eşin')
                      : seat.bot
                        ? t('Bot')
                        : deal.teams
                          ? t('Takım {number}', { number: sideOf(deal, round) + 1 })
                          : t('{count} kart', { count })}
                    {turn && timer !== null && ` · ${t('{seconds} sn', { seconds: timer })}`}
                  </small>
                </span>
                {!own && count > 0 && (
                  <span className="pp-backs" aria-hidden="true">
                    {Array.from({ length: Math.min(count, 4) }, (_, index) => (
                      <i key={index} />
                    ))}
                  </span>
                )}
              </article>
            );
          })}

          {Array.from({ length: sideCount(deal) }, (_, side) => (
            <div
              key={side}
              className={`pp-captured ${side === homeSide ? 'home' : 'away'}`}
              aria-label={t('{name} · {count} kart aldı', {
                name: sideName(game, deal, side),
                count: deal.capturedCounts[side] ?? 0,
              })}
            >
              <span className="pp-captured-stack" aria-hidden="true">
                {Array.from(
                  { length: Math.min(6, Math.ceil((deal.capturedCounts[side] ?? 0) / 4)) },
                  (_, index) => (
                    <i key={index} style={{ '--i': index } as CSSProperties} />
                  ),
                )}
              </span>
              <span>
                <b>{t('{count} kart', { count: deal.capturedCounts[side] ?? 0 })}</b>
                {(deal.pisti[side] ?? 0) + (deal.jackPisti[side] ?? 0) > 0 && (
                  <em>
                    {' · '}
                    {t('{count} pişti', {
                      count: (deal.pisti[side] ?? 0) + (deal.jackPisti[side] ?? 0),
                    })}
                  </em>
                )}
              </span>
            </div>
          ))}

          <div className="pp-center">
            <div
              className="pp-deck"
              aria-label={t('Destede {count} kart', { count: deal.deckCount })}
            >
              {deal.deckCount > 0 ? (
                <>
                  <span className="pp-deck-stack" aria-hidden="true">
                    {Array.from({ length: Math.min(5, Math.ceil(deal.deckCount / 8)) }, (_, i) => (
                      <i key={i} style={{ '--i': i } as CSSProperties} />
                    ))}
                  </span>
                  <small>{t('Deste {count}', { count: deal.deckCount })}</small>
                </>
              ) : (
                <small>{t('Deste bitti')}</small>
              )}
            </div>
            <div
              className="pp-pile"
              aria-label={
                deal.tableTop
                  ? t('Yerde {count} kart · üstte {card}', {
                      count: deal.tableCount,
                      card: cardName(deal.tableTop),
                    })
                  : t('Yer boş')
              }
            >
              {deal.tableCount > 1 &&
                Array.from({ length: Math.min(deal.tableCount - 1, 10) }, (_, index) => (
                  <i
                    key={index}
                    className="pp-pile-layer"
                    style={{ '--i': index } as CSSProperties}
                    aria-hidden="true"
                  />
                ))}
              {deal.tableTop ? (
                <span
                  key={events.key}
                  className={`pp-top ${events.animate && flyFrom ? `fly-from-${flyFrom}` : ''}`}
                  style={{ '--layers': Math.min(deal.tableCount - 1, 10) } as CSSProperties}
                >
                  <PlayingCard card={deal.tableTop} />
                </span>
              ) : (
                <span className="pp-empty-pile">{t('Yer boş')}</span>
              )}
              {deal.tableCount > 0 && (
                <small className="pp-pile-count">
                  {t('Yerde {count} kart', { count: deal.tableCount })}
                </small>
              )}
              {events.ghost && (
                <span
                  key={events.ghost.key}
                  className={`pp-ghost sweep-${events.ghost.toward}`}
                  aria-hidden="true"
                >
                  {events.ghost.top ? <PlayingCard card={events.ghost.top} /> : <PlayingCard />}
                  <b>{events.ghost.count}</b>
                </span>
              )}
            </div>
          </div>

          <p className="pp-last" role="status">
            {[captureLine(game, deal), playLine(game, deal)].filter(Boolean).join(' · ') ||
              (deal.turn !== null ? t('{name} açıyor', { name: turnName }) : '')}
          </p>

          {events.moment && (
            <div
              key={events.moment.key}
              className={`pp-moment ${events.moment.kind}`}
              role="alert"
              aria-label={
                events.moment.kind === 'jack-pisti'
                  ? t('{name} vale pişti yaptı · +20', { name: events.moment.name })
                  : t('{name} pişti yaptı · +10', { name: events.moment.name })
              }
            >
              <strong>
                {events.moment.kind === 'jack-pisti' ? t('VALE PİŞTİ!') : t('PİŞTİ!')}
              </strong>
              <span>
                {events.moment.name} · {events.moment.kind === 'jack-pisti' ? '+20' : '+10'}
              </span>
            </div>
          )}
        </section>

        <aside className="pp-side">
          <MatchScore game={game} deal={deal} series={series} viewerSide={viewerSide} />
          {(events.summaryOpen || showPrevious) && series.previous && !finished && (
            <section className="pp-panel pp-deal-summary">
              <header>
                <h3>{t('El {hand} bitti', { hand: series.rounds.length })}</h3>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => {
                    events.closeSummary();
                    setShowPrevious(false);
                  }}
                >
                  {t('Kapat')}
                </button>
              </header>
              <DealSummary game={game} deal={series.previous} points={previousPoints} />
            </section>
          )}
          <section className="pp-panel pp-log">
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

      {finished ? (
        <MatchEnd game={game} deal={deal} series={series} />
      ) : (
        hand && (
          <section className="rx-rack pp-rack">
            <header>
              <strong>
                {yourTurn
                  ? t('Sıra sende · bir kart at')
                  : t('{name} oynuyor', { name: turnName || t('Oyuncu') })}
              </strong>
              <small>{t('ELİN · {count} kart', { count: hand.length })}</small>
            </header>
            <div className="rx-card-rack pp-hand">
              {hand.length ? (
                hand.map((card, index) => (
                  <span
                    key={card.id}
                    className={`pp-hand-card ${yourTurn && takesPile(deal.tableTop, card) ? 'takes' : ''}`}
                    style={{ '--deal': index } as CSSProperties}
                  >
                    <PlayingCard
                      card={card}
                      disabled={!can('play')}
                      onClick={() => void action('play', { payload: { cardId: card.id } })}
                    />
                  </span>
                ))
              ) : (
                <p>{t('Yeni kartlar dağıtılıyor.')}</p>
              )}
            </div>
          </section>
        )
      )}
    </div>
  );
}

function SeatClock({ seconds }: { seconds: number }) {
  const fraction = Math.max(0, Math.min(1, seconds / TURN_SECONDS)),
    circumference = 2 * Math.PI * 21;
  return (
    <svg
      className={`pp-clock ${seconds <= 10 ? 'late' : ''}`}
      viewBox="0 0 46 46"
      aria-hidden="true"
    >
      <circle cx="23" cy="23" r="21" />
      <circle
        cx="23"
        cy="23"
        r="21"
        className="pp-clock-left"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
      />
    </svg>
  );
}

function MatchScore({
  game,
  deal,
  series,
  viewerSide,
}: {
  game: GamePublicState;
  deal: PistiDeal;
  series: PistiSeries;
  viewerSide: number | null;
}) {
  return (
    <section className="pp-panel pp-score">
      <h3>{t('Maç · {target} puana', { target: deal.target })}</h3>
      {Array.from({ length: sideCount(deal) }, (_, side) => {
        const total = sidePoints(deal, series.totals, side);
        return (
          <div
            key={side}
            className={`pp-score-row ${side === viewerSide ? 'own' : ''} ${series.winners?.some((seat) => sideOf(deal, seat) === side) ? 'winner' : ''}`}
          >
            <span title={sideName(game, deal, side)}>{sideName(game, deal, side)}</span>
            <strong>{t('{score} puan', { score: total })}</strong>
            <meter
              min={0}
              max={deal.target}
              value={Math.min(total, deal.target)}
              aria-label={t('{name} · {score} / {target}', {
                name: sideName(game, deal, side),
                score: total,
                target: deal.target,
              })}
            />
          </div>
        );
      })}
    </section>
  );
}

function DealSummary({
  game,
  deal,
  points,
}: {
  game: GamePublicState;
  deal: PistiDeal;
  points: number[];
}) {
  const rows = dealSummary(deal, points);
  const line = (label: string, value: (side: (typeof rows)[number]) => string) => (
    <tr>
      <th scope="row">{label}</th>
      {rows.map((side) => (
        <td key={side.side}>{value(side)}</td>
      ))}
    </tr>
  );
  return (
    <table className="pp-summary">
      <thead>
        <tr>
          <th scope="col">{t('Puan dökümü')}</th>
          {rows.map((side) => (
            <th scope="col" key={side.side} title={sideName(game, deal, side.side)}>
              {sideName(game, deal, side.side)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {line(t('Alınan kart'), (side) => String(side.cards))}
        {line(t('En çok kart'), (side) => (side.mostCards ? '+3' : '—'))}
        {line(t('Pişti (10)'), (side) =>
          side.pisti ? `${side.pisti} · +${side.pisti * 10}` : '—',
        )}
        {line(t('Vale pişti (20)'), (side) =>
          side.jackPisti ? `${side.jackPisti} · +${side.jackPisti * 20}` : '—',
        )}
        {line(t('As, vale, ♣2, ♦10'), (side) => `+${side.cardPoints}`)}
      </tbody>
      <tfoot>{line(t('Bu el'), (side) => String(side.total))}</tfoot>
    </table>
  );
}

function MatchEnd({
  game,
  deal,
  series,
}: {
  game: GamePublicState;
  deal: PistiDeal;
  series: PistiSeries;
}) {
  const winnerSides = [...new Set((series.winners ?? []).map((seat) => sideOf(deal, seat)))];
  const finalPoints = deal.result?.points ?? series.rounds.at(-1)?.points ?? [];
  return (
    <section className="pp-panel pp-match-end" aria-label={t('Maç sonucu')}>
      <h2>
        {winnerSides.length === 1
          ? t('Maç bitti · {name} kazandı', { name: sideName(game, deal, winnerSides[0]) })
          : winnerSides.length > 1
            ? t('Maç berabere bitti')
            : t('El tamamlandı')}
      </h2>
      <div className="pp-match-grid">
        <div>
          <h3>{t('Son el')}</h3>
          <DealSummary game={game} deal={deal} points={finalPoints} />
        </div>
        <div>
          <h3>{t('Maç cetveli')}</h3>
          <table className="pp-summary">
            <thead>
              <tr>
                <th scope="col">{t('El')}</th>
                {Array.from({ length: sideCount(deal) }, (_, side) => (
                  <th scope="col" key={side} title={sideName(game, deal, side)}>
                    {sideName(game, deal, side)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.rounds.map((round, index) => (
                <tr key={index}>
                  <th scope="row">{index + 1}</th>
                  {Array.from({ length: sideCount(deal) }, (_, side) => (
                    <td key={side}>{sidePoints(deal, round.points, side)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t('Toplam')}</th>
                {Array.from({ length: sideCount(deal) }, (_, side) => (
                  <td key={side}>{sidePoints(deal, series.totals, side)}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
