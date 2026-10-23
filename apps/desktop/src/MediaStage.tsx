import { useEffect, useRef, useState } from 'react';
import { attachMediaTrack } from './realtime';
import { t } from './i18n';

/** Presentation observes the track; it never creates or disconnects a media room. */
export function MediaStage({
  id,
  label,
  className = 'screen-stage',
}: {
  id: string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState({ id, phase: 'loading' as 'loading' | 'ready' | 'error' });
  const phase = status.id === id ? status.phase : 'loading';
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let active = true;
    let frame: number | undefined;
    let detach: (() => void) | undefined;
    const ready = () => {
      if (active) setStatus({ id, phase: 'ready' });
    };
    const failed = () => {
      if (active) setStatus({ id, phase: 'error' });
    };
    const loaded = () => {
      if (typeof video.requestVideoFrameCallback !== 'function') ready();
    };
    setStatus({ id, phase: 'loading' });
    video.addEventListener('loadeddata', loaded);
    video.addEventListener('error', failed);
    try {
      detach = attachMediaTrack(id, video);
      // Confirm pixels, not merely a subscription or play() promise.
      if (typeof video.requestVideoFrameCallback === 'function')
        frame = video.requestVideoFrameCallback(ready);
      else if (video.readyState >= 2) ready();
    } catch {
      failed();
    }
    return () => {
      active = false;
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
      video.removeEventListener('loadeddata', loaded);
      video.removeEventListener('error', failed);
      detach?.();
    };
  }, [id]);
  return (
    <>
      <video
        ref={ref}
        aria-label={label}
        aria-busy={phase === 'loading'}
        autoPlay
        playsInline
        muted
        className={className}
      />
      {phase !== 'ready' && (
        <span
          className={`media-stage-status ${phase === 'error' ? 'error' : ''}`}
          role={phase === 'error' ? 'alert' : 'status'}
        >
          {phase === 'error'
            ? t('Yayın açılamadı veya sona erdi.')
            : t('Yayın görüntüsü bekleniyor…')}
        </span>
      )}
    </>
  );
}
