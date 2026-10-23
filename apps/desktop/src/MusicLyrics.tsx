import { useEffect, useRef, useState } from 'react';
import type { MusicLyrics as Lyrics } from '../../../packages/shared-contracts/src/music-lyrics';
import { t } from './i18n';
export function MusicLyrics({
  channelId,
  trackId,
  position,
  playing,
  receivedAt,
}: {
  channelId: string;
  trackId: string;
  position: number;
  playing: boolean;
  receivedAt: number;
}) {
  const [open, setOpen] = useState(false),
    [result, setResult] = useState<Lyrics | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [now, setNow] = useState(Date.now());
  const activeLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setResult(null);
    setFailed(false);
    void window
      .rooms!.music.lyrics(channelId, trackId)
      .then((value) => {
        if (alive) setResult(value);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, channelId, trackId, attempt]);
  useEffect(() => {
    if (!open || !playing) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [open, playing]);
  const time = position + (playing ? Math.min(6, Math.max(0, (now - receivedAt) / 1000)) : 0);
  const index =
    result?.status === 'found' ? result.lines.findLastIndex((line) => line.time <= time) : -1;
  useEffect(() => {
    if (open) activeLine.current?.scrollIntoView?.({ block: 'nearest' });
  }, [index, open]);
  return (
    <section className="dj-lyrics">
      <button
        aria-expanded={open}
        disabled={!window.rooms?.music.lyrics}
        title={
          !window.rooms?.music.lyrics
            ? t('Şarkı sözleri için güncel masaüstü uygulaması gerekiyor.')
            : undefined
        }
        onClick={() => setOpen(!open)}
      >
        {t('Şarkı sözleri')}
      </button>
      {!open && <small>{t('Açınca şarkı adı ve süresi LRCLIB ile paylaşılır.')}</small>}
      {open &&
        (failed ? (
          <p role="alert">
            {t('Şarkı sözleri alınamadı.')}{' '}
            <button onClick={() => setAttempt(attempt + 1)}>{t('Yeniden dene')}</button>
          </p>
        ) : !result ? (
          <p role="status">{t('Şarkı sözleri yükleniyor…')}</p>
        ) : result.status === 'unavailable' ? (
          <p>{t('Bu kayıt için zamanlı şarkı sözü bulunamadı.')}</p>
        ) : result.status === 'instrumental' ? (
          <p>{t('Bu kayıt enstrümantal olarak işaretlenmiş.')}</p>
        ) : (
          <>
            <small>{t('LRCLIB · Şarkıyla birlikte ilerler')}</small>
            <div className="dj-lyrics-lines" aria-label={t('Şarkı sözleri')}>
              {result.lines.map((line, i) => (
                <p
                  key={i}
                  ref={i === index ? activeLine : undefined}
                  aria-current={i === index ? 'true' : undefined}
                >
                  {line.text || '♪'}
                </p>
              ))}
            </div>
          </>
        ))}
    </section>
  );
}
