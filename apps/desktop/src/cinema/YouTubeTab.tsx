import { useEffect, useState } from 'react';
import { ListPlus, MonitorPlay, Play } from 'lucide-react';
import type { QueueItem } from '../../../../packages/activity-protocol/src';
import { parseYouTubeVideo, youtubeThumbnail } from '../cinema-youtube';
import { activityBridge } from '../runtime-sources';
import { didThis, paletteShortcut } from './hall-model';
import { useHall } from './use-hall';
import { t } from '../i18n';

type YouTubeQueueItem = QueueItem & { media: { kind: 'youtube'; videoId: string; title: string } };

/** Titles looked up by video id; null when YouTube has none (private, removed, offline). */
const titles = new Map<string, string | null>();
/** Names a queue item got when it was added without a title. */
const PLACEHOLDER = /^YouTube(?: videosu| video| · [\w-]+)?$/;

/** Real titles for the ids, looked up one at a time and remembered for the session. */
function useYouTubeTitles(ids: string[]) {
  const [, setVersion] = useState(0);
  const key = ids
    .filter((id) => !titles.has(id))
    .slice(0, 60)
    .join(',');
  useEffect(() => {
    if (!key) return;
    let live = true;
    void (async () => {
      for (const id of key.split(',')) {
        if (!live) return;
        try {
          const details = await activityBridge().youtubeDetails?.(id);
          titles.set(id, details?.playable ? details.title.trim().slice(0, 240) || null : null);
        } catch {
          titles.set(id, null);
        }
        if (live) setVersion((value) => value + 1);
      }
    })();
    return () => {
      live = false;
    };
  }, [key]);
  return (id: string, fallback: string) =>
    PLACEHOLDER.test(fallback) ? (titles.get(id) ?? fallback) : fallback;
}

/**
 * YouTube in the hall, laid out like Movies and Series: a link field in the header, what
 * plays now, and the hall's YouTube queue as a poster grid. The official embedded player
 * plays whatever is opened.
 */
export function YouTubeTab() {
  const hall = useHall();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const videoId = parseYouTubeVideo(text);
  const steer = hall.canDirect || !hall.primary;
  const all = hall.room?.queue ?? [];
  const queue = all.filter((item): item is YouTubeQueueItem => item.media.kind === 'youtube');
  const currentIndex = all.findIndex((item) => item.id === hall.current?.id);
  const playing = queue.find((item) => item.id === hall.current?.id) ?? null;
  const upcoming = queue.filter((item) => item !== playing && all.indexOf(item) > currentIndex);
  const watched = queue.filter((item) => all.indexOf(item) < currentIndex);
  const title = useYouTubeTitles([
    ...(videoId ? [videoId] : []),
    ...queue.filter((item) => PLACEHOLDER.test(item.media.title)).map((i) => i.media.videoId),
  ]);
  const found = videoId ? titles.get(videoId) : undefined;

  const submit = async () => {
    if (!videoId) {
      setError(t('Bu bir YouTube bağlantısına benzemiyor.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      let name = found ?? null;
      if (found === undefined) {
        try {
          const details = await activityBridge().youtubeDetails?.(videoId);
          if (details && details.playable === false) {
            setError(t('Bu video gizli ya da kaldırılmış.'));
            return;
          }
          if (details?.playable) name = details.title.trim().slice(0, 240) || null;
        } catch {
          // The shared player still opens the video without a title.
        }
      }
      await hall.open({ kind: 'youtube', videoId, title: name ?? t('YouTube videosu') });
      setText('');
    } finally {
      setBusy(false);
    }
  };

  const card = (item: YouTubeQueueItem) => (
    <button
      key={item.id}
      className="hall-poster wide"
      disabled={!hall.canDirect}
      title={hall.canDirect ? t('Şimdi aç') : hall.directReason}
      onClick={() => hall.run({ type: 'queue.select', itemId: item.id, play: true })}
    >
      <span className="hall-poster-frame">
        <span className="hall-art wide">
          <img src={youtubeThumbnail(item.media.videoId)} alt="" draggable={false} />
        </span>
      </span>
      <strong>{title(item.media.videoId, item.media.title)}</strong>
      <small>{didThis(hall.nameOf(item.addedBy), 'add')}</small>
    </button>
  );

  return (
    <div className="hall-vod hall-youtube-tab">
      <header className="hall-grid-head">
        <h2>YouTube</h2>
        <form
          className="hall-youtube-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            value={text}
            placeholder={t('YouTube bağlantısını yapıştır')}
            aria-label={t('YouTube bağlantısı')}
            onChange={(event) => {
              setText(event.target.value);
              setError('');
            }}
          />
          <button className="button primary" disabled={!text.trim() || busy}>
            {steer ? <Play size={16} /> : <ListPlus size={16} />}
            {steer ? t('Salonda aç') : t('Sıraya öner')}
          </button>
        </form>
      </header>
      {error && (
        <p className="hall-form-error" role="alert">
          {error}
        </p>
      )}
      {videoId && !error ? (
        <section className="hall-youtube-feature" aria-label={t('Bulunan video')}>
          <span className="hall-art wide">
            <img src={youtubeThumbnail(videoId)} alt="" draggable={false} />
          </span>
          <div>
            <span className="hall-eyebrow">{t('Bulunan video')}</span>
            <h3>{found === undefined ? t('Başlık aranıyor…') : (found ?? t('YouTube videosu'))}</h3>
            <p>
              {steer
                ? t('Salonda aç’a bas; herkes aynı anda izler.')
                : t('Ev sahibine öneri olarak sıraya eklenir.')}
            </p>
          </div>
        </section>
      ) : (
        playing && (
          <section className="hall-youtube-feature" aria-label={t('Salonda oynuyor')}>
            <span className="hall-art wide">
              <img src={youtubeThumbnail(playing.media.videoId)} alt="" draggable={false} />
            </span>
            <div>
              <span className="hall-eyebrow live">{t('Salonda oynuyor')}</span>
              <h3>{title(playing.media.videoId, playing.media.title)}</h3>
              <p>{didThis(hall.nameOf(playing.addedBy), 'add')}</p>
            </div>
          </section>
        )
      )}
      {upcoming.length > 0 && (
        <section className="hall-youtube-section" aria-label={t('Sırada')}>
          <h3>
            {t('Sırada')} <small>{upcoming.length}</small>
          </h3>
          <div className="hall-poster-grid youtube">{upcoming.map(card)}</div>
        </section>
      )}
      {watched.length > 0 && (
        <section className="hall-youtube-section" aria-label={t('İzlenenler')}>
          <h3>
            {t('İzlenenler')} <small>{watched.length}</small>
          </h3>
          <div className="hall-poster-grid youtube">{watched.map(card)}</div>
        </section>
      )}
      {!queue.length && !videoId && (
        <div className="hall-youtube-empty">
          <MonitorPlay size={26} />
          <p>
            {t('Bir YouTube bağlantısı yapıştır; video salondaki herkes için aynı anda oynar.')}{' '}
            {t('{shortcut} ile de açabilirsin.', { shortcut: paletteShortcut })}
          </p>
        </div>
      )}
    </div>
  );
}
