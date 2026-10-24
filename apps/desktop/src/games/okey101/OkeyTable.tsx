import {
  validate101Opening,
  validate101Pairs,
  type OkeyRuleProfile,
  type OkeyTile,
} from '../../../../../packages/games/src/okey101';
import { t } from '../../i18n';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { X } from 'lucide-react';
import { Avatar } from '@rooms/design';
import { useGameFixtureMetadata } from '../shared/fixture';
import { array, object, type Tile } from '../shared/model';
import type { TableUI } from '../shared/table-ui';
import { TurnClock } from '../shared/TurnClock';
import { arrangePairs, arrangeRuns, rackBlocks } from './arrange';
import { describeMoves } from './moves';
import { OkeyRoundSummary } from './OkeyRoundSummary';
import { faceName, isFakeOkey, okeyFace, OkeyTileView, TileBack, tileLabel } from './OkeyTile';
import { isAmbiguousMeld, meldPoints, previewOkeyGroup, type MeldKind } from './preview';
import {
  loadLayout,
  moveTile,
  RACK_CELLS,
  RACK_COLUMNS,
  reconcileLayout,
  saveLayout,
  type RackLayout,
} from './rack-layout';

/** Seat places around the felt, counted from the viewer: the next player sits on the right. */
const PLACES = ['bottom', 'right', 'top', 'left'] as const;
/** Each discard pile lies in the corner between its owner and the next player. */
const CORNERS = ['bottom-right', 'top-right', 'top-left', 'bottom-left'] as const;

type Meld = { owner: number; tiles: Tile[]; pairs: boolean };
type Draft = { ids: string[]; kind: MeldKind | null };

export function ReferenceOkey({ game, userId, can, action, timer }: TableUI) {
  const fixtureMetadata = useGameFixtureMetadata();
  const view = game.view;
  const order = useMemo(() => [...game.seats].sort((a, b) => a.seat - b.seat), [game.seats]);
  const nameOf = (seat: number) =>
    order.find((item) => item.seat === seat)?.name ?? t('Koltuk {number}', { number: seat + 1 });
  const own = game.seats.find((seat) => seat.userId === userId),
    me = own ? own.seat : null,
    base = me ?? 0,
    hands = array<{ seat: number; tiles?: Tile[]; count?: number }>(view.hands),
    tiles = useMemo(
      () => (me !== null ? array<Tile>(hands.find((hand) => hand.seat === me)?.tiles) : []),
      [hands, me],
    ),
    melds = array<Meld>(view.melds),
    rules = object(view.rules),
    // The table's own profile (v2 options such as 12-13-1 and folding pairs), as the server checks it.
    profile: OkeyRuleProfile = {
      id: rules.id === 'rooms-101-v1' ? 'rooms-101-v1' : 'rooms-101-v2',
      folding: !!rules.folding,
      teams: !!rules.teams,
      openingMinimum: 101,
      pairsMinimum: 5,
      ...(rules.options ? { options: rules.options as OkeyRuleProfile['options'] } : {}),
    },
    wrapAround = !!object(rules.options).wrapAround,
    openedList = array<string | null>(view.opened),
    opened = me !== null ? (openedList[me] ?? null) : null,
    stage = String(view.stage),
    ended = stage === 'ended' || game.status === 'finished',
    turn = game.status === 'playing' && typeof view.turn === 'number' ? view.turn : null,
    myTurn = me !== null && turn === me,
    indicator = (view.indicator as Tile | undefined) ?? null,
    okey = indicator ? okeyFace(indicator) : null,
    discards = array<Tile[]>(view.discards),
    left = (base + 3) % 4,
    leftTop = discards[left]?.at(-1),
    highestOpening = Number(view.highestOpening ?? 100),
    requiredPairs = Number(view.requiredPairs ?? 5),
    threshold = rules.folding ? Math.max(101, highestOpening + 1) : 101;

  // Own ıstaka: a local arrangement per table, round and viewer.
  const storageKey = `rooms-101-rack:${game.ownerId}:${game.history.length}:${userId ?? ''}`;
  const handIds = useMemo(() => tiles.map((tile) => tile.id), [tiles]);
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
  const byId = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);

  const [selected, setSelected] = useState<string[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [pairs, setPairs] = useState(false),
    [target, setTarget] = useState<number | null>(null),
    [joker, setJoker] = useState(''),
    [dragId, setDragId] = useState<string | null>(null),
    [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    setSelected([]);
    setDrafts([]);
    setPairs(opened === 'pairs');
    setTarget(null);
    setJoker('');
    setPicked(null);
  }, [game.history.length, game.status, me, userId]);
  useEffect(() => {
    setSelected((values) => values.filter((id) => byId.has(id)));
    setDrafts((values) => values.filter((draft) => draft.ids.every((id) => byId.has(id))));
  }, [byId]);
  useEffect(() => {
    if (stage === 'draw' || !myTurn) {
      setDrafts([]);
      setTarget(null);
      setJoker('');
      setPicked(null);
    }
  }, [stage, myTurn]);
  useEffect(() => {
    if (opened) setPairs(opened === 'pairs');
  }, [opened]);
  useEffect(() => {
    if (!fixtureMetadata || fixtureMetadata.id !== 'S50') return;
    const ui = fixtureMetadata.ui;
    setSelected(ui.selectedTileIds);
    setDrafts(ui.groups.map((ids) => ({ ids, kind: null })));
    setPairs(ui.pairs);
    setTarget(ui.targetMeld);
  }, [fixtureMetadata]);

  // Tiles that just arrived (deal, draw) drop in.
  const previousIds = useRef<string[] | null>(null);
  const fresh = useMemo(() => {
    const before = previousIds.current;
    return new Set(before ? handIds.filter((id) => !before.includes(id)) : []);
  }, [handIds]);
  useEffect(() => {
    previousIds.current = handIds;
  }, [handIds]);

  // A short log of the latest moves, derived from consecutive views.
  const previousView = useRef<Record<string, unknown> | null>(null),
    [log, setLog] = useState<{ round: number; lines: string[] }>({
      round: game.history.length,
      lines: [],
    });
  useEffect(() => {
    const before = previousView.current;
    previousView.current = view;
    if (!before || before === view) return;
    const lines = describeMoves(before, view, nameOf, okey);
    if (!lines.length) return;
    setLog((current) => ({
      round: game.history.length,
      lines: [...lines.reverse(), ...(current.round === game.history.length ? current.lines : [])]
        .slice(0, 5),
    }));
  }, [view]);

  const rackOrder = (ids: string[]) =>
    [...ids].sort((a, b) => layout.indexOf(a) - layout.indexOf(b));
  const toggle = (id: string) =>
    setSelected((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    );
  const used = drafts.flatMap((draft) => draft.ids);
  const draftTiles = drafts.map((draft) =>
    draft.ids.map((id) => byId.get(id)).filter((tile): tile is Tile => !!tile),
  );

  // Preview of the drafted opening, mirroring the server's readings.
  let total = 0,
    validation = '';
  try {
    const preview = draftTiles.map((group, index) =>
      previewOkeyGroup(group, pairs, { kind: drafts[index].kind, wrapAround }),
    );
    if (!drafts.length) validation = t('Açmak için seri veya çift hazırla');
    else if (used.length >= tiles.length) validation = t('Atmak için bir taş bırak');
    else if (!opened) {
      if (pairs)
        validate101Pairs(tiles as OkeyTile[], preview, profile, Number(view.highestPairs ?? 0));
      else total = validate101Opening(tiles as OkeyTile[], preview, profile, highestOpening);
    } else if (pairs) {
      if (
        preview.some(
          (group) =>
            group.length !== 2 ||
            group[0].color !== group[1].color ||
            group[0].value !== group[1].value,
        )
      )
        validation = t('Geçerli çift hazırla');
    } else total = preview.reduce((sum, meld) => sum + meldPoints(meld, wrapAround), 0);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    validation =
      code === 'OPENING_TOO_LOW'
        ? t('Açılış için en az {threshold} puan gerekir', { threshold })
        : code === 'INVALID_PAIRS_OPENING'
          ? t('En az {count} geçerli çift gerekir', { count: requiredPairs })
          : t('Hazır gruplardan biri geçersiz');
  }

  const openAction = pairs ? 'open-pairs' : 'open';
  const commit = () =>
    void action(openAction, {
      melds: drafts.map((draft) => draft.ids),
      ...(!pairs && drafts.some((draft) => draft.kind)
        ? { meldKinds: drafts.map((draft) => draft.kind) }
        : {}),
    }).then((ok) => {
      if (ok) {
        setDrafts([]);
        setSelected([]);
      }
    });
  const addDraft = (ids: string[]) => {
    const ordered = rackOrder(ids);
    const group = ordered.map((id) => byId.get(id)!).filter(Boolean);
    setDrafts((values) => [
      ...values,
      { ids: ordered, kind: !pairs && isAmbiguousMeld(group, wrapAround) ? 'run' : null },
    ]);
    setSelected([]);
  };
  const blocks = rackBlocks(layout, RACK_COLUMNS).filter(
    (block) =>
      !block.some((id) => used.includes(id)) && (pairs ? block.length === 2 : block.length >= 3),
  );
  const draw = (fromSide: boolean) => {
    const top = leftTop?.id ?? null;
    void action('draw', fromSide ? { cardId: 'discard' } : undefined).then((ok) => {
      if (ok && fromSide) setPicked(top);
    });
  };
  const discard = (id: string) =>
    void action('discard', { cardId: id }).then((ok) => {
      if (ok) setSelected([]);
    });
  const process = (meld: number, ids: string[], replace?: string) =>
    void action('process', { amount: meld, tileIds: ids, ...(replace ? { cardId: replace } : {}) }).then(
      (ok) => {
        if (ok) {
          setSelected([]);
          setJoker('');
        }
      },
    );
  const gostergeTile =
    indicator &&
    tiles.find(
      (tile) =>
        !tile.joker &&
        tile.id !== indicator.id &&
        tile.color === indicator.color &&
        tile.value === indicator.value,
    );
  const canDiscard = can('discard'),
    canProcess = can('process'),
    pickupPenalty = !!object(rules.options).pickupPenalty;
  const lastPile = stage === 'draw' && turn !== null ? (turn + 3) % 4 : null;

  const pileDrop = {
    onDragOver: (event: DragEvent) => {
      if (dragId && canDiscard && !used.includes(dragId)) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const id = dragId;
      setDragId(null);
      if (id && canDiscard && !used.includes(id)) discard(id);
    },
  };

  const meldZone = (owner: number) => {
    const list = melds.map((meld, index) => ({ meld, index })).filter((x) => x.meld.owner === owner);
    if (!list.length) return null;
    return (
      <div className="o1-meld-row" aria-label={t('{name} perleri', { name: nameOf(owner) })}>
        <small>
          {nameOf(owner)} · {list[0].meld.pairs ? t('Çift') : t('Seri')}
        </small>
        <div>
          {list.map(({ meld, index }) => {
            const takes = canProcess && !meld.pairs;
            return (
              <button
                type="button"
                key={index}
                className={`o1-meld ${target === index ? 'selected' : ''} ${dragId && takes ? 'o1-drop-target' : ''}`}
                disabled={!takes}
                aria-label={t('Per {number} · {tiles}', {
                  number: index + 1,
                  tiles: meld.tiles.map((tile) => tileLabel(tile, null, false)).join(', '),
                })}
                onClick={() => {
                  setTarget(index);
                  setJoker('');
                }}
                onDragOver={(event) => {
                  if (dragId && takes) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = dragId;
                  setDragId(null);
                  if (id && takes) process(index, [id]);
                }}
              >
                {meld.tiles.map((tile) => (
                  <span key={tile.id} className="o1-meld-tile">
                    <OkeyTileView
                      tile={tile}
                      small
                      fake={false}
                      label={
                        tile.joker
                          ? t('Okey · {face} yerine', { face: faceName(tile) })
                          : undefined
                      }
                    />
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="o1-table">
      <div className="rx-badges">
        <span>{rules.folding ? t('Katlamalı') : t('Katlamasız')}</span>
        <span>{rules.teams ? t('Eşli') : t('Tekli')}</span>
        <span>{t('Açılış {threshold}', { threshold })}</span>
        <span>{t('{count} çift', { count: requiredPairs })}</span>
        <span>{t('El {hand}', { hand: game.history.length + (ended ? 0 : 1) })}</span>
      </div>
      <section className="o1-felt" aria-label={t('101 masası')}>
        {[0, 1, 2, 3].map((offset) => {
          const seat = (base + offset) % 4,
            count = Number(hands.find((hand) => hand.seat === seat)?.count ?? 0),
            playing = turn === seat,
            state = openedList[seat];
          return (
            <article
              key={`seat-${seat}`}
              className={`o1-seat ${PLACES[offset]} ${playing ? 'turn' : ''}`}
              aria-label={playing ? t('{name} · Sırada', { name: nameOf(seat) }) : nameOf(seat)}
            >
              <Avatar name={nameOf(seat)} />
              <div>
                <strong title={nameOf(seat)}>{nameOf(seat)}</strong>
                <small>
                  {t('{count} taş · {state}', {
                    count,
                    state:
                      state === 'pairs' ? t('Çift açtı') : state ? t('Açtı') : t('Açmadı'),
                  })}
                </small>
              </div>
              {offset !== 0 && (
                <span className="o1-mini-rack" aria-hidden="true">
                  {Array.from({ length: Math.min(count, 22) }, (_, index) => (
                    <TileBack small key={index} />
                  ))}
                </span>
              )}
              {playing && <TurnClock timer={timer} />}
            </article>
          );
        })}
        {[0, 1, 2, 3].map((offset) => {
          const seat = (base + offset) % 4,
            top = discards[seat]?.at(-1),
            takeable = seat === left && myTurn && stage === 'draw' && can('draw') && !!top,
            mine = me !== null && seat === me;
          return (
            <div
              key={`pile-${seat}`}
              className={`o1-pile ${CORNERS[offset]} ${mine && dragId && canDiscard ? 'o1-drop-target' : ''}`}
              {...(mine ? pileDrop : {})}
            >
              <small>{mine ? t('Attığın taş') : t('{name} attı', { name: nameOf(seat) })}</small>
              {top ? (
                <span className={`o1-pile-top ${seat === lastPile ? 'last' : ''}`}>
                  <OkeyTileView
                    tile={top}
                    fake={isFakeOkey(top, okey)}
                    onClick={takeable ? () => draw(true) : undefined}
                    highlight={takeable}
                  />
                </span>
              ) : (
                <span className="o1-pile-empty">{mine && dragId ? t('Buraya at') : '—'}</span>
              )}
              {takeable && <em>{t('Önceki taşı al')}</em>}
            </div>
          );
        })}
        <div className="o1-middle">
          <div className="o1-center">
            <button
              type="button"
              className="o1-stock"
              disabled={!(myTurn && stage === 'draw' && can('draw'))}
              onClick={() => draw(false)}
              aria-label={t('Kapalı taş çek · {count} taş', {
                count: Number(view.remainingStock ?? 0),
              })}
            >
              <TileBack />
              <b>{String(view.remainingStock ?? '—')}</b>
            </button>
            {indicator && (
              <div className="o1-indicator">
                <OkeyTileView tile={indicator} fake={false} />
                <small>{t('Gösterge')}</small>
              </div>
            )}
          </div>
          <div className="o1-melds">
            {melds.length ? (
              [2, 3, 1, 0].map((offset) => (
                <div key={offset} className={`o1-meld-zone ${PLACES[offset]}`}>
                  {meldZone((base + offset) % 4)}
                </div>
              ))
            ) : (
              <p>{t('Henüz per açılmadı.')}</p>
            )}
          </div>
        </div>
      </section>

      {log.lines.length > 0 && (
        <ol className="o1-log" aria-label={t('Son hamleler')} aria-live="polite">
          {log.lines.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ol>
      )}

      {ended && <OkeyRoundSummary view={view} nameOf={nameOf} seats={order.map((s) => s.seat)} />}

      {me !== null && !ended && (
        <section className="o1-rack-section">
          <header>
            <strong>{t('Istakan · {count} taş', { count: tiles.length })}</strong>
            <div>
              <button
                type="button"
                className="button secondary small"
                onClick={() => updateLayout(arrangeRuns(tiles, wrapAround))}
              >
                {t('Seri diz')}
              </button>
              <button
                type="button"
                className="button secondary small"
                onClick={() => updateLayout(arrangePairs(tiles))}
              >
                {t('Çift diz')}
              </button>
              <TurnClock timer={myTurn ? timer : null} />
            </div>
          </header>
          <div className="o1-rack" role="group" aria-label={t('Istaka')}>
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
                return selected.length === 1 ? (
                  <button
                    type="button"
                    key={cell}
                    className="o1-cell empty"
                    data-cell={cell}
                    aria-label={t('Seçili taşı buraya taşı')}
                    onClick={() => {
                      updateLayout(moveTile(layout, selected[0], cell));
                      setSelected([]);
                    }}
                    {...dropProps}
                  />
                ) : (
                  <div key={cell} className="o1-cell empty" data-cell={cell} {...dropProps} />
                );
              const inDraft = used.includes(tile.id);
              return (
                <div
                  key={cell}
                  className={`o1-cell ${fresh.has(tile.id) ? 'fresh' : ''} ${dragId === tile.id ? 'dragging' : ''} ${tile.id === picked ? 'picked' : ''} ${inDraft ? 'drafted' : ''}`}
                  data-cell={cell}
                  data-tile={tile.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer?.setData('text/plain', tile.id);
                    setDragId(tile.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  {...dropProps}
                >
                  <OkeyTileView
                    tile={tile}
                    fake={isFakeOkey(tile, okey)}
                    selected={selected.includes(tile.id) || inDraft}
                    onClick={() => !inDraft && toggle(tile.id)}
                    onDoubleClick={canDiscard && !inDraft ? () => discard(tile.id) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {me !== null && !ended && myTurn && stage === 'discard' && (
        <section className="rx-meld-editor o1-editor">
          <header>
            <h3>{opened ? t('Taş işle veya yeni per aç') : t('Açılış hazırla')}</h3>
            <div>
              <button
                className={!pairs ? 'selected' : ''}
                disabled={!!opened && opened !== 'runs'}
                onClick={() => {
                  setPairs(false);
                  setDrafts([]);
                  setSelected([]);
                }}
              >
                {t('Seri')}
              </button>
              <button
                className={pairs ? 'selected' : ''}
                disabled={!!opened && opened !== 'pairs'}
                onClick={() => {
                  setPairs(true);
                  setDrafts([]);
                  setSelected([]);
                }}
              >
                {t('Çift')}
              </button>
            </div>
          </header>
          <div className="rx-draft-groups">
            {draftTiles.map((group, index) => {
              const draft = drafts[index],
                ambiguous = !pairs && isAmbiguousMeld(group, wrapAround);
              return (
                <article key={draft.ids.join('|')}>
                  {group.map((tile) => (
                    <OkeyTileView small key={tile.id} tile={tile} fake={isFakeOkey(tile, okey)} />
                  ))}
                  {ambiguous && (
                    <div
                      className="o1-kind"
                      role="group"
                      aria-label={t('Okey nasıl okunsun? · Per {number}', { number: index + 1 })}
                    >
                      {(['run', 'group'] as const).map((kind) => (
                        <button
                          type="button"
                          key={kind}
                          aria-pressed={draft.kind === kind}
                          className={draft.kind === kind ? 'selected' : ''}
                          onClick={() =>
                            setDrafts((values) =>
                              values.map((value, i) => (i === index ? { ...value, kind } : value)),
                            )
                          }
                        >
                          {kind === 'run' ? t('Sıralı') : t('Aynı sayı')}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={t('Grup {number} kaldır', { number: index + 1 })}
                    onClick={() => setDrafts((values) => values.filter((_, i) => i !== index))}
                  >
                    <X size={14} />
                  </button>
                </article>
              );
            })}
          </div>
          <footer>
            <button
              className="button secondary"
              disabled={
                !can(openAction) ||
                (pairs ? selected.length !== 2 : selected.length < 3) ||
                selected.some((id) => used.includes(id))
              }
              onClick={() => addDraft(selected)}
            >
              {pairs ? t('Seçimi çift yap') : t('Seçimi seri yap')}
            </button>
            <button
              className="button secondary"
              disabled={!can(openAction) || !blocks.length}
              onClick={() => {
                const next = blocks.map((ids) => {
                  const group = ids.map((id) => byId.get(id)!);
                  return {
                    ids,
                    kind: !pairs && isAmbiguousMeld(group, wrapAround) ? ('run' as const) : null,
                  };
                });
                setDrafts((values) => [...values, ...next]);
              }}
            >
              {t('Istakadaki dizileri al')}
            </button>
            <span role="status" className={validation && drafts.length ? 'invalid' : ''}>
              {validation ||
                (pairs
                  ? t('{count} çift', { count: drafts.length })
                  : t('{total} puan · Hazır', { total }))}
            </span>
            <button
              className="button primary"
              disabled={!can(openAction) || !!validation}
              onClick={commit}
            >
              {pairs ? t('Çift aç') : t('Seri aç')}
            </button>
          </footer>
          {target !== null && melds[target] && (
            <div className="rx-process">
              <label>
                {t('Per {number}', { number: target + 1 })}
                <select value={joker} onChange={(event) => setJoker(event.target.value)}>
                  <option value="">{t('Uçtan işle')}</option>
                  {melds[target].tiles
                    .filter((tile) => tile.joker)
                    .map((tile) => (
                      <option key={tile.id} value={tile.id}>
                        {t('Okeyi değiştir · {number}', { number: tile.value })}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="button secondary"
                disabled={
                  !canProcess ||
                  !selected.length ||
                  (selected.length >= tiles.length && !joker) ||
                  (!!joker && selected.length !== 1)
                }
                onClick={() => process(target, rackOrder(selected), joker || undefined)}
              >
                {t('Seçili taşları işle')}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setTarget(null);
                  setJoker('');
                }}
              >
                {t('Vazgeç')}
              </button>
            </div>
          )}
        </section>
      )}

      {me !== null && !ended && (
        <div className="rg-hand-strip o1-actions">
          <div>
            <h3>
              {myTurn
                ? stage === 'draw'
                  ? t('Taş çek')
                  : t('Taş at')
                : t('{name} oynuyor', { name: turn === null ? '—' : nameOf(turn) })}
            </h3>
            <p role="status">
              {myTurn && picked && byId.has(picked) && pickupPenalty
                ? t('Yandan aldığın taşı bu el kullan; kullanmazsan +101 yazılır.')
                : opened
                  ? opened === 'pairs'
                    ? t('Çift açtın')
                    : t('Seri açtın')
                  : myTurn && stage === 'draw'
                    ? t('Ortadan çek ya da soldakinin attığını al.')
                    : t('Henüz açmadın · Istakanı sürükleyerek dizebilirsin.')}
            </p>
          </div>
          <div className="rg-actions">
            {can('gosterge') && (
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  void action('gosterge', gostergeTile ? { cardId: gostergeTile.id } : undefined)
                }
              >
                {t('Göstergeyi göster')}
              </button>
            )}
            {stage === 'draw' ? (
              <>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!myTurn || !can('draw') || !leftTop}
                  onClick={() => draw(true)}
                >
                  {t('Önceki taşı al')}
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={!myTurn || !can('draw')}
                  onClick={() => draw(false)}
                >
                  {t('Kapalı taş çek')}
                </button>
              </>
            ) : (
              <>
                {myTurn && can('draw') && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void action('draw')}
                  >
                    {pickupPenalty
                      ? t('Aldığın taşı geri bırak ve kapalı çek (+101)')
                      : t('Aldığın taşı geri bırak ve kapalı çek')}
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={!canDiscard || selected.length !== 1 || used.includes(selected[0])}
                  onClick={() => discard(selected[0])}
                >
                  {tiles.length === 1 ? t('Bitir · Son taşı at') : t('Seçili taşı at')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
