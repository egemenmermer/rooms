import type {
  ClassicTile,
  OkeyClassicLastAction,
  OkeyClassicView,
} from '../../../../../packages/games/src/okey-classic';
import { t } from '../../i18n';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Avatar } from '@rooms/design';
import type { TableUI } from '../shared/table-ui';
import { SeatAvatar } from '../shared/SeatAvatar';
import { TableDock } from '../shared/TableDock';
import { useGameSounds } from '../shared/sounds';
import { arrangePairs, arrangeRuns, canFinishWith, finishingTile } from './auto-arrange';
import { ClassicTileView, TileBack, tileLabel } from './ClassicTile';
import { OkeyRoundSummary } from './OkeyRoundSummary';
import {
  loadLayout,
  moveTile,
  RACK_CELLS,
  reconcileLayout,
  saveLayout,
  type RackLayout,
} from '../shared/rack-layout';

export type OkeyTableView = Partial<OkeyClassicView> & {
  statistics?: Record<string, { hands: number; wins: number; score: number }>;
};

/** Seat positions around the felt, counted from the viewer: the next player sits on the right. */
const PLACES = ['bottom', 'right', 'top', 'left'] as const;
/** Each discard pile lies in the corner between its owner and the next player. */
const CORNERS = ['bottom-right', 'top-right', 'top-left', 'bottom-left'] as const;

export function describeAction(
  action: OkeyClassicLastAction,
  name: string,
  okey: { color: string; value: number },
) {
  switch (action.type) {
    case 'draw':
      return action.from === 'stock'
        ? t('{name} ortadan çekti', { name })
        : t('{name} {tile} aldı', { name, tile: tileLabel(action.tile, okey) });
    case 'discard':
      return t('{name} {tile} attı', { name, tile: tileLabel(action.tile, okey) });
    case 'show-indicator':
      return t('{name} göstergeyi gösterdi', { name });
    case 'finish':
      return t('{name} {tile} atıp bitirdi', { name, tile: tileLabel(action.tile, okey) });
  }
}

export function OkeyClassicTable({ game, userId, can, action, timer }: TableUI) {
  const view = game.view as OkeyTableView;
  const order = useMemo(() => [...game.seats].sort((a, b) => a.seat - b.seat), [game.seats]);
  const nameOf = (seat: number) => order[seat]?.name ?? t('Koltuk {number}', { number: seat + 1 });
  useGameSounds(game, { move: 'tile' });
  const okey = view.okey ?? { color: 'red', value: 1 },
    me = typeof view.viewerSeat === 'number' ? view.viewerSeat : null,
    base = me ?? 0,
    seats = view.seats ?? [],
    hand = useMemo(() => view.hand ?? [], [view.hand]),
    stage = view.stage,
    turn = game.status === 'playing' ? (view.turn ?? null) : null,
    ended = stage === 'ended' || game.status === 'finished',
    myTurn = me !== null && turn === me;
  const left = (base + 3) % 4,
    leftTop = seats[left]?.discards.at(-1);

  // Own rack: a local, per-round arrangement.
  const storageKey = `rooms-okey-rack:${game.ownerId}:${game.history.length}:${userId ?? ''}`;
  const handIds = useMemo(() => hand.map((tile) => tile.id), [hand]);
  const [stored, setStored] = useState<{ key: string; layout: RackLayout } | null>(null);
  const layout = useMemo(
    () =>
      reconcileLayout(stored?.key === storageKey ? stored.layout : loadLayout(storageKey), handIds),
    [stored, storageKey, handIds],
  );
  const updateLayout = (next: RackLayout) => {
    setStored({ key: storageKey, layout: next });
    saveLayout(storageKey, next);
  };
  const byId = useMemo(() => new Map(hand.map((tile) => [tile.id, tile])), [hand]);
  const [selected, setSelected] = useState<string | null>(null),
    [dragId, setDragId] = useState<string | null>(null),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (selected && !byId.has(selected)) setSelected(null);
  }, [byId, selected]);
  useEffect(() => setNotice(''), [stage, turn]);

  // Tiles that just arrived (deal, draw) get a short drop-in.
  const previousIds = useRef<string[] | null>(null);
  const fresh = useMemo(() => {
    const before = previousIds.current;
    return new Set(before ? handIds.filter((id) => !before.includes(id)) : []);
  }, [handIds]);
  useEffect(() => {
    previousIds.current = handIds;
  }, [handIds]);

  // The latest move, shown on the felt; it belongs to the round it happened in.
  const [latest, setLatest] = useState<{ round: number; line: string } | null>(null);
  const lastKey = JSON.stringify(view.lastAction ?? null),
    seenKey = useRef('');
  useEffect(() => {
    const last = view.lastAction;
    if (!last || lastKey === seenKey.current) return;
    seenKey.current = lastKey;
    setLatest({ round: game.history.length, line: describeAction(last, nameOf(last.seat), okey) });
  }, [lastKey]);
  const latestLine = latest?.round === game.history.length ? latest.line : null;

  const finisher = useMemo(
    () => (me !== null && stage === 'discard' && myTurn ? finishingTile(hand) : null),
    [hand, me, stage, myTurn],
  );
  const finishId = selected && canFinishWith(hand, selected) ? selected : (finisher?.id ?? null);
  const draw = (from: 'stock' | 'discard') => void action('draw', { payload: { from } });
  const discard = (tileId: string) =>
    void action('discard', { payload: { tileId } }).then((ok) => ok && setSelected(null));
  const finish = (tileId: string) =>
    void action('finish', { payload: { tileId } }).then((ok) => ok && setSelected(null));
  const tryFinish = (tileId: string) => {
    if (canFinishWith(hand, tileId)) finish(tileId);
    else setNotice(t('Bu taşı atınca el bitmiyor.'));
  };

  const dragProps = (zone: 'discard' | 'finish') => {
    const legal = zone === 'discard' ? can('discard') : can('finish');
    return {
      'data-drop': zone,
      onDragOver: (event: DragEvent) => {
        if (dragId && legal) event.preventDefault();
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const id = dragId;
        setDragId(null);
        if (!id || !legal) return;
        if (zone === 'discard') discard(id);
        else tryFinish(id);
      },
    };
  };
  const dropClass = (zone: 'discard' | 'finish') =>
    dragId && (zone === 'discard' ? can('discard') : can('finish')) ? 'ok-drop-target' : '';
  const lastDiscard =
    view.lastAction?.type === 'discard' || view.lastAction?.type === 'finish'
      ? view.lastAction.tile.id
      : null;

  const handNumber = Math.max(1, game.history.length + (ended ? 0 : 1));
  const statusTitle = myTurn
    ? stage === 'draw'
      ? t('Taş çek')
      : t('Taş at')
    : t('{name} oynuyor', { name: turn === null ? '—' : nameOf(turn) });
  const statusText =
    notice ||
    (myTurn
      ? stage === 'draw'
        ? t('Ortadan çek ya da soldakinin attığını al.')
        : finisher
          ? t('Bitirebilirsin: {tile}', { tile: tileLabel(finisher, okey) })
          : t('Bir taş seç ve at. Taşı sürükleyip köşene de bırakabilirsin.')
      : t('Istakanı dizebilirsin.'));

  return (
    <div className="ok-table">
      <section className={`ok-felt ${ended ? 'ended' : ''}`} aria-label={t('Okey masası')}>
        {[0, 1, 2, 3].map((offset) => {
          const seat = (base + offset) % 4,
            info = seats[seat],
            place = PLACES[offset],
            playing = turn === seat,
            own = me !== null && seat === me;
          return (
            <article
              key={`seat-${seat}`}
              className={`ok-seat ${place} ${playing ? 'turn' : ''} ${own ? 'own' : ''}`}
              aria-label={playing ? t('{name} · Sırada', { name: nameOf(seat) }) : nameOf(seat)}
            >
              {order[seat] ? (
                <SeatAvatar seat={order[seat]} game={game} timer={timer} />
              ) : (
                <Avatar name={nameOf(seat)} />
              )}
              <div>
                <strong title={nameOf(seat)}>
                  <span>{nameOf(seat)}</span>
                  {own && <span className="ok-you">{t(' · sen')}</span>}
                </strong>
                <small>
                  {order[seat]?.bot && <b className="ok-bot">{'BOT'}</b>}
                  {t('{count} taş', { count: info?.tileCount ?? 0 })}
                  {info?.showedIndicator ? ` · ${t('Gösterge gösterdi')}` : ''}
                </small>
              </div>
              {offset !== 0 && (
                <span className="ok-mini-rack" aria-hidden="true">
                  {Array.from({ length: Math.min(info?.tileCount ?? 0, 15) }, (_, index) => (
                    <TileBack small key={index} />
                  ))}
                </span>
              )}
            </article>
          );
        })}
        {[0, 1, 2, 3].map((offset) => {
          const seat = (base + offset) % 4,
            pile = seats[seat]?.discards ?? [],
            top = pile.at(-1),
            takeable = seat === left && can('draw') && !!top,
            own = me !== null && seat === me,
            label = own ? t('Attığın taşlar') : t('{name} attı', { name: nameOf(seat) });
          return (
            <div
              key={`pile-${seat}`}
              className={`ok-pile ${CORNERS[offset]} ${own ? `own ${dropClass('discard')}` : ''}`}
              {...(own ? dragProps('discard') : {})}
            >
              <small title={label}>{label}</small>
              {top ? (
                <span className={`ok-pile-top ${top.id === lastDiscard ? 'last' : ''}`}>
                  {pile.length > 1 && <TileBack />}
                  <ClassicTileView
                    tile={top}
                    okey={okey}
                    onClick={takeable ? () => draw('discard') : undefined}
                    selected={takeable}
                  />
                </span>
              ) : (
                <span className="ok-pile-empty">{own && dragId ? t('Buraya at') : '—'}</span>
              )}
              {takeable && <em>{t('Önceki taşı al')}</em>}
            </div>
          );
        })}
        <div className={`ok-middle ${dropClass('finish')}`} {...dragProps('finish')}>
          <span className="ok-hand-no">{t('El {hand}', { hand: handNumber })}</span>
          <div className="ok-middle-row">
            <button
              type="button"
              className="ok-stock"
              disabled={!can('draw')}
              onClick={() => draw('stock')}
              aria-label={t('Kapalı taş çek · {count} taş', { count: view.stockCount ?? 0 })}
            >
              <span className="ok-stack">
                <TileBack />
                <TileBack />
                <TileBack />
              </span>
              <b>{view.stockCount ?? '—'}</b>
            </button>
            {view.indicator && (
              <div className="ok-indicator">
                <ClassicTileView tile={view.indicator} okey={okey} />
                <small>{t('Gösterge')}</small>
              </div>
            )}
          </div>
          {latestLine && (
            <p className="ok-last" aria-live="polite" title={latestLine}>
              {latestLine}
            </p>
          )}
          {dragId && can('finish') && (
            <em className="ok-middle-hint">{t('Bitirmek için bırak')}</em>
          )}
        </div>
        {ended && <OkeyRoundSummary game={game} view={view} nameOf={nameOf} />}
      </section>

      {me !== null && !ended && (
        <TableDock label={t('Elin')} className="ok-dock">
          <div className="ok-dock-bar">
            <div className="ok-dock-status">
              <strong>{statusTitle}</strong>
              <span role="status" title={statusText}>
                {statusText}
              </span>
            </div>
            <div className="ok-dock-actions">
              <button
                type="button"
                className="button secondary small"
                onClick={() => updateLayout(arrangeRuns(hand, okey))}
              >
                {t('Seri diz')}
              </button>
              <button
                type="button"
                className="button secondary small"
                onClick={() => updateLayout(arrangePairs(hand, okey))}
              >
                {t('Çift diz')}
              </button>
              <span className="ok-dock-sep" aria-hidden="true" />
              {can('show-indicator') && (
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => void action('show-indicator')}
                >
                  {t('Göstergeyi göster')}
                </button>
              )}
              {stage === 'draw' ? (
                <>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={!can('draw') || !leftTop}
                    onClick={() => draw('discard')}
                  >
                    {t('Önceki taşı al')}
                  </button>
                  <button
                    type="button"
                    className="button primary small"
                    disabled={!can('draw')}
                    onClick={() => draw('stock')}
                  >
                    {t('Kapalı taş çek')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={!can('finish') || !finishId}
                    onClick={() => finishId && finish(finishId)}
                  >
                    {t('Bitir')}
                  </button>
                  <button
                    type="button"
                    className="button primary small"
                    disabled={!can('discard') || !selected}
                    onClick={() => selected && discard(selected)}
                  >
                    {t('Seçili taşı at')}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="ok-rack" role="group" aria-label={t('Istaka')}>
            {layout.slice(0, RACK_CELLS).map((id, cell) => {
              const tile = id ? byId.get(id) : undefined;
              const dropProps = {
                onDragOver: (event: DragEvent) => {
                  if (dragId) event.preventDefault();
                },
                onDrop: (event: DragEvent) => {
                  event.preventDefault();
                  if (dragId) updateLayout(moveTile(layout, dragId, cell));
                  setDragId(null);
                },
              };
              if (!tile)
                return selected ? (
                  <button
                    type="button"
                    key={cell}
                    className="ok-cell empty"
                    data-cell={cell}
                    aria-label={t('Seçili taşı buraya taşı')}
                    onClick={() => updateLayout(moveTile(layout, selected, cell))}
                    {...dropProps}
                  />
                ) : (
                  <div key={cell} className="ok-cell empty" data-cell={cell} {...dropProps} />
                );
              return (
                <div
                  key={cell}
                  className={`ok-cell ${fresh.has(tile.id) ? 'fresh' : ''} ${dragId === tile.id ? 'dragging' : ''}`}
                  data-cell={cell}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer?.setData('text/plain', tile.id);
                    setDragId(tile.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  {...dropProps}
                >
                  <ClassicTileView
                    tile={tile as ClassicTile}
                    okey={okey}
                    selected={selected === tile.id}
                    onClick={() => setSelected((value) => (value === tile.id ? null : tile.id))}
                    onDoubleClick={can('discard') ? () => discard(tile.id) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </TableDock>
      )}
    </div>
  );
}
