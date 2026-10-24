import { t } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { Avatar, LoadingView } from '@rooms/design';
import { Dices, Trophy, Undo2, Check } from 'lucide-react';
import type { TavlaTurnRecord } from '../../../../../packages/games/src/tavla';
import { SeatAvatar } from '../shared/SeatAvatar';
import { playGameCue, useGameSounds } from '../shared/sounds';
import type { TableUI } from '../shared/table-ui';
import {
  bottomSeat,
  matchToLabel,
  movableSources,
  opponentTrail,
  pointNumber,
  targetsFrom,
  type TavlaFrom,
  type TavlaStep,
  type TavlaTableView,
  type TavlaTo,
} from './model';
import { seatColor, TavlaBoard } from './TavlaBoard';
import './tavla.css';

const CHECKERS = 15;

/** "13/7*" from the mover's side: point numbers, Bar, and the tray as "Topla". */
export function stepText(step: TavlaStep, seat: number) {
  const from = step.from === 'bar' ? t('Bar') : String(pointNumber(step.from, seat)),
    to = step.to === 'off' ? t('Topla') : String(pointNumber(step.to, seat));
  return `${from}/${to}${step.hit ? '*' : ''}`;
}

const diceText = (dice: number[]) => dice.join('-');

export function TavlaTable(ui: TableUI) {
  const view = ui.game.view as Partial<TavlaTableView>;
  // A table whose first round view has not arrived yet (or an older server) has no board to draw.
  if (!Array.isArray(view.points) || view.points.length !== 24 || !view.match)
    return <LoadingView size="inline" label={t('Tavla tahtası hazırlanıyor…')} />;
  return <TavlaRound {...ui} />;
}

function TavlaRound({ game, userId, can, action, timer }: TableUI) {
  useGameSounds(game, { move: 'tile' });
  const view = game.view as unknown as TavlaTableView,
    own = game.seats.find((seat) => seat.userId === userId),
    you = view.you,
    bottom = bottomSeat(you),
    top = 1 - bottom,
    name = (seat: number) =>
      game.seats.find((entry) => entry.seat === seat)?.name ??
      t('Oyuncu {number}', { number: seat + 1 }),
    series = view.series,
    totals = series?.totals ?? view.match.scores,
    matchTo = view.match.matchTo,
    roundNumber = (series?.rounds.length ?? 0) + (view.phase === 'over' ? 0 : 1);
  const myMove = you !== null && view.turn === you && view.phase === 'moving' && can('move'),
    legal = myMove ? view.legalMoves : [],
    sources = movableSources(legal);
  const [picked, setPicked] = useState<TavlaFrom | null>(null);
  const grabbed = useRef<TavlaFrom | null>(null);
  const selected =
    picked !== null && sources.includes(picked) ? picked : sources.length === 1 ? sources[0] : null;
  const targets = selected === null ? [] : targetsFrom(legal, selected);
  const stepKey = `${view.phase}:${view.turn}:${view.moves.length}:${roundNumber}`;
  useEffect(() => setPicked(null), [stepKey]);

  // The dice tumble once per new roll, never on first paint (reduced motion: CSS turns it off).
  const rollKey = JSON.stringify([
    roundNumber,
    view.opening,
    view.dice,
    view.lastTurn?.dice,
    view.lastTurn?.seat,
  ]);
  const [rolling, setRolling] = useState(false);
  const firstKey = useRef(rollKey);
  useEffect(() => {
    if (firstKey.current === rollKey) return;
    firstKey.current = '';
    // One rattle per roll, the viewer's and the opponent's alike (the view carries both).
    playGameCue('dice');
    setRolling(true);
    const timeout = setTimeout(() => setRolling(false), 650);
    return () => clearTimeout(timeout);
  }, [rollKey]);

  // A short action log built from the finished turns this client has seen in the current round.
  const [log, setLog] = useState<TavlaTurnRecord[]>(() => (view.lastTurn ? [view.lastTurn] : []));
  const lastKey = view.lastTurn ? JSON.stringify(view.lastTurn) : '';
  const logRound = useRef(roundNumber);
  useEffect(() => {
    const fresh = logRound.current !== roundNumber;
    logRound.current = roundNumber;
    setLog((entries) => {
      const base = fresh ? [] : entries;
      if (!view.lastTurn || (base.length && JSON.stringify(base[0]) === lastKey)) return base;
      return [view.lastTurn, ...base].slice(0, 6);
    });
  }, [lastKey, roundNumber]);

  const move = (from: TavlaFrom, to: TavlaTo) => {
    setPicked(null);
    grabbed.current = null;
    void action('move', { payload: { from, to } });
  };
  const choose = (from: TavlaFrom) => {
    // The click that ends a press on the checker just grabbed keeps it selected.
    if (grabbed.current === from) {
      grabbed.current = null;
      return;
    }
    setPicked(selected === from ? null : from);
  };
  const onPoint = (index: number) => {
    if (selected !== null && targets.includes(index)) move(selected, index);
    else if (sources.includes(index)) choose(index);
    else setPicked(null);
  };

  useEffect(() => {
    if (!can('roll')) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== ' ' || target?.closest('button, input, textarea, select, [role="button"]'))
        return;
      event.preventDefault();
      void action('roll');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The last round's result stays up until someone rolls the next round's opening die.
  const finished = view.result
    ? view
    : view.phase === 'opening' && view.opening.every((die) => die === null) && !view.openingTie
      ? (series?.previous ?? null)
      : null;
  const roundResult = finished?.result ?? null;
  const matchWinner = series?.winners?.length ? series.winners[0] : null;
  const passed = view.phase !== 'moving' && view.lastTurn?.passed ? view.lastTurn : null;

  let status: string;
  if (view.phase === 'over') status = matchWinner === null ? t('El bitti') : t('Maç bitti');
  else if (view.phase === 'opening')
    status =
      view.turn === you
        ? t('Açılış zarını at: büyük atan başlar.')
        : t('{name} açılış zarını atıyor.', { name: name(view.turn ?? 0) });
  else if (view.phase === 'roll')
    status =
      view.turn === you
        ? t('Sıra sende: zar at.')
        : t('{name} zar atacak.', { name: name(view.turn ?? 0) });
  else if (view.turn === you)
    status = legal.length
      ? selected === null
        ? t('Oynayacağın pulu seç.')
        : t('Parlayan haneye oyna ya da başka pul seç.')
      : t('Hamlen tamam: onayla ya da geri al.');
  else status = t('{name} oynuyor.', { name: name(view.turn ?? 0) });
  if (view.phase === 'opening' && view.openingTie)
    status = `${t('Zarlar eşit geldi ({value}): yeniden atılıyor.', { value: view.openingTie })} ${status}`;

  const seatPanel = (seat: number, place: 'top' | 'bottom') => {
    const turn = view.turn === seat && view.phase !== 'over',
      seatInfo = game.seats.find((entry) => entry.seat === seat);
    return (
      <div
        className={`tv-seat ${place}${turn ? ' turn' : ''}`}
        aria-current={turn ? 'true' : undefined}
      >
        {seatInfo ? (
          <SeatAvatar seat={seatInfo} game={game} timer={timer} />
        ) : (
          <Avatar name={name(seat)} />
        )}
        <div className="tv-seat-name">
          <strong title={name(seat)}>{name(seat)}</strong>
          <small>
            <i className={`tv-chip ${seatColor(seat)}`} aria-hidden="true" />
            {seat === 0 ? t('Açık pullar') : t('Koyu pullar')}
          </small>
        </div>
        <dl>
          <div>
            <dt>{t('Kalan')}</dt>
            <dd>{view.pips[seat]}</dd>
          </div>
          <div>
            <dt>{t('Toplanan')}</dt>
            <dd>
              {view.off[seat]}/{CHECKERS}
            </dd>
          </div>
        </dl>
      </div>
    );
  };

  return (
    <div className="tv-table">
      <div className="tv-score" aria-label={t('Maç skoru')}>
        <span className="tv-score-name">{name(bottom)}</span>
        <strong>
          {totals[bottom] ?? 0} – {totals[top] ?? 0}
        </strong>
        <span className="tv-score-name">{name(top)}</span>
        <small>
          · {matchToLabel(matchTo)} · {t('El {hand}', { hand: roundNumber })}
        </small>
      </div>
      {seatPanel(top, 'top')}
      <div className="tv-board-wrap">
        <TavlaBoard
          view={view}
          selection={{ sources, selected, targets }}
          trail={opponentTrail(view, you)}
          trailSeat={
            view.phase === 'moving' && view.turn !== you ? view.turn : (view.lastTurn?.seat ?? null)
          }
          rollKey={rollKey}
          rolling={rolling}
          onPoint={onPoint}
          onGrab={(from) => {
            // Pressing a lit target (often your own point) is a move, not a new pick.
            if (selected === from || (selected !== null && (targets as TavlaFrom[]).includes(from)))
              return;
            grabbed.current = from;
            setPicked(from);
          }}
          onBar={() => choose('bar')}
          onOff={() => selected !== null && targets.includes('off') && move(selected, 'off')}
          onDrop={(to) => {
            // Only a press that started on another checker is a drag; plain clicks go through onClick.
            const from = grabbed.current;
            if (from === null || from === to) return;
            grabbed.current = null;
            if (targetsFrom(legal, from).includes(to)) move(from, to);
          }}
        />
        {roundResult && finished && (
          <section className="tv-summary" aria-live="polite">
            <Trophy size={22} aria-hidden="true" />
            <h2>
              {matchWinner !== null
                ? t('Maçı {name} kazandı', { name: name(matchWinner) })
                : t('Eli {name} kazandı', { name: name(roundResult.winner) })}
            </h2>
            <p className={roundResult.mars ? 'mars' : ''}>
              {roundResult.mars ? t('Mars! (2 puan)') : t('Normal oyun (1 puan)')}
            </p>
            <p>
              {t('Maç: {own} – {other} · {target}', {
                own: `${name(bottom)} ${totals[bottom] ?? 0}`,
                other: `${totals[top] ?? 0} ${name(top)}`,
                target: matchToLabel(matchTo),
              })}
            </p>
            {matchWinner === null && <small>{t('Sonraki el açılış zarıyla başlar.')}</small>}
          </section>
        )}
      </div>
      {seatPanel(bottom, 'bottom')}
      <div className="tv-controls">
        <p className="tv-status" role="status">
          {status}
        </p>
        {passed && (
          <p className="tv-passed" role="status">
            {t('Oynayacak hamle yok')} ·{' '}
            {t('{name} {dice} attı, sıra geçti.', {
              name: name(passed.seat),
              dice: diceText(passed.dice),
            })}
          </p>
        )}
        {own && you !== null && (
          <div className="tv-actions">
            <button
              className="button primary"
              disabled={!can('roll')}
              onClick={() => void action('roll')}
              title={can('roll') ? t('Kısayol: Boşluk') : undefined}
            >
              <Dices size={16} aria-hidden="true" />
              {view.phase === 'opening' ? t('Açılış zarını at') : t('Zar at')}
            </button>
            <button
              className="button secondary"
              disabled={!can('undo')}
              onClick={() => void action('undo')}
            >
              <Undo2 size={16} aria-hidden="true" />
              {t('Geri al')}
            </button>
            <button
              className="button primary"
              disabled={!can('confirm')}
              onClick={() => void action('confirm')}
            >
              <Check size={16} aria-hidden="true" />
              {t('Onayla')}
            </button>
          </div>
        )}
      </div>
      {log.length > 0 && (
        <ol className="tv-log" aria-label={t('Son hamleler')}>
          {log.map((turn, i) => (
            <li key={`${i}-${JSON.stringify(turn)}`}>
              <strong>{name(turn.seat)}</strong> {diceText(turn.dice)} ·{' '}
              {turn.passed
                ? t('Oynayacak hamle yok')
                : turn.moves.map((step) => stepText(step, turn.seat)).join(' ')}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
