import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minimize, Monitor, ExternalLink, X, Volume2 } from 'lucide-react';
import type { MediaTrack, MediaParticipant } from '@rooms/media';
import { uiError } from './i18n';
import './screen-share-gallery.css';
import { RemoteControlActions, RemoteViewerInput } from './RemoteControl';
export function ScreenShareGallery({
  tracks,
  people,
  renderTrack,
  notify,
  initialTrackId,
  onWatch,
  onVolume,
  onClose,
}: {
  onWatch?(participantId: string | null): void;
  onVolume?(participantId: string, volume: number): void;
  onClose?(): void;
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
  const participant = people.find((p) => p.id === active?.participantId);
  const watched = active && !active.local ? active.participantId : null;
  useEffect(() => {
    onWatch?.(watched);
    return () => onWatch?.(null);
  }, [watched, onWatch]);
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
        <RemoteViewerInput track={active} videoRoot={stage} />
        <div className="room-screen-overlay">
          <span>
            <Monitor size={15} />
            {active ? name(active) : 'Paylaşım sona erdi'}
          </span>
          <div>
            {onVolume && active && !active.local && (
              <label className="room-screen-volume">
                <Volume2 size={16} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  aria-label={`${name(active)} yayın sesi`}
                  value={participant?.screenVolume ?? 1}
                  onChange={(event) => onVolume(active.participantId, Number(event.target.value))}
                />
              </label>
            )}
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
            {onClose && (
              <button aria-label="İzlemeyi kapat" onClick={onClose}>
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      <RemoteControlActions track={active} />
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
