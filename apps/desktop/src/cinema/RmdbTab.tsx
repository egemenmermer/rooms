import { useEffect, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Film,
  Heart,
  LayoutGrid,
  NotebookPen,
  Search,
  Tv,
} from 'lucide-react';
import type { RmdbWorkSummary } from '../../../../packages/community-cinema/src/types';
import { editingTarget } from './hall-model';
import { RmdbDetails } from './RmdbDetails';
import {
  communityRating,
  countsLine,
  filterWorks,
  progressLine,
  progressShare,
  RMDB_GRID,
  rmdbCounts,
  rmdbRows,
  rmdbSorts,
  sortWorks,
  unfinished,
  type RmdbGridView,
  type RmdbKindFilter,
  type RmdbSort,
  type RmdbView,
} from './rmdb-model';
import { useRmdbList } from './rmdb-store';
import { useHall } from './use-hall';
import { HallRow, PosterCard, VodSkeleton } from './VodTab';

const ROW_LIMIT = 20;

/**
 * RMDB: the community's own record of what the hall watched, with members' ratings, reviews
 * and diary. It stays when the IPTV account goes; only opening something needs the catalog.
 */
export function RmdbTab({
  view,
  onView,
  onBrowse,
}: {
  view: RmdbView;
  onView(view: RmdbView): void;
  onBrowse(tab: 'movies' | 'series'): void;
}) {
  // Escape steps back inside RMDB, before the hall's own Escape (which leaves for the stage).
  useEffect(() => {
    if (view.mode === 'home') return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || editingTarget(event.target)) return;
      if (document.querySelector('.modal-backdrop,.settings-layout,.hall-palette-backdrop')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onView(view.mode === 'details' && view.back ? view.back : { mode: 'home' });
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [view, onView]);

  if (view.mode === 'details')
    return (
      <RmdbDetails
        workId={view.workId}
        backLabel={view.back ? 'Tümü' : 'Tayfa'}
        onBack={() => onView(view.back ?? { mode: 'home' })}
      />
    );
  if (view.mode === 'grid')
    return (
      <RmdbGrid
        view={view}
        onView={onView}
        onOpen={(workId) => onView({ mode: 'details', workId, back: view })}
      />
    );
  return (
    <RmdbHome
      onAll={(sort = RMDB_GRID.sort) => onView({ ...RMDB_GRID, sort })}
      onOpen={(workId) => onView({ mode: 'details', workId })}
      onBrowse={onBrowse}
    />
  );
}

function RmdbHome({
  onAll,
  onOpen,
  onBrowse,
}: {
  /** The "Tümü" grid, sorted by `sort`. */
  onAll(sort?: RmdbSort): void;
  onOpen(workId: string): void;
  onBrowse(tab: 'movies' | 'series'): void;
}) {
  const hall = useHall();
  const rmdb = useRmdbList(hall.hallId);
  if (!rmdb.works && rmdb.error)
    return (
      <div className="hall-vod rmdb">
        <div className="rmdb-empty" role="alert">
          <p>{rmdb.error}</p>
          <button className="button secondary" onClick={rmdb.reload}>
            Yeniden dene
          </button>
        </div>
      </div>
    );
  if (!rmdb.works) return <VodSkeleton />;
  const works = rmdb.works;
  if (!works.length)
    return (
      <div className="hall-vod rmdb">
        <RmdbHeader works={works} />
        <div className="rmdb-empty">
          <span className="hall-message-icon">
            <NotebookPen size={28} />
          </span>
          <h3>Tayfa henüz boş</h3>
          <p>
            Salonda izlediğiniz filmler ve diziler burada birikir; yarım kalanlar kaldığı yerde
            durur. Herkes kendi puanını ve yorumunu yazar.
          </p>
          <p>
            Elle eklemek için Filmler ya da Diziler'de bir başlığı aç ve “Tayfa'ya ekle”yi seç.
            Birlikte izlemek istediklerinizi “İzlenecekler'e ekle” ile ortak listeye koy.
          </p>
          {hall.status.connected && (
            <div className="hall-detail-actions">
              <button className="button secondary" onClick={() => onBrowse('movies')}>
                <Film size={16} />
                Filmler
              </button>
              <button className="button secondary" onClick={() => onBrowse('series')}>
                <Tv size={16} />
                Diziler
              </button>
            </div>
          )}
        </div>
      </div>
    );
  const rows = rmdbRows(works);
  return (
    <div className="hall-vod rmdb">
      <RmdbHeader works={works} onAll={() => onAll()} />
      {rows.continuing.length > 0 && (
        <HallRow title="Devam et" count={rows.continuing.length}>
          {rows.continuing.slice(0, ROW_LIMIT).map((work) => (
            <WorkCard key={work.id} work={work} detail="progress" onOpen={() => onOpen(work.id)} />
          ))}
        </HallRow>
      )}
      {rows.watchlist.length ? (
        <HallRow title="İzlenecekler" count={rows.watchlist.length}>
          {rows.watchlist.slice(0, ROW_LIMIT).map((work) => (
            <WorkCard key={work.id} work={work} onOpen={() => onOpen(work.id)} />
          ))}
        </HallRow>
      ) : (
        <section className="hall-row" aria-label="İzlenecekler">
          <header>
            <h3>İzlenecekler</h3>
          </header>
          <p className="rmdb-row-note">
            Ortak liste boş. Bir başlığın sayfasında “İzlenecekler'e ekle” ile herkes ekleyebilir.
          </p>
        </section>
      )}
      {rows.recent.length > 0 && (
        <HallRow title="Son izlenenler" onAll={() => onAll('watched')}>
          {rows.recent.slice(0, ROW_LIMIT).map((work) => (
            <WorkCard key={work.id} work={work} onOpen={() => onOpen(work.id)} />
          ))}
        </HallRow>
      )}
      {rows.favourites.length > 0 && (
        <HallRow title="Topluluğun favorileri" onAll={() => onAll('rating')}>
          {rows.favourites.slice(0, ROW_LIMIT).map((work) => (
            <WorkCard key={work.id} work={work} detail="votes" onOpen={() => onOpen(work.id)} />
          ))}
        </HallRow>
      )}
    </div>
  );
}

function RmdbHeader({ works, onAll }: { works: RmdbWorkSummary[]; onAll?(): void }) {
  return (
    <header className="rmdb-head">
      <div>
        <h2>Tayfa</h2>
        <p>
          Topluluğun film defteri
          {works.length > 0 && <span> · {countsLine(rmdbCounts(works))}</span>}
        </p>
      </div>
      {onAll && (
        <button className="button secondary" onClick={onAll}>
          <LayoutGrid size={16} />
          Tümü
        </button>
      )}
    </header>
  );
}

/** A poster with RMDB's marks: progress, community stars, İzlenecekler and this viewer's heart. */
export function WorkCard({
  work,
  detail,
  onOpen,
}: {
  work: RmdbWorkSummary;
  /** What the line under the title adds: where the hall stopped, or how many voted. */
  detail?: 'progress' | 'votes';
  onOpen(): void;
}) {
  const hall = useHall();
  const open = unfinished(work);
  const rating = communityRating(work);
  const parts: (string | number | null)[] =
    detail === 'progress' && work.progress
      ? [progressLine(work.progress)]
      : detail === 'votes'
        ? [rating, `${work.ratingCount} puan`]
        : [work.year, work.kind === 'series' ? 'Dizi' : null, rating];
  const meta = parts.filter(Boolean).join(' · ');
  const label = [
    work.title,
    work.kind === 'movie' ? 'film' : 'dizi',
    work.year,
    rating ? `topluluk puanı ${rating.replace('★ ', '')}` : null,
    open && work.progress ? `yarım kaldı, ${progressLine(work.progress)}` : null,
    work.onWatchlist ? "İzlenecekler'de" : null,
    work.mine.liked ? 'beğendin' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <PosterCard
      hallId={hall.hallId}
      art={work.art}
      title={work.title}
      meta={meta}
      label={label}
      onOpen={onOpen}
    >
      {(work.onWatchlist || work.mine.liked) && (
        <span className="rmdb-badges" aria-hidden="true">
          {work.onWatchlist && (
            <span className="rmdb-badge" title="İzlenecekler'de">
              <Bookmark size={13} fill="currentColor" />
            </span>
          )}
          {work.mine.liked && (
            <span className="rmdb-badge liked" title="Beğendin">
              <Heart size={13} fill="currentColor" />
            </span>
          )}
        </span>
      )}
      {open && (
        <span
          className="rmdb-progress on-poster"
          style={{ '--progress': progressShare(work.progress) } as CSSProperties}
        />
      )}
    </PosterCard>
  );
}

const kinds: { id: RmdbKindFilter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'movie', label: 'Film' },
  { id: 'series', label: 'Dizi' },
];

function RmdbGrid({
  view,
  onView,
  onOpen,
}: {
  view: RmdbGridView;
  onView(view: RmdbView): void;
  onOpen(workId: string): void;
}) {
  const hall = useHall();
  const rmdb = useRmdbList(hall.hallId);
  const list = rmdb.works
    ? sortWorks(filterWorks(rmdb.works, view.kind, view.text), view.sort)
    : [];
  const set = (change: Partial<RmdbGridView>) => onView({ ...view, ...change });
  return (
    <div className="hall-vod grid-view rmdb">
      <header className="hall-grid-head rmdb-grid-head">
        <button className="hall-text-button" onClick={() => onView({ mode: 'home' })}>
          <ArrowLeft size={15} />
          Tayfa
        </button>
        <h2>Tümü {rmdb.works && <small>{list.length}</small>}</h2>
        <div className="rmdb-segment" role="radiogroup" aria-label="Tür">
          {kinds.map((kind) => (
            <button
              key={kind.id}
              role="radio"
              aria-checked={view.kind === kind.id}
              className={view.kind === kind.id ? 'selected' : ''}
              onClick={() => set({ kind: kind.id })}
            >
              {kind.label}
            </button>
          ))}
        </div>
        <label className="hall-filter rmdb-filter">
          <Search size={14} />
          <input
            value={view.text}
            placeholder="Ada göre süz"
            aria-label="Ada göre süz"
            onChange={(event) => set({ text: event.target.value })}
          />
        </label>
        <label className="hall-sort">
          Sırala
          <select
            value={view.sort}
            onChange={(event) => set({ sort: event.target.value as RmdbSort })}
          >
            {rmdbSorts.map((sort) => (
              <option key={sort.id} value={sort.id}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      {rmdb.error && <p className="hall-empty-note">{rmdb.error}</p>}
      {rmdb.works && !list.length && (
        <p className="hall-empty-note">
          {rmdb.works.length ? 'Bu süzgece uyan kayıt yok.' : 'Tayfa henüz boş.'}
        </p>
      )}
      <div className="hall-poster-grid">
        {rmdb.loading
          ? Array.from({ length: 12 }, (_, index) => (
              <span key={index} className="hall-skeleton poster" />
            ))
          : list.map((work) => (
              <WorkCard key={work.id} work={work} onOpen={() => onOpen(work.id)} />
            ))}
      </div>
    </div>
  );
}
