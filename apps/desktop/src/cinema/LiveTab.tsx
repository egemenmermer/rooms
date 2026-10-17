import { useEffect, useMemo, useRef, useState } from 'react';
import { ListPlus, Play, Search, Tv } from 'lucide-react';
import type { CinemaItem } from '../../../../packages/community-cinema/src/types';
import { CinemaArt, QualityBadges } from './CinemaArt';
import { useAllItems, useCategories } from './catalog-cache';
import { useHall } from './use-hall';

const TILE_MIN = 164;
const TILE_GAP = 10;
const ROW = 118 + TILE_GAP;
const OVERSCAN = 3;

/** Live TV: categories and a calm grid of channel tiles; a click opens the channel in the hall. */
export function LiveTab({
  categoryId,
  onCategory,
  onZapList,
}: {
  categoryId: string | null;
  onCategory(id: string | null): void;
  onZapList(list: CinemaItem[]): void;
}) {
  const hall = useHall();
  const categories = useCategories(hall.hallId, 'live');
  const items = useAllItems(hall.hallId, 'live', categoryId);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const playingRef = hall.current?.media.kind === 'community-media' ? hall.current.media.ref : null;
  const list = useMemo(() => {
    const all = items.data?.items ?? [];
    const terms = filter.trim().toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
    return terms.length
      ? all.filter((item) => {
          const title = item.title.toLocaleLowerCase('tr');
          return terms.every((term) => title.includes(term));
        })
      : all;
  }, [items.data, filter]);
  useEffect(() => {
    if (items.data) onZapList(items.data.items);
  }, [items.data, onZapList]);
  useEffect(() => {
    if (!list.length) return;
    if (!selected || !list.some((item) => item.ref === selected))
      setSelected(list.find((item) => item.ref === playingRef)?.ref ?? list[0]!.ref);
  }, [list, selected, playingRef]);

  // Virtualized grid: only the tile rows in view (plus a little) are rendered.
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600, width: 800 });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () =>
      setView({
        top: element.scrollTop,
        height: element.clientHeight,
        width: element.clientWidth,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const columns = Math.max(1, Math.floor((view.width + TILE_GAP) / (TILE_MIN + TILE_GAP)));
  const rows = Math.ceil(list.length / columns);
  const firstRow = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const lastRow = Math.min(rows, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  const total = categories.data?.reduce((sum, c) => sum + c.count, 0) ?? 0;
  const direct = hall.canDirect || !hall.primary;

  const keyNav = (event: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    if (step === undefined && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    const index = list.findIndex((item) => item.ref === selected);
    if (event.key === 'Enter') {
      if (index >= 0) void hall.openItem(list[index]!);
      return;
    }
    const next = list[Math.min(list.length - 1, Math.max(0, index + step!))];
    if (!next) return;
    setSelected(next.ref);
    const element = scroller.current,
      y = Math.floor(list.indexOf(next) / columns) * ROW;
    if (element && (y < element.scrollTop || y + ROW > element.scrollTop + element.clientHeight))
      element.scrollTop = y - element.clientHeight / 2 + ROW / 2;
  };

  return (
    <div className="hall-live">
      <nav className="hall-categories" aria-label="Kanal kategorileri">
        <button
          className={categoryId === null ? 'selected' : ''}
          aria-current={categoryId === null ? 'true' : undefined}
          onClick={() => onCategory(null)}
        >
          <span className="hall-category-flag">
            <Tv size={15} />
          </span>
          <span>Tüm kanallar</span>
          <small>{total || ''}</small>
        </button>
        {categories.loading && !categories.data && <CategorySkeleton />}
        {categories.data?.map((category) => (
          <button
            key={category.id}
            className={categoryId === category.id ? 'selected' : ''}
            aria-current={categoryId === category.id ? 'true' : undefined}
            onClick={() => onCategory(category.id)}
          >
            <span className="hall-category-flag">{category.flag ?? <Tv size={15} />}</span>
            <span>{category.label}</span>
            <small>{category.count}</small>
          </button>
        ))}
      </nav>
      <section className="hall-channels" aria-label="Kanallar">
        <div className="hall-channels-head">
          <label className="hall-filter">
            <Search size={15} />
            <input
              value={filter}
              placeholder="Bu listede ara"
              aria-label="Kanallarda ara"
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          {!direct && <p className="hall-detail-note">{hall.directReason}</p>}
        </div>
        <div
          ref={scroller}
          className="hall-channel-scroll"
          role="listbox"
          aria-label="Kanal listesi"
          aria-activedescendant={selected ? `hall-channel-${selected}` : undefined}
          tabIndex={0}
          onKeyDown={keyNav}
          onScroll={(event) => {
            // Read now: React clears `currentTarget` before a deferred updater runs.
            const { scrollTop: top, clientHeight: height } = event.currentTarget;
            setView((current) => ({ ...current, top, height }));
          }}
        >
          {items.loading && !items.data ? (
            <ChannelSkeleton />
          ) : items.error ? (
            <p className="hall-empty-note">{items.error}</p>
          ) : !list.length ? (
            <p className="hall-empty-note">
              {filter ? 'Bu adla bir kanal yok.' : 'Bu kategoride kanal yok.'}
            </p>
          ) : (
            <div style={{ height: rows * ROW, position: 'relative' }}>
              {Array.from({ length: lastRow - firstRow }, (_, offset) => {
                const row = firstRow + offset;
                return (
                  <div
                    key={row}
                    className="hall-tile-row"
                    style={{
                      top: row * ROW,
                      height: ROW - TILE_GAP,
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    }}
                  >
                    {list.slice(row * columns, row * columns + columns).map((item) => {
                      const playing = item.ref === playingRef;
                      return (
                        <div
                          key={item.ref}
                          id={`hall-channel-${item.ref}`}
                          role="option"
                          aria-selected={item.ref === selected}
                          title={playing ? 'Bu kanal salonda açık.' : undefined}
                          className={`hall-tile ${item.ref === selected ? 'selected' : ''} ${playing ? 'playing' : ''}`}
                          onClick={() => {
                            setSelected(item.ref);
                            if (!playing) void hall.openItem(item);
                          }}
                        >
                          <CinemaArt hallId={hall.hallId} art={item.art} title={item.title} />
                          <strong>{item.title}</strong>
                          <span className="hall-tile-meta">
                            {playing ? (
                              <>
                                <i className="hall-live-dot" aria-hidden="true" />
                                Salonda
                              </>
                            ) : (
                              <>
                                {item.number !== null && <span>{item.number}</span>}
                                <QualityBadges badges={item.badges} max={1} />
                              </>
                            )}
                          </span>
                          {!playing && (
                            <span className="hall-tile-action" aria-hidden="true">
                              {direct ? <Play size={14} /> : <ListPlus size={14} />}
                              {direct ? 'Salonda aç' : 'Sıraya öner'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CategorySkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <span
          key={index}
          className="hall-skeleton line"
          style={{ width: `${60 + ((index * 13) % 30)}%` }}
        />
      ))}
    </>
  );
}

function ChannelSkeleton() {
  return (
    <div className="hall-skeleton-list" aria-label="Kanallar yükleniyor" role="status">
      {Array.from({ length: 7 }, (_, index) => (
        <span key={index} className="hall-skeleton row" />
      ))}
    </div>
  );
}
