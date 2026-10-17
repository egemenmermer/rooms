import { useState } from 'react';
import { ListPlus, MonitorPlay, Play } from 'lucide-react';
import { parseYouTubeVideo, youtubeThumbnail } from '../cinema-youtube';
import { activityBridge } from '../runtime-sources';
import { didThis, paletteShortcut } from './hall-model';
import { useHall } from './use-hall';

/** Paste a YouTube link to watch it in the hall; the official embedded player plays it. */
export function YouTubeTab() {
  const hall = useHall();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const videoId = parseYouTubeVideo(text);
  const steer = hall.canDirect || !hall.primary;
  const recent = (hall.room?.queue ?? []).filter((item) => item.media.kind === 'youtube');
  const submit = async () => {
    if (!videoId) {
      setError('Bu bir YouTube bağlantısına benzemiyor.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let title = 'YouTube videosu';
      try {
        const details = await activityBridge().youtubeDetails?.(videoId);
        if (details && details.playable === false) {
          setError('Bu video gizli ya da kaldırılmış.');
          return;
        }
        if (details?.playable) title = details.title.trim().slice(0, 240) || title;
      } catch {
        // The title is a convenience; the shared player still opens the video.
      }
      await hall.open({ kind: 'youtube', videoId, title });
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="hall-youtube-tab">
      <section className="hall-youtube-card">
        <span className="hall-youtube-icon">
          <MonitorPlay size={22} />
        </span>
        <div>
          <h2>YouTube’dan bir şey aç</h2>
          <p>
            Bağlantıyı yapıştır; video salondaki herkes için aynı anda oynar. Arama için{' '}
            {paletteShortcut} kısayolunu da kullanabilirsin.
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
          {videoId && !error && (
            <div className="hall-youtube-preview">
              <img src={youtubeThumbnail(videoId)} alt="" draggable={false} />
              <span>Video bulundu · {videoId}</span>
            </div>
          )}
          {error && (
            <p className="hall-form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      {recent.length > 0 && (
        <section className="hall-row">
          <header>
            <h3>Sıradaki YouTube videoları</h3>
          </header>
          <div className="hall-row-track">
            {recent.map((item) =>
              item.media.kind === 'youtube' ? (
                <button
                  key={item.id}
                  className="hall-poster wide"
                  disabled={!hall.canDirect || item.id === hall.current?.id}
                  title={hall.canDirect ? 'Şimdi aç' : hall.directReason}
                  onClick={() => hall.run({ type: 'queue.select', itemId: item.id, play: true })}
                >
                  <span className="hall-poster-frame">
                    <span className="hall-art wide">
                      <img src={youtubeThumbnail(item.media.videoId)} alt="" draggable={false} />
                    </span>
                  </span>
                  <strong>{item.media.title}</strong>
                  <small>{didThis(hall.nameOf(item.addedBy), 'ekledi')}</small>
                </button>
              ) : null,
            )}
          </div>
        </section>
      )}
    </div>
  );
}
