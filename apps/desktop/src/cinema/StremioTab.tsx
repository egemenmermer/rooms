import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clapperboard,
  ListPlus,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Star,
} from 'lucide-react';
import type {
  StremioContinueItem,
  StremioDetails,
  StremioHome,
  StremioStream,
  StremioStreams,
  StremioTitle,
  StremioType,
  StremioVideo,
} from '../../../../packages/community-cinema/src/types';
import { cinemaErrorText, getCinemaBridge } from './cinema-bridge';
import { CinemaArt } from './CinemaArt';
import { useBridgeRead } from './catalog-cache';
import { useHall } from './use-hall';
import { Credits, DetailsHead, HallRow, PosterCard, VodSkeleton } from './VodTab';

export type StremioView =
  | { mode: 'home'; query: string }
  | { mode: 'details'; type: StremioType; id: string; videoId: string | null };

/**
 * Stremio: what the owner's linked account watches and has saved, Cinemeta search, and per
 * film or episode the streams its add-ons (Torrentio with a debrid service…) offer. A picked
 * stream plays in the hall through the server, like a catalog film.
 */
export function StremioTab({
  view,
  onView,
}: {
  view: StremioView;
  onView(view: StremioView): void;
}) {
  const hall = useHall();
  if (!hall.status.stremio?.linked) return <NotLinked />;
  if (view.mode === 'details')
    return (
      <StremioDetailsView
        key={`${view.type}:${view.id}`}
        type={view.type}
        id={view.id}
        videoId={view.videoId}
        onBack={() => onView({ mode: 'home', query: '' })}
      />
    );
  return <StremioHomeView query={view.query} onView={onView} />;
}

function NotLinked() {
  const hall = useHall();
  const navigate = useNavigate();
  return (
    <div className="hall-message">
      <span className="hall-message-icon">
        <Clapperboard size={28} />
      </span>
      <h2>{hall.status.isOwner ? 'Stremio hesabını bağla' : 'Stremio bağlı değil'}</h2>
      <p>
        {hall.status.isOwner
          ? 'Stremio’da kurulu eklentilerin (Torrentio ve Real-Debrid gibi) buradaki filmler ve diziler için kaynak bulur. Seçtiğin kaynak sunucudan herkese aynı anda oynar. Hesap anahtarın ve debrid anahtarın hiçbir üyeye gitmez.'
          : 'Topluluk sahibi Stremio hesabını bağladığında filmler ve diziler burada olacak.'}
      </p>
      {hall.status.isOwner && (
        <button className="button primary" onClick={() => navigate('/settings?tab=cinema')}>
          <Settings2 size={16} />
          Bağlantıyı kur
        </button>
      )}
    </div>
  );
}

function StremioHomeView({ query, onView }: { query: string; onView(view: StremioView): void }) {
  const hall = useHall();
  const [text, setText] = useState(query);
  const [searched, setSearched] = useState(query.trim());
  // Search once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setSearched(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);
  const home = useBridgeRead<StremioHome>(`${hall.hallId}:stremio-home`, (bridge) =>
    bridge.stremioHome(hall.hallId),
  );
  const results = useBridgeRead<StremioTitle[]>(
    searched ? `${hall.hallId}:stremio-search:${searched}` : null,
    (bridge) => bridge.stremioSearch(hall.hallId, searched),
  );
  const open = (title: StremioTitle, videoId: string | null = null) =>
    onView({ mode: 'details', type: title.type, id: title.id, videoId });
  return (
    <div className="hall-vod stremio-home">
      <div className="stremio-search">
        <label className="hall-filter">
          <Search size={15} />
          <input
            value={text}
            placeholder="Stremio’da film veya dizi ara"
            aria-label="Stremio’da ara"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setText('')}
          />
        </label>
      </div>
      {searched ? (
        results.loading && !results.data ? (
          <VodSkeleton />
        ) : results.error ? (
          <p className="hall-empty-note">{results.error}</p>
        ) : !results.data?.length ? (
          <p className="hall-empty-note">“{searched}” için bir şey bulunamadı.</p>
        ) : (
          <div className="hall-poster-grid" aria-label="Arama sonuçları">
            {results.data.map((title) => (
              <TitleCard
                key={`${title.type}:${title.id}`}
                title={title}
                onOpen={() => open(title)}
              />
            ))}
          </div>
        )
      ) : home.error ? (
        <p className="hall-empty-note">{home.error}</p>
      ) : (
        <>
          {(home.loading || !!home.data?.continue.length) && (
            <HallRow title="İzlemeye devam et" loading={!home.data}>
              {home.data?.continue.map((item) => (
                <ContinueCard
                  key={`${item.type}:${item.id}`}
                  item={item}
                  onOpen={() => open(item, item.videoId)}
                />
              ))}
            </HallRow>
          )}
          {(home.loading || !!home.data?.library.length) && (
            <HallRow title="Kitaplığın" loading={!home.data}>
              {home.data?.library.map((title) => (
                <TitleCard
                  key={`${title.type}:${title.id}`}
                  title={title}
                  onOpen={() => open(title)}
                />
              ))}
            </HallRow>
          )}
          <HallRow title="Popüler filmler" loading={!home.data}>
            {home.data?.popular.movie.map((title) => (
              <TitleCard key={title.id} title={title} onOpen={() => open(title)} />
            ))}
          </HallRow>
          <HallRow title="Popüler diziler" loading={!home.data}>
            {home.data?.popular.series.map((title) => (
              <TitleCard key={title.id} title={title} onOpen={() => open(title)} />
            ))}
          </HallRow>
        </>
      )}
    </div>
  );
}

function TitleCard({ title, onOpen }: { title: StremioTitle; onOpen(): void }) {
  const hall = useHall();
  return (
    <PosterCard
      hallId={hall.hallId}
      art={title.art}
      title={title.name}
      meta={[title.year, title.type === 'series' ? 'Dizi' : 'Film'].filter(Boolean).join(' · ')}
      onOpen={onOpen}
    />
  );
}

function ContinueCard({ item, onOpen }: { item: StremioContinueItem; onOpen(): void }) {
  const hall = useHall();
  return (
    <PosterCard
      hallId={hall.hallId}
      art={item.art}
      title={item.name}
      meta={
        item.season && item.episode ? `S${item.season} B${item.episode}` : (item.year ?? 'Film')
      }
      label={`${item.name}: kaldığın yerden kaynak seç`}
      onOpen={onOpen}
    >
      {item.progress !== null && (
        <span
          className="hall-continue-progress"
          style={{ '--progress': item.progress } as CSSProperties}
        />
      )}
    </PosterCard>
  );
}

function StremioDetailsView({
  type,
  id,
  videoId,
  onBack,
}: {
  type: StremioType;
  id: string;
  videoId: string | null;
  onBack(): void;
}) {
  const hall = useHall();
  const details = useBridgeRead<StremioDetails>(
    `${hall.hallId}:stremio-details:${type}:${id}`,
    (bridge) => bridge.stremioDetails(hall.hallId, type, id),
  );
  const data = details.data;
  const seasons = useMemo(() => {
    const map = new Map<number, StremioVideo[]>();
    for (const video of data?.videos ?? [])
      map.set(video.season, [...(map.get(video.season) ?? []), video]);
    // Specials (season 0) go last.
    return [...map].sort((a, b) => (a[0] || 1e6) - (b[0] || 1e6));
  }, [data]);
  const [episode, setEpisode] = useState<string | null>(videoId);
  const [season, setSeason] = useState<number | null>(null);
  const chosen = data?.videos.find((video) => video.id === episode) ?? null;
  const activeSeason = season ?? chosen?.season ?? seasons[0]?.[0] ?? null;
  const episodes = seasons.find(([value]) => value === activeSeason)?.[1] ?? [];
  const streamsFor = type === 'movie' ? id : (chosen?.id ?? null);
  return (
    <div className="hall-vod details-view">
      <button className="hall-text-button hall-back" onClick={onBack}>
        <ArrowLeft size={15} />
        Stremio
      </button>
      {details.loading && !data ? (
        <VodSkeleton />
      ) : details.error || !data ? (
        <p className="hall-empty-note">{details.error ?? 'Ayrıntılar alınamadı.'}</p>
      ) : (
        <>
          <DetailsHead
            hallId={hall.hallId}
            backdrop={data.backdrop}
            art={data.art}
            title={data.name}
          >
            <span className="hall-eyebrow">{type === 'movie' ? 'Film' : 'Dizi'} · Stremio</span>
            <h2>{data.name}</h2>
            <p className="hall-meta">
              {data.rating && (
                <span className="hall-rating">
                  <Star size={13} />
                  {data.rating}
                </span>
              )}
              {[data.year, data.genres.slice(0, 3).join(', '), data.runtime]
                .filter(Boolean)
                .map((part) => (
                  <span key={part}>{part}</span>
                ))}
            </p>
            {data.plot && <p>{data.plot}</p>}
            <Credits
              director={data.director.join(', ') || null}
              cast={data.cast.slice(0, 6).join(', ') || null}
            />
          </DetailsHead>
          {type === 'series' && (
            <section className="hall-episodes" aria-label="Bölümler">
              <div className="hall-season-tabs" role="tablist" aria-label="Sezonlar">
                {seasons.map(([value]) => (
                  <button
                    key={value}
                    role="tab"
                    aria-selected={value === activeSeason}
                    className={value === activeSeason ? 'selected' : ''}
                    onClick={() => setSeason(value)}
                  >
                    {value === 0 ? 'Özel' : `${value}. Sezon`}
                  </button>
                ))}
              </div>
              <ol>
                {episodes.map((video) => (
                  <li key={video.id} className={video.id === episode ? 'playing stremio-open' : ''}>
                    <button
                      className="hall-episode"
                      aria-pressed={video.id === episode}
                      onClick={() => setEpisode(video.id)}
                    >
                      <span className="hall-episode-thumb">
                        <CinemaArt
                          hallId={hall.hallId}
                          art={video.art}
                          title={video.title}
                          shape="wide"
                        />
                        <small>
                          S{video.season} B{video.episode}
                        </small>
                      </span>
                      <span className="hall-episode-text">
                        <strong>
                          {video.episode}. {video.title}
                        </strong>
                        {video.plot && <span>{video.plot}</span>}
                      </span>
                    </button>
                    {video.id === episode && (
                      <StreamList type={type} id={id} videoId={video.id} reveal />
                    )}
                  </li>
                ))}
              </ol>
              {!episodes.length && <p className="hall-empty-note">Bu dizinin bölüm listesi yok.</p>}
            </section>
          )}
          {type === 'movie' && streamsFor && (
            <StreamList type={type} id={id} videoId={streamsFor} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * What the account's add-ons offer for one film or episode; a click plays it in the hall.
 * Add-ons that refuse the server (Torrentio blocks data-centre addresses) are asked from
 * this computer when it is the one that linked the account.
 */
function StreamList({
  type,
  id,
  videoId,
  reveal = false,
}: {
  type: StremioType;
  id: string;
  videoId: string;
  /** Scrolls the list into view (an episode further down the season). */
  reveal?: boolean;
}) {
  const hall = useHall();
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reveal) section.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [reveal]);
  const admin = hall.status.isOwner;
  const streams = useBridgeRead<StremioStreams>(
    admin ? `${hall.hallId}:stremio-streams:${type}:${videoId}` : null,
    (bridge) => bridge.stremioStreams(hall.hallId, type, id, videoId),
  );
  const assist = !!streams.data?.assist;
  const local = useBridgeRead<StremioStream[]>(
    assist
      ? `${hall.hallId}:stremio-assist:${type}:${videoId}:${streams.data?.streams.length}`
      : null,
    (bridge) => bridge.stremioAssist(hall.hallId, type, id, videoId),
  );
  const localIds = useMemo(
    () => new Set((local.data ?? []).map((stream) => stream.id)),
    [local.data],
  );
  const all = [...(local.data ?? []), ...(streams.data?.streams ?? [])];
  const [picking, setPicking] = useState<string | null>(null);
  const steer = hall.canDirect || !hall.primary;
  const play = async (stream: StremioStream) => {
    const bridge = getCinemaBridge();
    if (!bridge || picking) return;
    setPicking(stream.id);
    try {
      const picked = localIds.has(stream.id)
        ? await bridge.stremioPickLocal(hall.hallId, stream.id)
        : await bridge.stremioPick(hall.hallId, stream.id);
      await hall.open({
        kind: 'community-media',
        ref: picked.ref,
        title: picked.title.slice(0, 240),
        live: false,
        art: picked.art && /^[a-f0-9]{16,64}$/.test(picked.art) ? picked.art : null,
      });
    } catch (error) {
      const text = cinemaErrorText(error);
      hall.notify(text);
      if (/eskidi/.test(text)) {
        streams.reload();
        local.reload();
      }
    } finally {
      setPicking(null);
    }
  };
  if (!admin)
    return (
      <section className="stremio-streams" aria-label="Kaynaklar">
        <p className="hall-empty-note">
          Kaynakları topluluk sahibi ve yöneticiler seçer; açtıkları şey salonda herkes için oynar.
        </p>
      </section>
    );
  const loading = (streams.loading && !streams.data) || (assist && local.loading && !local.data);
  const blocked = streams.data?.blockedAddons ?? [];
  return (
    <section
      ref={section}
      className="stremio-streams"
      aria-label="Kaynaklar"
      aria-busy={streams.loading || local.loading}
    >
      <header>
        <h3>Kaynaklar</h3>
        <button
          className="hall-text-button"
          onClick={() => {
            streams.reload();
            if (assist) local.reload();
          }}
          disabled={streams.loading || local.loading}
          aria-label="Kaynakları yeniden ara"
        >
          <RefreshCw size={14} />
          Yenile
        </button>
      </header>
      {loading ? (
        <p className="hall-empty-note" role="status">
          Eklentiler kaynak arıyor… Bu birkaç saniye sürebilir.
        </p>
      ) : streams.error ? (
        <p className="hall-empty-note">{streams.error}</p>
      ) : !all.length ? (
        <p className="hall-empty-note">
          {streams.data?.skippedTorrents
            ? `${streams.data.skippedTorrents} torrent bulundu ama sunucu yalnızca doğrudan bağlantıları oynatır. Stremio’daki Torrentio ayarına Real-Debrid gibi bir debrid hesabı ekle.`
            : streams.data?.skippedOther
              ? `${streams.data.skippedOther} kaynak bulundu ama hiçbiri salonda oynatılabilen doğrudan bir bağlantı değil (dış sayfa, YouTube veya Usenet).`
              : 'Bu içerik için eklentilerin bir kaynak bulamadı.'}
        </p>
      ) : (
        <ol>
          {all.map((stream) => {
            const [first, ...rest] = stream.title.split('\n');
            return (
              <li key={stream.id}>
                <button
                  className="stremio-stream"
                  disabled={!!picking}
                  onClick={() => void play(stream)}
                  aria-label={`${stream.resolution ?? ''} ${first}: ${steer ? 'salonda oynat' : 'sıraya öner'}`}
                >
                  <span className="stremio-stream-quality">{stream.resolution ?? '—'}</span>
                  <span className="stremio-stream-text">
                    <strong>{first || stream.name.split('\n')[0]}</strong>
                    <small>
                      {[
                        stream.addon,
                        stream.size,
                        ...rest.map((line) => line.replace(/💾\s*[\d.,]+\s?[GM]B/, '').trim()),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                  {stream.cached !== null && (
                    <span
                      className={`stremio-stream-cache ${stream.cached ? 'ready' : ''}`}
                      title={
                        stream.cached
                          ? 'Debrid önbelleğinde: hemen açılır.'
                          : 'Debrid önce indirmeli: açılması uzun sürebilir ya da açılmayabilir.'
                      }
                    >
                      {stream.cached ? 'Hazır' : 'İndirilecek'}
                    </span>
                  )}
                  <span className="stremio-stream-play" aria-hidden="true">
                    {picking === stream.id ? (
                      <RefreshCw size={16} className="spin" />
                    ) : steer ? (
                      <Play size={16} />
                    ) : (
                      <ListPlus size={16} />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {blocked.length > 0 && !assist && (
        <p className="hall-detail-note">
          {blocked.join(', ')} sunucunun adresini engelliyor; bu kaynakları yalnızca Stremio’yu
          bağlayan kişinin bilgisayarı listeleyebilir.
        </p>
      )}
      {assist && local.error && (
        <p className="hall-detail-note">
          {blocked.join(', ')} bu bilgisayardan da yanıt vermedi: {local.error}
        </p>
      )}
      {!!streams.data?.failedAddons.length && (
        <p className="hall-detail-note">
          Yanıt vermeyen eklenti: {streams.data.failedAddons.join(', ')}
        </p>
      )}
      {!steer && (
        <p className="hall-detail-note">
          {hall.directReason ?? 'Seçtiğin kaynak sıraya önerilir.'}
        </p>
      )}
    </section>
  );
}
