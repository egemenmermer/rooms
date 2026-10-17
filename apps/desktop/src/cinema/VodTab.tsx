import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Info, ListPlus, Play, Star } from 'lucide-react';
import type {
  CatalogKind,
  CinemaCategory,
  CinemaDetails,
  CinemaItem,
} from '../../../../packages/community-cinema/src/types';
import { cinemaArt } from './cinema-bridge';
import { CinemaArt, QualityBadges } from './CinemaArt';
import { rememberItems, useBridgeRead, useCategories, useItems } from './catalog-cache';
import { minutesLabel } from './hall-model';
import { useHall } from './use-hall';

type VodKind = Extract<CatalogKind, 'movie' | 'series'>;
export type VodView =
  | { mode: 'home' }
  | { mode: 'grid'; categoryId: string | null; label: string }
  | { mode: 'details'; ref: string };

const NEW_DAYS = 14;

/** Movies or series: a hero and rows, a full grid per category, and a details page. */
export function VodTab({
  kind,
  view,
  onView,
}: {
  kind: VodKind;
  view: VodView;
  onView(view: VodView): void;
}) {
  if (view.mode === 'details')
    return <VodDetails kind={kind} refId={view.ref} onBack={() => onView({ mode: 'home' })} />;
  if (view.mode === 'grid')
    return (
      <VodGrid
        kind={kind}
        categoryId={view.categoryId}
        label={view.label}
        onBack={() => onView({ mode: 'home' })}
        onOpen={(ref) => onView({ mode: 'details', ref })}
      />
    );
  return <VodHome kind={kind} onView={onView} />;
}

function VodHome({ kind, onView }: { kind: VodKind; onView(view: VodView): void }) {
  const hall = useHall();
  const categories = useCategories(hall.hallId, kind);
  const recent = useItems(hall.hallId, kind, null, 'added', 24);
  const hero =
    recent.data?.items.find((item) => item.rating !== null) ?? recent.data?.items[0] ?? null;
  const noun = kind === 'movie' ? 'film' : 'dizi';
  if (recent.loading && !recent.data) return <VodSkeleton />;
  if (recent.error) return <p className="hall-empty-note">{recent.error}</p>;
  if (!recent.data?.items.length)
    return <p className="hall-empty-note">Katalogda henüz {noun} yok.</p>;
  return (
    <div className="hall-vod">
      {hero && (
        <Hero
          item={hero}
          kind={kind}
          onDetails={() => onView({ mode: 'details', ref: hero.ref })}
        />
      )}
      <Row
        title="Yeni eklenenler"
        items={recent.data.items}
        onAll={() =>
          onView({
            mode: 'grid',
            categoryId: null,
            label: kind === 'movie' ? 'Tüm filmler' : 'Tüm diziler',
          })
        }
        onOpen={(ref) => onView({ mode: 'details', ref })}
      />
      {categories.data?.slice(0, 8).map((category) => (
        <CategoryRow
          key={category.id}
          kind={kind}
          category={category}
          onAll={() => onView({ mode: 'grid', categoryId: category.id, label: category.label })}
          onOpen={(ref) => onView({ mode: 'details', ref })}
        />
      ))}
    </div>
  );
}

function Hero({ item, kind, onDetails }: { item: CinemaItem; kind: VodKind; onDetails(): void }) {
  const hall = useHall();
  const details = useBridgeRead<CinemaDetails>(`${hall.hallId}:details:${item.ref}`, (bridge) =>
    bridge.details(hall.hallId, item.ref),
  );
  const backdrop = cinemaArt(hall.hallId, details.data?.backdrop ?? item.art);
  const steer = hall.canDirect || !hall.primary;
  const firstEpisode = details.data?.seasons[0]?.episodes[0];
  return (
    <section className="hall-hero" aria-label={item.title}>
      {backdrop && <img className="hall-hero-backdrop" src={backdrop} alt="" draggable={false} />}
      <div className="hall-hero-shade" />
      <div className="hall-hero-text">
        <span className="hall-eyebrow">{kind === 'movie' ? 'Yeni film' : 'Yeni dizi'}</span>
        <h2>{item.title}</h2>
        <Meta item={item} details={details.data} />
        {details.data?.plot && <p>{details.data.plot}</p>}
        <div className="hall-detail-actions">
          <button
            className="button primary"
            disabled={kind === 'series' && !firstEpisode}
            onClick={() =>
              kind === 'movie'
                ? void hall.openItem(item)
                : firstEpisode && void hall.openEpisode(item, firstEpisode)
            }
          >
            {steer ? <Play size={16} /> : <ListPlus size={16} />}
            {steer ? (kind === 'movie' ? 'Salonda oynat' : 'İlk bölümü oynat') : 'Sıraya öner'}
          </button>
          <button className="button secondary" onClick={onDetails}>
            <Info size={16} />
            Ayrıntılar
          </button>
        </div>
      </div>
    </section>
  );
}

function Meta({ item, details }: { item: CinemaItem; details: CinemaDetails | null }) {
  const parts = [
    item.year,
    details?.genre,
    details?.durationSec ? minutesLabel(details.durationSec * 1000) : null,
    details?.seasons.length ? `${details.seasons.length} sezon` : null,
  ].filter(Boolean);
  return (
    <p className="hall-meta">
      {item.rating !== null && (
        <span className="hall-rating">
          <Star size={13} />
          {item.rating.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
        </span>
      )}
      {parts.map((part) => (
        <span key={String(part)}>{part}</span>
      ))}
      <QualityBadges badges={item.badges} max={2} />
    </p>
  );
}

function CategoryRow({
  kind,
  category,
  onAll,
  onOpen,
}: {
  kind: VodKind;
  category: CinemaCategory;
  onAll(): void;
  onOpen(ref: string): void;
}) {
  const hall = useHall();
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);
  const items = useBridgeRead(seen ? `${hall.hallId}:${kind}:${category.id}:row` : null, (bridge) =>
    bridge.items(hall.hallId, { kind, categoryId: category.id, limit: 20 }).then((page) => {
      rememberItems(page.items);
      return page.items;
    }),
  );
  return (
    <Row
      sectionRef={ref}
      title={category.label}
      count={category.count}
      items={items.data}
      onAll={onAll}
      onOpen={onOpen}
    />
  );
}

function Row({
  title,
  count,
  items,
  sectionRef,
  onAll,
  onOpen,
}: {
  title: string;
  count?: number;
  items: CinemaItem[] | null;
  sectionRef?: React.Ref<HTMLElement>;
  onAll(): void;
  onOpen(ref: string): void;
}) {
  const hall = useHall();
  const now = Date.now();
  return (
    <section className="hall-row" ref={sectionRef} aria-label={title}>
      <header>
        <h3>
          {title}
          {count !== undefined && <small>{count}</small>}
        </h3>
        <button className="hall-text-button" onClick={onAll}>
          Tümünü gör
          <ChevronRight size={15} />
        </button>
      </header>
      <div className="hall-row-track">
        {items
          ? items.map((item) => (
              <Poster
                key={item.ref}
                item={item}
                fresh={!!item.addedAt && now - item.addedAt < NEW_DAYS * 86_400_000}
                onOpen={() => onOpen(item.ref)}
                hallId={hall.hallId}
              />
            ))
          : Array.from({ length: 7 }, (_, index) => (
              <span key={index} className="hall-skeleton poster" />
            ))}
      </div>
    </section>
  );
}

function Poster({
  item,
  fresh,
  hallId,
  onOpen,
}: {
  item: CinemaItem;
  fresh: boolean;
  hallId: string;
  onOpen(): void;
}) {
  return (
    <button className="hall-poster" onClick={onOpen} title={item.title}>
      <span className="hall-poster-frame">
        <CinemaArt hallId={hallId} art={item.art} title={item.title} shape="poster" />
        {fresh && <span className="hall-new-badge">Yeni</span>}
      </span>
      <strong>{item.title}</strong>
      <small>
        {[
          item.year,
          item.rating !== null
            ? `★ ${item.rating.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </small>
    </button>
  );
}

function VodGrid({
  kind,
  categoryId,
  label,
  onBack,
  onOpen,
}: {
  kind: VodKind;
  categoryId: string | null;
  label: string;
  onBack(): void;
  onOpen(ref: string): void;
}) {
  const hall = useHall();
  const [sort, setSort] = useState<'added' | 'name' | 'rating'>('added');
  const [limit, setLimit] = useState(60);
  const items = useItems(hall.hallId, kind, categoryId, sort, limit);
  const sentinel = useRef<HTMLDivElement>(null);
  const total = items.data?.total ?? 0;
  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && limit < total)
        setLimit((value) => value + 60);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [limit, total]);
  const now = Date.now();
  return (
    <div className="hall-vod grid-view">
      <header className="hall-grid-head">
        <button className="hall-text-button" onClick={onBack}>
          <ArrowLeft size={15} />
          {kind === 'movie' ? 'Filmler' : 'Diziler'}
        </button>
        <h2>
          {label} {total > 0 && <small>{total}</small>}
        </h2>
        <label className="hall-sort">
          Sırala
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="added">Yeni eklenen</option>
            <option value="name">Ada göre</option>
            <option value="rating">Puana göre</option>
          </select>
        </label>
      </header>
      {items.error && <p className="hall-empty-note">{items.error}</p>}
      <div className="hall-poster-grid">
        {items.data?.items.map((item) => (
          <Poster
            key={item.ref}
            item={item}
            hallId={hall.hallId}
            fresh={!!item.addedAt && now - item.addedAt < NEW_DAYS * 86_400_000}
            onOpen={() => onOpen(item.ref)}
          />
        ))}
        {items.loading &&
          Array.from({ length: 12 }, (_, index) => (
            <span key={index} className="hall-skeleton poster" />
          ))}
      </div>
      <div ref={sentinel} className="hall-sentinel" />
    </div>
  );
}

function VodDetails({ kind, refId, onBack }: { kind: VodKind; refId: string; onBack(): void }) {
  const hall = useHall();
  const details = useBridgeRead<CinemaDetails>(`${hall.hallId}:details:${refId}`, (bridge) =>
    bridge.details(hall.hallId, refId).then((value) => {
      rememberItems([value.item]);
      return value;
    }),
  );
  const [season, setSeason] = useState<number | null>(null);
  const data = details.data;
  const seasons = data?.seasons ?? [];
  const activeSeason = seasons.find((value) => value.season === season) ?? seasons[0] ?? null;
  const steer = hall.canDirect || !hall.primary;
  const backdrop = cinemaArt(hall.hallId, data?.backdrop ?? data?.item.art);
  const playingRef = hall.current?.media.kind === 'community-media' ? hall.current.media.ref : null;
  return (
    <div className="hall-vod details-view">
      <button className="hall-text-button hall-back" onClick={onBack}>
        <ArrowLeft size={15} />
        {kind === 'movie' ? 'Filmler' : 'Diziler'}
      </button>
      {details.loading && !data ? (
        <VodSkeleton />
      ) : details.error || !data ? (
        <p className="hall-empty-note">{details.error ?? 'Ayrıntılar alınamadı.'}</p>
      ) : (
        <>
          <section className="hall-details-head">
            {backdrop && (
              <img className="hall-hero-backdrop" src={backdrop} alt="" draggable={false} />
            )}
            <div className="hall-hero-shade" />
            <div className="hall-details-body">
              <CinemaArt
                hallId={hall.hallId}
                art={data.item.art}
                title={data.item.title}
                shape="poster"
              />
              <div className="hall-hero-text">
                <span className="hall-eyebrow">{kind === 'movie' ? 'Film' : 'Dizi'}</span>
                <h2>{data.item.title}</h2>
                <Meta item={data.item} details={data} />
                {data.plot && <p>{data.plot}</p>}
                <dl className="hall-credits">
                  {data.director && (
                    <>
                      <dt>Yönetmen</dt>
                      <dd>{data.director}</dd>
                    </>
                  )}
                  {data.cast && (
                    <>
                      <dt>Oyuncular</dt>
                      <dd>{data.cast}</dd>
                    </>
                  )}
                </dl>
                {kind === 'movie' && (
                  <div className="hall-detail-actions">
                    <button
                      className="button primary"
                      disabled={playingRef === data.item.ref}
                      onClick={() => void hall.openItem(data.item)}
                    >
                      {steer ? <Play size={16} /> : <ListPlus size={16} />}
                      {playingRef === data.item.ref
                        ? 'Salonda açık'
                        : steer
                          ? 'Salonda oynat'
                          : 'Sıraya öner'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
          {kind === 'series' && activeSeason && (
            <section className="hall-episodes" aria-label="Bölümler">
              <div className="hall-season-tabs" role="tablist" aria-label="Sezonlar">
                {seasons.map((value) => (
                  <button
                    key={value.season}
                    role="tab"
                    aria-selected={value.season === activeSeason.season}
                    className={value.season === activeSeason.season ? 'selected' : ''}
                    onClick={() => setSeason(value.season)}
                  >
                    {value.season}. Sezon
                  </button>
                ))}
              </div>
              <ol>
                {activeSeason.episodes.map((episode) => (
                  <li key={episode.ref} className={playingRef === episode.ref ? 'playing' : ''}>
                    <button
                      className="hall-episode"
                      disabled={playingRef === episode.ref}
                      onClick={() => void hall.openEpisode(data.item, episode)}
                      aria-label={`${episode.episode}. bölüm, ${episode.title}: ${steer ? 'salonda oynat' : 'sıraya öner'}`}
                    >
                      <span className="hall-episode-thumb">
                        <CinemaArt
                          hallId={hall.hallId}
                          art={episode.art}
                          title={episode.title}
                          shape="wide"
                        />
                        <span className="hall-episode-play">
                          {steer ? <Play size={18} /> : <ListPlus size={18} />}
                        </span>
                        <small>
                          S{episode.season} B{episode.episode}
                        </small>
                      </span>
                      <span className="hall-episode-text">
                        <strong>
                          {episode.episode}. {episode.title}
                          {episode.durationSec ? (
                            <small> · {minutesLabel(episode.durationSec * 1000)}</small>
                          ) : null}
                        </strong>
                        {episode.plot && <span>{episode.plot}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function VodSkeleton() {
  return (
    <div className="hall-vod" role="status" aria-label="Yükleniyor">
      <span className="hall-skeleton hero" />
      <span className="hall-skeleton line" style={{ width: 180 }} />
      <div className="hall-row-track">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} className="hall-skeleton poster" />
        ))}
      </div>
    </div>
  );
}
