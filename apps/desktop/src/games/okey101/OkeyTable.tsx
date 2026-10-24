import {
  validate101Meld,
  validate101Opening,
  validate101Pairs,
  type OkeyTile,
} from '../../../../../packages/games/src/okey101';
import { t } from '../../i18n';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Avatar } from '@rooms/design';
import { OkeyTileView } from './OkeyTile';
import { previewOkeyGroup } from './preview';
import { useGameFixtureMetadata } from '../shared/fixture';
import { GameResults } from '../shared/GameResults';
import { array, object, type Tile } from '../shared/model';
import type { TableUI } from '../shared/table-ui';
import { TurnClock } from '../shared/TurnClock';

export function ReferenceOkey({ game, userId, can, action, timer }: TableUI) {
  const fixtureMetadata = useGameFixtureMetadata();
  const view = game.view,
    own = game.seats.find((seat) => seat.userId === userId),
    hands = array<Record<string, unknown>>(view.hands),
    tiles = own ? array<Tile>(hands.find((hand) => hand.seat === own.seat)?.tiles) : [],
    melds = array<{ owner: number; tiles: Tile[]; pairs: boolean }>(view.melds),
    rules = object(view.rules),
    opened = array<string | null>(view.opened)[own?.seat ?? -1],
    stage = String(view.stage);
  const [selected, setSelected] = useState<string[]>([]),
    [groups, setGroups] = useState<string[][]>([]),
    [pairs, setPairs] = useState(false),
    [target, setTarget] = useState<number | null>(null),
    [joker, setJoker] = useState(''),
    [sorted, setSorted] = useState(false);
  const ids = tiles.map((tile) => tile.id).join('|');
  useEffect(() => {
    setSelected([]);
    setGroups([]);
    setPairs(opened === 'pairs');
    setTarget(null);
    setJoker('');
  }, [game.history.length, game.status, own?.seat, userId]);
  useEffect(() => {
    const available = new Set(tiles.map((tile) => tile.id));
    setSelected((values) => values.filter((id) => available.has(id)));
    setGroups((values) => values.filter((group) => group.every((id) => available.has(id))));
  }, [ids]);
  useEffect(() => {
    if (stage === 'draw') {
      setSelected([]);
      setGroups([]);
      setTarget(null);
      setJoker('');
    }
  }, [stage]);
  useEffect(() => {
    if (opened) setPairs(opened === 'pairs');
  }, [opened]);
  useEffect(() => {
    if (!fixtureMetadata || fixtureMetadata.id !== 'S50') return;
    const ui = fixtureMetadata.ui;
    setSelected(ui.selectedTileIds);
    setGroups(ui.groups);
    setPairs(ui.pairs);
    setTarget(ui.targetMeld);
  }, [fixtureMetadata]);
  const toggle = (id: string) =>
    setSelected((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    );
  const used = groups.flat(),
    display = sorted
      ? [...tiles].sort((a, b) => a.color.localeCompare(b.color) || a.value - b.value)
      : tiles;
  const grouped = groups.map((group) =>
    group.map((id) => tiles.find((tile) => tile.id === id)).filter((tile): tile is Tile => !!tile),
  );
  const threshold = rules.folding ? Math.max(101, Number(view.highestOpening ?? 100) + 1) : 101;
  let total = 0,
    validation = '';
  try {
    const preview = grouped.map((group) => previewOkeyGroup(group, pairs));
    total = preview.flat().reduce((sum, tile) => sum + tile.value, 0);
    if (!groups.length) validation = t('Açmak için seri veya çift hazırla');
    else if (used.length >= tiles.length) validation = t('Atmak için bir taş bırak');
    else if (!opened) {
      const profile = {
        id: 'rooms-101-v1' as const,
        folding: !!rules.folding,
        teams: !!rules.teams,
        openingMinimum: 101 as const,
        pairsMinimum: 5 as const,
      };
      if (pairs) validate101Pairs(tiles as OkeyTile[], preview, profile);
      else
        validate101Opening(
          tiles as OkeyTile[],
          preview,
          profile,
          Number(view.highestOpening ?? 100),
        );
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
    } else preview.forEach(validate101Meld);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    validation =
      code === 'OPENING_TOO_LOW'
        ? t('Açılış için en az {threshold} puan gerekir', { threshold })
        : code === 'INVALID_PAIRS_OPENING'
          ? t('En az 5 geçerli çift gerekir')
          : t('Hazır gruplardan biri geçersiz');
  }
  const discards = array<Tile[]>(view.discards),
    previous = own ? discards[(own.seat + 3) % 4]?.[0] : undefined;
  const commit = () =>
    void action(pairs ? 'open-pairs' : 'open', { melds: groups }).then((ok) => {
      if (ok) {
        setGroups([]);
        setSelected([]);
      }
    });
  return (
    <>
      <div className="rx-badges">
        <span>{rules.folding ? t('Katlamalı') : t('Katlamasız')}</span>
        <span>{rules.teams ? t('Eşli') : t('Tekli')}</span>
        <span>{t('Açılış {threshold}', { threshold })}</span>
        <span>{t('5 çift')}</span>
        <span>{t('El {hand}', { hand: game.history.length + 1 })}</span>
      </div>
      <section className="rx-okey-felt">
        <div className="rx-okey-players">
          {game.seats
            .filter((seat) => seat.userId !== userId)
            .map((seat) => (
              <article className={seat.seat === game.turn ? 'turn' : ''} key={seat.userId}>
                <Avatar name={seat.name} />
                <strong>{seat.name}</strong>
                <small>
                  {t('{count} taş · {state}', {
                    count: Number(hands.find((hand) => hand.seat === seat.seat)?.count ?? 0),
                    state: array<string | null>(view.opened)[seat.seat] ? t('Açtı') : t('Açmadı'),
                  })}
                </small>
              </article>
            ))}
        </div>
        <div className="rx-okey-middle">
          <div className="rx-public-melds">
            {melds.length ? (
              melds.map((meld, index) => (
                <button
                  className={target === index ? 'selected' : ''}
                  key={index}
                  disabled={!can('process') || meld.pairs}
                  onClick={() => {
                    setTarget(index);
                    setJoker('');
                  }}
                >
                  <small>
                    {game.seats.find((seat) => seat.seat === meld.owner)?.name ?? t('Oyuncu')} ·{' '}
                    {meld.pairs ? t('Çift') : t('Seri')}
                  </small>
                  <span>
                    {meld.tiles.map((tile) => (
                      <span className={`rx-tile small ${tile.color}`} key={tile.id}>
                        {tile.joker ? '★' : tile.value}
                      </span>
                    ))}
                  </span>
                </button>
              ))
            ) : (
              <p>{t('Henüz seri açılmadı.')}</p>
            )}
          </div>
          <aside>
            <span>{t('Kapalı taşlar')}</span>
            <strong>{String(view.remainingStock ?? '—')}</strong>
            {!!view.indicator && (
              <>
                <small>{t('Gösterge')}</small>
                <OkeyTileView tile={view.indicator as Tile} />
              </>
            )}
          </aside>
        </div>
        <div className="rx-discards">
          {discards.map((stack, index) => (
            <div key={index}>
              <small>
                {t('{name} · Son atılan', {
                  name:
                    game.seats.find((seat) => seat.seat === index)?.name ??
                    t('Koltuk {number}', { number: index + 1 }),
                })}
              </small>
              {stack[0] ? <OkeyTileView tile={stack[0]} /> : <span>—</span>}
            </div>
          ))}
        </div>
      </section>
      {game.status === 'finished' && <GameResults game={game} result={view} />}{' '}
      {own && game.status === 'playing' && (
        <>
          <section className="rx-rack">
            <header>
              <strong>{t('ELİN · {count} taş', { count: tiles.length })}</strong>
              <div>
                <button className="text-button" onClick={() => setSorted((value) => !value)}>
                  {sorted ? t('Diz · Renk') : t('Diz · Dağıtım')}
                </button>
                <TurnClock timer={timer} />
              </div>
            </header>
            <div className="rx-wood-rack">
              {display.map((tile) => (
                <OkeyTileView
                  key={tile.id}
                  tile={tile}
                  selected={selected.includes(tile.id) || used.includes(tile.id)}
                  disabled={stage !== 'discard' || used.includes(tile.id) || !can('discard')}
                  onClick={() => toggle(tile.id)}
                />
              ))}
            </div>
          </section>
          {stage === 'discard' && (
            <section className="rx-meld-editor">
              <header>
                <h3>{opened ? t('Taş işle veya yeni grup aç') : t('Açılış hazırla')}</h3>
                <div>
                  <button
                    className={!pairs ? 'selected' : ''}
                    disabled={!!opened && opened !== 'runs'}
                    onClick={() => {
                      setPairs(false);
                      setGroups([]);
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
                      setGroups([]);
                      setSelected([]);
                    }}
                  >
                    {t('Çift')}
                  </button>
                </div>
              </header>
              <div className="rx-draft-groups">
                {grouped.map((group, index) => (
                  <article key={index}>
                    {group.map((tile) => (
                      <OkeyTileView small key={tile.id} tile={tile} />
                    ))}
                    <button
                      aria-label={t('Grup {number} kaldır', { number: index + 1 })}
                      onClick={() => setGroups((values) => values.filter((_, i) => i !== index))}
                    >
                      <X size={14} />
                    </button>
                  </article>
                ))}
              </div>
              <footer>
                <button
                  className="button secondary"
                  disabled={
                    !can(pairs ? 'open-pairs' : 'open') ||
                    selected.length < (pairs ? 2 : 3) ||
                    (pairs && selected.length !== 2) ||
                    selected.some((id) => used.includes(id))
                  }
                  onClick={() => {
                    setGroups((values) => [...values, selected]);
                    setSelected([]);
                  }}
                >
                  {pairs ? t('Seçimi çift yap') : t('Seçimi seri yap')}
                </button>
                <span role="status" className={validation && groups.length ? 'invalid' : ''}>
                  {validation ||
                    (pairs
                      ? t('{count} çift', { count: groups.length })
                      : t('{total} puan · Hazır', { total }))}
                </span>
                <button
                  className="button primary"
                  disabled={!can(pairs ? 'open-pairs' : 'open') || !!validation}
                  onClick={commit}
                >
                  {pairs ? t('Çift aç') : t('Seri aç')}
                </button>
              </footer>
              {target !== null && melds[target] && (
                <div className="rx-process">
                  <label>
                    {t('Seri {number}', { number: target + 1 })}
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
                      !can('process') ||
                      !selected.length ||
                      (selected.length >= tiles.length && !joker) ||
                      (!!joker && selected.length !== 1)
                    }
                    onClick={() =>
                      void action('process', {
                        amount: target,
                        tileIds: selected,
                        ...(joker ? { cardId: joker } : {}),
                      }).then((ok) => {
                        if (ok) {
                          setSelected([]);
                          setJoker('');
                        }
                      })
                    }
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
          <div className="rg-hand-strip">
            <div>
              <h3>
                {own.seat === game.turn
                  ? stage === 'draw'
                    ? t('Taş çek')
                    : t('Taş at')
                  : t('Oyuncu bekleniyor')}
              </h3>
              <p>
                {opened
                  ? opened === 'pairs'
                    ? t('Çift açtın')
                    : t('Seri açtın')
                  : t('Henüz açmadın')}
              </p>
            </div>
            <div className="rg-actions">
              {stage === 'draw' ? (
                <>
                  <button
                    className="button secondary"
                    disabled={!can('draw') || !previous}
                    onClick={() => void action('draw', { cardId: 'discard' })}
                  >
                    {t('Önceki taşı al')}
                  </button>
                  <button
                    className="button primary"
                    disabled={!can('draw')}
                    onClick={() => void action('draw')}
                  >
                    {t('Kapalı taş çek')}
                  </button>
                </>
              ) : (
                <>
                  {stage === 'discard' && can('draw') && (
                    <button className="button secondary" onClick={() => void action('draw')}>
                      {t('Aldığın taşı geri bırak ve kapalı çek')}
                    </button>
                  )}
                  <button
                    className="button primary"
                    disabled={
                      !can('discard') || selected.length !== 1 || used.includes(selected[0])
                    }
                    onClick={() =>
                      void action('discard', { cardId: selected[0] }).then((ok) => {
                        if (ok) setSelected([]);
                      })
                    }
                  >
                    {tiles.length === 1 ? t('Bitir · Son taşı at') : t('Seçili taşı at')}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
