import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CalendarClock, ListPlus, Play, Search, Tv } from 'lucide-react';
import type { CinemaItem } from '../../../../packages/community-cinema/src/types';
import { CinemaArt, QualityBadges } from './CinemaArt';
import { useCategories, useItems } from './catalog-cache';
import { useGuides, useNow } from './guide-cache';
import {
  hhmm,
  minutesLabel,
  programmeAfter,
  programmeAt,
  programmeProgress,
  timeRange,
} from './hall-model';
import { useHall } from './use-hall';

const ROW = 76;
const OVERSCAN = 6;

/** Live TV: categories, channel cards with what is on now, and the selected channel's guide. */
export function LiveTab({
  categoryId,
  onCategory,
  onZapList,
  onGuide,
}: {
  categoryId: string | null;
  onCategory(id: string | null): void;
  onZapList(list: CinemaItem[]): void;
  onGuide(ref: string): void;
}) {
  const hall = useHall();
  const categories = useCategories(hall.hallId, 'live');
  const items = useItems(hall.hallId, 'live', categoryId);
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

  // Virtualized channel list: only the rows in view (plus a little) are rendered.
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setView({ top: element.scrollTop, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const last = Math.min(list.length, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  const visible = list.slice(first, last);
  const now = useNow();
  const selectedItem = list.find((item) => item.ref === selected) ?? null;
  const guides = useGuides(
    hall.hallId,
    [...visible, ...(selectedItem ? [selectedItem] : [])]
      .filter((i) => i.hasGuide)
      .map((i) => i.ref),
  );
  const total = categories.data?.reduce((sum, c) => sum + c.count, 0) ?? 0;

  const keyNav = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    const index = list.findIndex((item) => item.ref === selected);
    if (event.key === 'Enter' && selectedItem) {
      void hall.openItem(selectedItem);
      return;
    }
    const next =
      list[Math.min(list.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    setSelected(next.ref);
    const element = scroller.current,
      y = list.indexOf(next) * ROW;
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
        <label className="hall-filter">
          <Search size={15} />
          <input
            value={filter}
            placeholder="Bu listede ara"
            aria-label="Kanallarda ara"
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <div
          ref={scroller}
          className="hall-channel-scroll"
          role="listbox"
          aria-label="Kanal listesi"
          aria-activedescendant={selected ? `hall-channel-${selected}` : undefined}
          tabIndex={0}
          onKeyDown={keyNav}
          onScroll={(event) =>
            setView({
              top: event.currentTarget.scrollTop,
              height: event.currentTarget.clientHeight,
            })
          }
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
            <div style={{ height: list.length * ROW, position: 'relative' }}>
              {visible.map((item, offset) => {
                const programmes = guides[item.ref];
                const onAir = programmeAt(programmes, now);
                return (
                  <div
                    key={item.ref}
                    id={`hall-channel-${item.ref}`}
                    role="option"
                    aria-selected={item.ref === selected}
                    className={`hall-channel ${item.ref === selected ? 'selected' : ''} ${item.ref === playingRef ? 'playing' : ''}`}
                    style={{ top: (first + offset) * ROW, height: ROW - 6 }}
                    onClick={() => setSelected(item.ref)}
                    onDoubleClick={() => void hall.openItem(item)}
                  >
                    <span className="hall-channel-number">{item.number ?? ''}</span>
                    <CinemaArt hallId={hall.hallId} art={item.art} title={item.title} />
                    <span className="hall-channel-text">
                      <span className="hall-channel-name">
                        <QualityBadges badges={item.badges} max={1} />
                        <strong>{item.title}</strong>
                        {item.ref === playingRef && (
                          <i className="hall-live-dot" aria-label="Salonda açık" />
                        )}
                      </span>
                      <span className="hall-channel-programme">
                        {onAir
                          ? onAir.title
                          : item.hasGuide
                            ? programmes
                              ? 'Yayın akışı yok'
                              : ' '
                            : 'Rehber yok'}
                      </span>
                      {onAir && (
                        <span className="hall-channel-time">
                          <span>{timeRange(onAir)}</span>
                          <span
                            className="hall-progress"
                            style={{ '--progress': programmeProgress(onAir, now) } as CSSProperties}
                          />
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <ChannelDetail
        item={selectedItem}
        guides={selectedItem ? guides[selectedItem.ref] : undefined}
        now={now}
        playing={selectedItem?.ref === playingRef}
        onGuide={onGuide}
      />
    </div>
  );
}

function ChannelDetail({
  item,
  guides,
  now,
  playing,
  onGuide,
}: {
  item: CinemaItem | null;
  guides: ReturnType<typeof useGuides>[string];
  now: number;
  playing: boolean;
  onGuide(ref: string): void;
}) {
  const hall = useHall();
  if (!item)
    return (
      <aside className="hall-channel-detail empty">
        <Tv size={28} />
        <p>Bir kanal seç. Neyin yayında olduğunu burada görürsün.</p>
      </aside>
    );
  const onAir = programmeAt(guides, now);
  const upcoming = guides?.filter((p) => p.start >= (onAir?.stop ?? now)).slice(0, 4) ?? [];
  const next = programmeAfter(guides, now);
  return (
    <aside className="hall-channel-detail" aria-label={`${item.title} yayın bilgisi`}>
      <header>
        <CinemaArt hallId={hall.hallId} art={item.art} title={item.title} />
        <div>
          <h2>{item.title}</h2>
          <span>
            {item.number !== null && <>Kanal {item.number} · </>}
            <QualityBadges badges={item.badges} max={3} />
          </span>
        </div>
      </header>
      <section className="hall-onair">
        <span className="hall-eyebrow live">Yayında</span>
        {onAir ? (
          <>
            <h3>{onAir.title}</h3>
            <p className="hall-onair-time">
              {timeRange(onAir)} · {minutesLabel(onAir.stop - now)} kaldı
            </p>
            <span
              className="hall-progress large"
              style={{ '--progress': programmeProgress(onAir, now) } as CSSProperties}
            />
            {onAir.description && <p className="hall-onair-description">{onAir.description}</p>}
          </>
        ) : (
          <p className="hall-onair-description">
            {item.hasGuide ? 'Şu an için yayın akışı bilgisi yok.' : 'Bu kanalın rehberi yok.'}
          </p>
        )}
      </section>
      <div className="hall-detail-actions">
        <button
          className="button primary"
          disabled={playing}
          title={playing ? 'Bu kanal zaten salonda açık.' : undefined}
          onClick={() => void hall.openItem(item)}
        >
          {hall.canDirect || !hall.primary ? <Play size={16} /> : <ListPlus size={16} />}
          {playing
            ? 'Salonda açık'
            : hall.canDirect || !hall.primary
              ? 'Salonda aç'
              : 'Sıraya öner'}
        </button>
        {item.hasGuide && (
          <button className="button secondary" onClick={() => onGuide(item.ref)}>
            <CalendarClock size={16} />
            Rehberde gör
          </button>
        )}
      </div>
      {!hall.canDirect && hall.primary && <p className="hall-detail-note">{hall.directReason}</p>}
      {upcoming.length > 0 && (
        <section className="hall-upcoming">
          <span className="hall-eyebrow">Sıradaki</span>
          <ol>
            {upcoming.map((p) => (
              <li key={p.start}>
                <time>{hhmm(p.start)}</time>
                <span>{p.title}</span>
                <small>{minutesLabel(p.stop - p.start)}</small>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!upcoming.length && next && <p className="hall-detail-note">Sonra: {next.title}</p>}
    </aside>
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
