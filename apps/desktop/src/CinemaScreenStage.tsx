import { useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '@rooms/design';
import { MediaStage } from './RealSocial';
import { ReferenceIcon } from './ReferenceIcon';
import { setScreenVolume, watchScreen, useRealtime } from './realtime';
import { uiError } from './i18n';

/** A captured stream has no independent room playhead. Control only the local view/mix. */
export function CinemaScreenStage({
  trackId,
  participantId,
  notify,
}: {
  trackId: string;
  participantId: string;
  notify(message: string): void;
}) {
  const realtime = useRealtime();
  const participant = realtime.participants.find((person) => person.id === participantId);
  const stage = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fullscreen, setFullscreen] = useState(false),
    [visible, setVisible] = useState(true);
  const volume = participant?.screenVolume ?? 1;
  const local = participant?.local ?? false;
  useEffect(() => {
    watchScreen(local ? null : participantId);
    return () => watchScreen(null);
  }, [participantId, local]);
  const reveal = useCallback(() => {
    setVisible(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (!stage.current?.contains(document.activeElement)) setVisible(false);
    }, 2800);
  }, []);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      if (idle.current) clearTimeout(idle.current);
    };
  }, []);
  const expand = async () => {
    try {
      if (document.fullscreenElement === stage.current) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch (error) {
      notify(uiError(error));
    }
  };
  const changeVolume = (next: number) => {
    try {
      setScreenVolume(participantId, next);
    } catch (error) {
      notify(uiError(error));
    }
  };
  return (
    <div
      ref={stage}
      className={`reference-cinema-screen-stage cinema-share-player ${visible ? 'controls-visible' : ''}`}
      onMouseMove={reveal}
      onFocusCapture={reveal}
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest('button,input')) void expand();
      }}
    >
      {realtime.tracks.find((track) => track.id === trackId)?.subscribed === false ? (
        <p className="room-screen-waiting" role="status">
          Yayın açılıyor…
        </p>
      ) : (
        <MediaStage
          id={trackId}
          label={`${participant?.name ?? 'Katılımcı'} ekranı`}
          className="reference-cinema-screen-video"
        />
      )}
      <div className="cinema-share-stage-top">
        <span>
          <ReferenceIcon name="monitor" size={15} />
          {local ? 'Senin ekranın' : `${participant?.name ?? 'Katılımcı'} ekranı`}
        </span>
        <span className="reference-cinema-voice-pill">
          <ReferenceIcon name="monitor" size={13} />
          Canlı paylaşım
        </span>
      </div>
      <div className="cinema-share-player-controls">
        <span className="cinema-share-stream-label">
          <ReferenceIcon name="monitor" size={16} />
          Ekran paylaşımı
        </span>
        <div className="cinema-share-volume">
          <IconButton
            label={volume ? 'Yayın sesini kapat' : 'Yayın sesini aç'}
            disabled={local}
            title={
              local
                ? 'Kendi paylaşımının sesi bu cihazda geri çalınmaz.'
                : 'Yalnızca izlediğin yayının sesini değiştirir.'
            }
            onClick={() => changeVolume(volume ? 0 : 0.8)}
          >
            <ReferenceIcon name={volume ? 'volume' : 'volume-off'} size={18} />
          </IconButton>
          <input
            type="range"
            aria-label="Yayın ses düzeyi"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            disabled={local}
            title={
              local
                ? 'Kendi paylaşımın yerel geri çalma yapmaz.'
                : 'Konuşma ve DJ sesini değiştirmez.'
            }
            onChange={(event) => changeVolume(Number(event.target.value))}
          />
        </div>
        <span className="cinema-share-control-grow" />
        <IconButton
          label="Paylaşımı küçük pencerede aç"
          disabled={!document.pictureInPictureEnabled}
          title={
            !document.pictureInPictureEnabled
              ? 'Bu ortam resim içinde resim desteklemiyor.'
              : undefined
          }
          onClick={async () => {
            try {
              const video = stage.current?.querySelector('video');
              if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
              else await video?.requestPictureInPicture();
            } catch {
              notify('Küçük pencere açılamadı. Paylaşımın yüklenmesini bekle.');
            }
          }}
        >
          <ReferenceIcon name="cast" size={18} />
        </IconButton>
        <IconButton
          label={fullscreen ? 'Tam ekrandan çık' : 'Paylaşımı tam ekran aç'}
          onClick={() => void expand()}
        >
          <ReferenceIcon name="expand" size={18} />
        </IconButton>
      </div>
    </div>
  );
}
