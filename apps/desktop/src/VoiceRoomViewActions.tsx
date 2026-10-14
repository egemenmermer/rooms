import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Maximize, Minimize, ExternalLink } from 'lucide-react';
import { IconButton } from '@rooms/design';
import { useRealtime } from './realtime';
import { uiError } from './i18n';
export function VoiceRoomViewActions({ notify }: { notify(message: string): void }) {
  const location = useLocation();
  const r = useRealtime(),
    [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const hasVideo = r.tracks.some((t) => t.kind === 'video' && !t.muted),
    pip = Boolean(document.pictureInPictureEnabled) && hasVideo;
  const separate = async () => {
    const video =
      document.querySelector<HTMLVideoElement>('.room-screen-focus video') ??
      document.querySelector<HTMLVideoElement>('.discord-voice-page video');
    if (!video || video.readyState < 2) throw new Error('Video henüz hazır değil.');
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  };
  const run = (task: Promise<unknown>) => void task.catch((e) => notify(uiError(e)));
  if (new URLSearchParams(location.search).get('view') === 'share') return null;
  return (
    <div className="room-view-actions">
      <IconButton
        label="Videoyu ayrı pencerede aç"
        disabled={!pip}
        title={!pip ? 'Bir kamera veya ekran paylaşımı videosu gerekli.' : undefined}
        onClick={() => run(separate())}
      >
        <ExternalLink size={19} />
      </IconButton>
      <IconButton
        label={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
        disabled={!document.fullscreenEnabled}
        onClick={() =>
          run(
            fullscreen
              ? document.exitFullscreen()
              : (
                  document.querySelector<HTMLElement>('.room-screen-focus') ??
                  document.documentElement
                ).requestFullscreen(),
          )
        }
      >
        {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
      </IconButton>
    </div>
  );
}
