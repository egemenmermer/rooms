import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Maximize,
  Minimize,
  MonitorUp,
  PictureInPicture2,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MediaStage } from './MediaStage';
import { setScreenVolume, stopScreen, useRealtime, watchScreen } from './realtime';
import { uiError } from './i18n';

/** A live window/screen share on the cinema screen. It has no shared playhead: only the local mix. */
export function CinemaShareView({
  trackId,
  participantId,
  fullscreen,
  notify,
  onToggleFullscreen,
}: {
  trackId: string;
  participantId: string;
  fullscreen: boolean;
  notify(message: string): void;
  onToggleFullscreen(): void;
}) {
  const realtime = useRealtime();
  const participant = realtime.participants.find((person) => person.id === participantId);
  const local = participant?.local ?? false;
  const volume = participant?.screenVolume ?? 1;
  const root = useRef<HTMLDivElement>(null),
    idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // Subscribing to the share's video is an optimisation; providers without it still render.
    const watch = (id: string | null) => {
      try {
        watchScreen(id);
      } catch {
        /* Unsupported by this media provider. */
      }
    };
    watch(local ? null : participantId);
    return () => watch(null);
  }, [participantId, local]);
  const reveal = useCallback(() => {
    setVisible(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (!root.current?.querySelector('.cozy-controls')?.contains(document.activeElement))
        setVisible(false);
    }, 2800);
  }, []);
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );
  const changeVolume = (next: number) => {
    try {
      setScreenVolume(participantId, next);
    } catch (error) {
      notify(uiError(error));
    }
  };
  const run = (work: Promise<unknown>) => void work.catch((error) => notify(uiError(error)));
  const name = participant?.name ?? 'Katılımcı';
  return (
    <div
      ref={root}
      className={`cozy-share ${visible ? 'controls-visible' : ''}`}
      onMouseMove={reveal}
      onFocusCapture={reveal}
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest('button,input')) onToggleFullscreen();
      }}
    >
      <MediaStage id={trackId} label={`${name} ekranı`} className="cozy-share-video" />
      <div className="cozy-yt-top">
        <div>
          <strong>{local ? 'Senin ekranın' : `${name} ekranı`}</strong>
          <small>
            <span className="cozy-live-dot" /> Canlı paylaşım
          </small>
        </div>
      </div>
      <div className="cozy-controls">
        <div className="cozy-control-row">
          {local ? (
            <>
              <button
                className="cozy-control wide danger"
                onClick={() => run(stopScreen())}
                title="Paylaşımı herkes için kapatır"
              >
                <Square size={15} fill="currentColor" />
                Paylaşımı durdur
              </button>
              <button
                className="cozy-control wide"
                onClick={() =>
                  run(
                    stopScreen().then(() =>
                      window.dispatchEvent(new Event('rooms:choose-capture')),
                    ),
                  )
                }
              >
                <MonitorUp size={16} />
                Kaynağı değiştir
              </button>
            </>
          ) : (
            <div className="cozy-volume">
              <button
                className="cozy-control"
                aria-label={volume ? 'Yayın sesini kapat' : 'Yayın sesini aç'}
                title="Yalnızca senin için"
                onClick={() => changeVolume(volume ? 0 : 0.8)}
              >
                {volume ? <Volume2 size={19} /> : <VolumeX size={19} />}
              </button>
              <input
                type="range"
                aria-label="Yayın ses düzeyi (yalnızca senin için)"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                style={{ ['--progress' as string]: `${volume * 100}%` }}
                onChange={(event) => changeVolume(Number(event.currentTarget.value))}
              />
            </div>
          )}
          <span className="cozy-grow" />
          <button
            className="cozy-control"
            aria-label="Küçük pencerede aç"
            title={
              document.pictureInPictureEnabled
                ? 'Küçük pencerede aç'
                : 'Bu ortam küçük pencereyi desteklemiyor.'
            }
            disabled={!document.pictureInPictureEnabled}
            onClick={async () => {
              try {
                const video = root.current?.querySelector('video');
                if (document.pictureInPictureElement === video)
                  await document.exitPictureInPicture();
                else await video?.requestPictureInPicture();
              } catch {
                notify('Küçük pencere açılamadı. Yayının yüklenmesini bekle.');
              }
            }}
          >
            <PictureInPicture2 size={18} />
          </button>
          <button
            className="cozy-control"
            aria-label={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
            title={fullscreen ? 'Tam ekrandan çık (F)' : 'Tam ekran (F)'}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
