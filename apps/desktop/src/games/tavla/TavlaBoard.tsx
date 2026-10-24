import { t } from '../../i18n';
import type { KeyboardEvent } from 'react';
import {
  bottomSeat,
  diceFaces,
  pointNumber,
  pointSlot,
  type TavlaFrom,
  type TavlaStep,
  type TavlaTableView,
  type TavlaTo,
} from './model';

// Board geometry (SVG user units). Two fields of six points with the bar between them and the
// borne-off tray on the right; the viewer's home board is bottom right.
const W = 1000,
  H = 720,
  EDGE = 24,
  COL = 70,
  BAR = 60,
  POINT_H = 270,
  R = 27,
  TRAY_X = 936,
  TRAY_W = 52;
const FIELD_RIGHT = EDGE + 6 * COL + BAR;
const MID = H / 2;
const BAR_X = EDGE + 6 * COL + BAR / 2;
/** Checkers drawn per point before the count badge takes over. */
const STACK = 5;

const colX = (col: number) =>
  (col < 6 ? EDGE + col * COL : FIELD_RIGHT + (col - 6) * COL) + COL / 2;
/** Centre of the k-th checker (0 = at the board edge) on a row. */
const stackY = (row: 'top' | 'bottom', k: number) =>
  row === 'top' ? EDGE + R + k * 2 * R : H - EDGE - R - k * 2 * R;

export interface BoardSelection {
  /** Sources the viewer may move from now (empty when it is not their move). */
  sources: TavlaFrom[];
  selected: TavlaFrom | null;
  targets: TavlaTo[];
}

function pointCenter(view: TavlaTableView, index: number, slotIndex?: number) {
  const { row, col } = pointSlot(index, view.you);
  const count = view.points[index]?.count ?? 0;
  const k = Math.min(slotIndex ?? Math.max(0, count - 1), STACK - 1);
  return { x: colX(col), y: stackY(row, k) };
}

function barCenter(seat: number, view: TavlaTableView, k = 0) {
  const down = seat === bottomSeat(view.you);
  return { x: BAR_X, y: MID + (down ? 1 : -1) * (R + 14 + Math.min(k, 3) * 2 * R) };
}

function trayCenter(seat: number, view: TavlaTableView) {
  const down = seat === bottomSeat(view.you);
  return { x: TRAY_X + TRAY_W / 2, y: down ? H - EDGE - 60 : EDGE + 60 };
}

function stepEnds(view: TavlaTableView, seat: number, step: TavlaStep) {
  const from =
    step.from === 'bar'
      ? barCenter(seat, view)
      : pointCenter(view, step.from, view.points[step.from]?.count ?? 0);
  const to = step.to === 'off' ? trayCenter(seat, view) : pointCenter(view, step.to);
  return { from, to };
}

export function seatColor(seat: number) {
  return seat === 0 ? 'light' : 'dark';
}

function Checker({
  x,
  y,
  seat,
  className = '',
}: {
  x: number;
  y: number;
  seat: number;
  className?: string;
}) {
  return (
    <g className={`tv-checker ${seatColor(seat)} ${className}`} transform={`translate(${x} ${y})`}>
      <g className="tv-checker-body">
        <circle r={R - 1} />
        <circle className="tv-checker-ring" r={R - 9} />
      </g>
    </g>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

export function Die({
  value,
  x,
  y,
  size,
  used = false,
  rolling = false,
}: {
  value: number;
  x: number;
  y: number;
  size: number;
  used?: boolean;
  rolling?: boolean;
}) {
  const step = size * 0.26;
  return (
    <g
      className={`tv-die${used ? ' used' : ''}${rolling ? ' rolling' : ''}`}
      transform={`translate(${x} ${y})`}
      aria-hidden="true"
    >
      <g className="tv-die-body">
        <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={size * 0.18} />
        {(PIPS[value] ?? []).map(([dx, dy], i) => (
          <circle key={i} cx={dx * step} cy={dy * step} r={size * 0.09} />
        ))}
      </g>
    </g>
  );
}

export function TavlaBoard({
  view,
  selection,
  trail,
  trailSeat: mover,
  rollKey,
  rolling,
  onPoint,
  onGrab,
  onBar,
  onOff,
  onDrop,
}: {
  view: TavlaTableView;
  selection: BoardSelection;
  /** The opponent's steps drawn as arrows with ghost checkers, and whose they are. */
  trail: TavlaStep[];
  trailSeat: number | null;
  /** Identifies the roll on show (dice remount per roll). */
  rollKey: string;
  /** True right after a new roll: the dice tumble once. */
  rolling: boolean;
  onPoint(index: number): void;
  /** Pointer pressed on a movable source (start of a drag). */
  onGrab(from: TavlaFrom): void;
  onBar(): void;
  onOff(): void;
  /** A checker dragged from the selected source and released on `to`. */
  onDrop(to: TavlaTo): void;
}) {
  const you = view.you,
    bottom = bottomSeat(you),
    top = 1 - bottom,
    seatName = (seat: number) => (seat === 0 ? t('açık') : t('koyu'));
  const isSource = (from: TavlaFrom) => selection.sources.includes(from),
    isTarget = (to: TavlaTo) => selection.targets.includes(to);
  const activate = (run: () => void) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    run();
  };
  const interactive = (on: boolean, run: () => void, drop?: () => void, grab?: () => void) =>
    on
      ? {
          role: 'button',
          tabIndex: 0,
          onClick: run,
          onKeyDown: activate(run),
          onPointerUp: drop,
          onPointerDown: grab,
        }
      : { role: 'img' };
  const faces = diceFaces(view);
  const doubles = faces.length === 4;
  // Dice sit in the right field's gap on the bottom player's roll, the left one on the top player's.
  const shownDice =
    faces.length > 0
      ? faces
      : view.phase === 'roll' && view.lastTurn?.passed
        ? view.lastTurn.dice.map((value) => ({ value, used: true }))
        : [];
  const diceSeat = faces.length > 0 ? view.turn : (view.lastTurn?.seat ?? null);
  const diceX =
    (diceSeat === top ? EDGE + 3 * COL : FIELD_RIGHT + 3 * COL) - ((shownDice.length - 1) * 64) / 2;

  return (
    <svg
      className="tv-board"
      viewBox={`0 0 ${W} ${H}`}
      role="group"
      aria-label={t('Tavla tahtası')}
    >
      <defs>
        <marker
          id="tv-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="tv-arrow-head" />
        </marker>
      </defs>
      <rect className="tv-frame" x={0} y={0} width={W} height={H} rx={18} />
      <rect className="tv-field" x={EDGE} y={EDGE} width={6 * COL} height={H - 2 * EDGE} rx={4} />
      <rect
        className="tv-field"
        x={FIELD_RIGHT}
        y={EDGE}
        width={6 * COL}
        height={H - 2 * EDGE}
        rx={4}
      />
      <rect className="tv-bar" x={EDGE + 6 * COL} y={EDGE} width={BAR} height={H - 2 * EDGE} />

      {view.points.map((point, index) => {
        const { row, col } = pointSlot(index, you),
          x = colX(col),
          base = row === 'top' ? EDGE : H - EDGE,
          apex = row === 'top' ? EDGE + POINT_H : H - EDGE - POINT_H,
          source = isSource(index),
          target = isTarget(index),
          selected = selection.selected === index;
        const label = [
          t('{number}. hane', { number: pointNumber(index, bottom) }),
          point.count
            ? t('{count} {color} pul', {
                count: point.count,
                color: seatName(point.seat ?? 0),
              })
            : t('boş'),
          target ? t('buraya oynanabilir') : source ? t('oynanabilir pul') : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <g
            key={index}
            className={`tv-point${source ? ' source' : ''}${target ? ' target' : ''}${selected ? ' selected' : ''}`}
            data-point={index}
            aria-label={label}
            aria-pressed={source ? selected : undefined}
            {...interactive(
              source || target,
              () => onPoint(index),
              target ? () => onDrop(index) : undefined,
              source ? () => onGrab(index) : undefined,
            )}
          >
            <rect
              className="tv-hit"
              x={x - COL / 2}
              y={row === 'top' ? EDGE : H - EDGE - POINT_H - 40}
              width={COL}
              height={POINT_H + 40}
            />
            <polygon
              className={`tv-tri ${(col + (row === 'top' ? 0 : 1)) % 2 ? 'a' : 'b'}`}
              points={`${x - COL / 2 + 3},${base} ${x + COL / 2 - 3},${base} ${x},${apex}`}
            />
            {Array.from({ length: Math.min(point.count, STACK) }, (_, k) => (
              <Checker
                key={`${k}-${point.count}`}
                x={x}
                y={stackY(row, k)}
                seat={point.seat ?? 0}
                className={k === Math.min(point.count, STACK) - 1 ? 'top' : ''}
              />
            ))}
            {point.count > STACK && (
              <g
                className="tv-count"
                transform={`translate(${x} ${stackY(row, STACK - 1)})`}
                aria-hidden="true"
              >
                <circle r={19} />
                <text dy="0.35em">{point.count}</text>
              </g>
            )}
          </g>
        );
      })}

      {[bottom, top].map((seat) => {
        const count = view.bar[seat],
          own = seat === bottom,
          source = own && isSource('bar');
        return (
          <g
            key={`bar-${seat}`}
            className={`tv-bar-stack${source ? ' source' : ''}${source && selection.selected === 'bar' ? ' selected' : ''}`}
            aria-label={t('Bar · {count} {color} pul', { count, color: seatName(seat) })}
            {...interactive(source, onBar, undefined, () => onGrab('bar'))}
          >
            {Array.from({ length: Math.min(count, 4) }, (_, k) => {
              const at = barCenter(seat, view, k);
              return <Checker key={k} x={at.x} y={at.y} seat={seat} />;
            })}
            {count > 4 && (
              <g
                className="tv-count"
                transform={`translate(${BAR_X} ${barCenter(seat, view, 3).y})`}
                aria-hidden="true"
              >
                <circle r={19} />
                <text dy="0.35em">{count}</text>
              </g>
            )}
          </g>
        );
      })}

      {[bottom, top].map((seat) => {
        const down = seat === bottom,
          target = down && isTarget('off');
        return (
          <g
            key={`off-${seat}`}
            className={`tv-tray${target ? ' target' : ''}`}
            data-tray={down ? 'own' : 'other'}
            aria-label={
              target
                ? t('Toplama kutusu · {count} pul toplandı · buraya topla', {
                    count: view.off[seat],
                  })
                : t('Toplama kutusu · {count} pul toplandı', { count: view.off[seat] })
            }
            {...interactive(target, onOff, target ? () => onDrop('off') : undefined)}
          >
            <rect
              className="tv-tray-box"
              x={TRAY_X}
              y={down ? MID + 12 : EDGE}
              width={TRAY_W}
              height={MID - EDGE - 12}
              rx={6}
            />
            {Array.from({ length: view.off[seat] }, (_, k) => (
              <rect
                key={k}
                className={`tv-slab ${seatColor(seat)}`}
                x={TRAY_X + 5}
                y={down ? H - EDGE - 6 - (k + 1) * 15 : EDGE + 6 + k * 15}
                width={TRAY_W - 10}
                height={12}
                rx={3}
              />
            ))}
          </g>
        );
      })}

      {trail.length > 0 && mover !== null && (
        <g className="tv-trail" aria-hidden="true">
          {trail.map((step, i) => {
            const { from, to } = stepEnds(view, mover, step);
            const bend = (from.y < MID ? 1 : -1) * 40;
            return (
              <g key={i}>
                <Checker x={from.x} y={from.y} seat={mover} className="ghost" />
                <path
                  d={`M${from.x} ${from.y} Q${(from.x + to.x) / 2} ${(from.y + to.y) / 2 + bend} ${to.x} ${to.y}`}
                  markerEnd="url(#tv-arrow)"
                />
              </g>
            );
          })}
        </g>
      )}

      {view.phase === 'opening'
        ? [bottom, top].map((seat) => {
            const value = view.opening[seat];
            return value === null ? null : (
              <Die
                key={`${rollKey}-${seat}`}
                value={value}
                x={seat === bottom ? FIELD_RIGHT + 3 * COL : EDGE + 3 * COL}
                y={MID}
                size={52}
                rolling={rolling}
              />
            );
          })
        : shownDice.map((face, i) => (
            <Die
              key={`${rollKey}-${i}`}
              value={face.value}
              x={diceX + i * 64}
              y={MID}
              size={doubles ? 46 : 52}
              used={face.used}
              rolling={rolling}
            />
          ))}
    </svg>
  );
}
