import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minimize, Monitor, ExternalLink } from 'lucide-react';
import type { MediaTrack, MediaParticipant } from '@rooms/media';
import { uiError } from './i18n';
import './screen-share-gallery.css';
export function ScreenShareGallery({
  tracks,
  people,
  renderTrack,
  notify,
  initialTrackId,
}: {
  initialTrackId?: string;
  tracks: MediaTrack[];
  people: MediaParticipant[];
  renderTrack(id: string, label: string): ReactNode;
  notify(message: string): void;
}) {
  const [selected, setSelected] = useState<string | null>(initialTrackId ?? null),
    [fullscreen, setFullscreen] = useState(false),
    stage = useRef<HTMLDivElement>(null);
  useEffect(() => setSelected(initialTrackId ?? null), [initialTrackId]);
  const active = tracks.find((t) => t.id === selected) ?? tracks[0];
  const name = (track: MediaTrack) =>
    `${people.find((p) => p.id === track.participantId)?.name ?? 'Katılımcı'}${track.local ? ' (sen)' : ''}`;
  useEffect(() => {
    const node = stage.current;
    const changed = () => setFullscreen(document.fullscreenElement === node);
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement === node) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const separate = () => {
    const video = stage.current?.querySelector('video');
    if (!video || video.readyState < 2) {
      notify('Video henüz hazır değil.');
      return;
    }
    void (
      document.pictureInPictureElement
        ? document.exitPictureInPicture()
        : video.requestPictureInPicture()
    ).catch((e) => notify(uiError(e)));
  };
  const maximize = () => {
    const node = stage.current;
    if (!node) return;
    void (
      document.fullscreenElement === node ? document.exitFullscreen() : node.requestFullscreen()
    ).catch((e) => notify(uiError(e)));
  };
  return (
    <div className="room-screen-gallery">
      <div ref={stage} className="room-screen-focus" data-screen-focus>
        {active && renderTrack(active.id, `${name(active)} ekranı`)}
        <div className="room-screen-overlay">
          <span>
            <Monitor size={15} />
            {active ? name(active) : 'Paylaşım sona erdi'}
          </span>
          <div>
            <button
              aria-label="Paylaşımı ayrı pencerede izle"
              disabled={!active || !document.pictureInPictureEnabled}
              onClick={separate}
            >
              <ExternalLink size={18} />
            </button>
            <button
              aria-label={fullscreen ? 'Paylaşımı tam ekrandan çıkar' : 'Paylaşımı tam ekran izle'}
              disabled={!active || !document.fullscreenEnabled}
              onClick={maximize}
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
      {tracks.length > 1 && (
        <div className="room-screen-thumbnails" aria-label="Paylaşılan ekranlar">
          {tracks.map((track) => (
            <button
              key={track.id}
              aria-pressed={active?.id === track.id}
              aria-label={`${name(track)} ekranını büyüt`}
              onClick={() => setSelected(track.id)}
            >
              {renderTrack(track.id, `${name(track)} küçük önizleme`)}
              <span>
                <Monitor size={13} />
                {name(track)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
