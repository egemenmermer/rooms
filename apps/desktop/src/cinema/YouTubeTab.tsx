import { useEffect, useState } from 'react';
import { ListPlus, Play } from 'lucide-react';
import { parseYouTubeVideo, youtubeThumbnail } from '../cinema-youtube';
import { activityBridge } from '../runtime-sources';
import { didThis, paletteShortcut } from './hall-model';
import { useHall } from './use-hall';

type Preview = { videoId: string; title: string | null; playable: boolean };

/**
 * YouTube in the hall, laid out like Movies and Series: a hero to paste a link into
 * (it shows the video once the link is recognized) and a row of the hall's YouTube queue.
 * The official embedded player plays whatever is opened.
 */
export function YouTubeTab() {
  const hall = useHall();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const videoId = parseYouTubeVideo(text);
  const steer = hall.canDirect || !hall.primary;
  const queue = (hall.room?.queue ?? []).flatMap((item) =>
    item.media.kind === 'youtube' ? [{ ...item, media: item.media }] : [],
  );
  const current = hall.current?.media.kind === 'youtube' ? hall.current.media : null;

  // Look the pasted video up once the link stops changing; the title is a convenience.
  useEffect(() => {
    if (!videoId) return;
    let live = true;
    const timer = setTimeout(() => {
      void Promise.resolve(activityBridge().youtubeDetails?.(videoId))
        .then((details) => {
          if (!live) return;
          setPreview({
            videoId,
            title: details?.playable ? details.title.trim().slice(0, 240) || null : null,
            playable: details?.playable !== false,
          });
        })
        .catch(() => live && setPreview({ videoId, title: null, playable: true }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [videoId]);
  const found = videoId && preview?.videoId === videoId ? preview : null;

  const submit = async () => {
    if (!videoId) {
      setError('Bu bir YouTube bağlantısına benzemiyor.');
      return;
    }
    if (found && !found.playable) {
      setError('Bu video gizli ya da kaldırılmış.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let title = found?.title ?? null;
      if (!found) {
        try {
          const details = await activityBridge().youtubeDetails?.(videoId);
          if (details && details.playable === false) {
            setError('Bu video gizli ya da kaldırılmış.');
            return;
          }
          if (details?.playable) title = details.title.trim().slice(0, 240) || null;
        } catch {
          // The shared player still opens the video without a title.
        }
      }
      await hall.open({ kind: 'youtube', videoId, title: title ?? 'YouTube videosu' });
      setText('');
    } finally {
      setBusy(false);
    }
  };

  const backdrop = videoId ?? current?.videoId ?? queue[0]?.media.videoId ?? null;
  return (
    <div className="hall-vod hall-youtube-tab">
      <section className={`hall-hero youtube ${backdrop ? '' : 'blank'}`} aria-label="YouTube">
        {backdrop && (
          <img
            key={backdrop}
            className="hall-hero-backdrop"
            src={youtubeThumbnail(backdrop, 'hq')}
            alt=""
            draggable={false}
          />
        )}
        <div className="hall-hero-shade" />
        <div className="hall-hero-text">
          <span className="hall-eyebrow">
            {videoId ? 'Bulunan video' : current ? 'Salonda oynuyor' : 'YouTube'}
          </span>
          <h2>
            {videoId
              ? (found?.title ?? 'YouTube videosu')
              : (current?.title ?? 'YouTube’dan bir şey aç')}
          </h2>
          <p>
            Bağlantıyı yapıştır; video salondaki herkes için aynı anda oynar. {paletteShortcut} ile
            de açabilirsin.
          </p>
          <form
            className="hall-youtube-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              value={text}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label="YouTube bağlantısı"
              onChange={(event) => {
                setText(event.target.value);
                setError('');
              }}
            />
            <button className="button primary" disabled={!text.trim() || busy}>
              {steer ? <Play size={16} /> : <ListPlus size={16} />}
              {steer ? 'Salonda aç' : 'Sıraya öner'}
            </button>
          </form>
          {error && (
            <p className="hall-form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      {queue.length > 0 && (
        <section className="hall-row" aria-label="Salonun YouTube sırası">
          <header>
            <h3>
              Salonun YouTube sırası
              <small>{queue.length}</small>
            </h3>
          </header>
          <div className="hall-row-track">
            {queue.map((item) => (
              <button
                key={item.id}
                className="hall-poster wide"
                disabled={!hall.canDirect || item.id === hall.current?.id}
                title={
                  item.id === hall.current?.id
                    ? 'Salonda oynuyor'
                    : hall.canDirect
                      ? 'Şimdi aç'
                      : hall.directReason
                }
                onClick={() => hall.run({ type: 'queue.select', itemId: item.id, play: true })}
              >
                <span className="hall-poster-frame">
                  <span className="hall-art wide">
                    <img src={youtubeThumbnail(item.media.videoId)} alt="" draggable={false} />
                  </span>
                  {item.id === hall.current?.id && <span className="hall-new-badge">Oynuyor</span>}
                </span>
                <strong>{item.media.title}</strong>
                <small>{didThis(hall.nameOf(item.addedBy), 'ekledi')}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
