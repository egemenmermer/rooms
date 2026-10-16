import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Globe, LoaderCircle, MonitorUp, RotateCcw, SkipForward } from 'lucide-react';
import type { DesktopBridge } from '@rooms/contracts';
import type { ActivityCommand, QueueItem } from '../../../packages/activity-protocol/src';
import { activityBridge } from './runtime-sources';
import { startScreen, stopScreen, useRealtime } from './realtime';
import { uiError } from './i18n';
import { clock } from './cinema-youtube';

type Details = Awaited<ReturnType<NonNullable<DesktopBridge['activity']['youtubeDetails']>>>;
const detailsCache = new Map<string, Promise<Details>>();

/** Public title/embeddability of a video, fetched once per app session. `undefined` while loading. */
export function useYouTubeDetails(videoId: string | null): Details | undefined {
  const [value, setValue] = useState<{ id: string; details: Details } | null>(null);
  useEffect(() => {
    if (!videoId) return;
    let current = true;
    let request = detailsCache.get(videoId);
    if (!request) {
      request = Promise.resolve()
        .then(() => activityBridge().youtubeDetails?.(videoId) ?? null)
        .catch(() => null);
      detailsCache.set(videoId, request);
      // A failed lookup may succeed later; keep only definite answers.
      void request.then((details) => {
        if (!details) detailsCache.delete(videoId);
      });
    }
    void request.then((details) => {
      if (current) setValue({ id: videoId, details });
    });
    return () => {
      current = false;
    };
  }, [videoId]);
  return videoId && value?.id === videoId ? value.details : undefined;
}

type YouTubeItem = QueueItem & { media: { kind: 'youtube'; videoId: string; title: string } };
export type BrowserPhase = 'idle' | 'opening' | 'sharing' | 'not-found' | 'error';
// The share belongs to the queue item, not to a mounted screen, so it survives page changes.
const owned: { itemId: string | null; sourceId: string | null; startedAt: number } = {
  itemId: null,
  sourceId: null,
  startedAt: 0,
};
const attempted = new Set<string>();
// Ads in the browser and the time to open it delay the real end past the video's length.
const END_SLACK_SEC = 15;

/**
 * Shares the user's browser window for a video that YouTube keeps off other sites. Starts by
 * itself only for the person who added the video, follows the queue, and advances at the end.
 */
export function useBrowserVideoShare({
  item,
  browser,
  auto,
  title,
  durationSec,
  quiet,
  notify,
}: {
  item: YouTubeItem | null;
  browser: boolean;
  auto: boolean;
  title: string;
  durationSec: number | null;
  quiet(command: ActivityCommand): void;
  notify(message: string): void;
}) {
  const realtime = useRealtime();
  const itemId = item?.id ?? null;
  const [state, setState] = useState<{ itemId: string | null; phase: BrowserPhase; error: string }>(
    () => ({
      itemId,
      phase: owned.itemId && owned.itemId === itemId ? 'sharing' : 'idle',
      error: '',
    }),
  );
  const phase = state.itemId === itemId ? state.phase : 'idle';
  const stopping = useRef(false),
    advanced = useRef<string | null>(null),
    wasSharing = useRef(realtime.sharing);

  const share = useCallback(async () => {
    if (!item) return;
    const bridge = window.rooms?.media;
    const set = (next: BrowserPhase, error = '') =>
      setState({ itemId: item.id, phase: next, error });
    if (!bridge?.openBrowserVideo) {
      set('error', 'Tarayıcıdan paylaşım yalnızca masaüstü uygulamasında çalışır.');
      return;
    }
    set('opening');
    try {
      const source = await bridge.openBrowserVideo(item.media.videoId, title);
      if (!source) {
        set('not-found');
        return;
      }
      const sharing = realtime.sharing;
      // The same browser window often shows the next video in a new tab; keep that share.
      if (!(sharing && owned.sourceId === source.id)) {
        if (sharing) {
          stopping.current = true;
          await stopScreen().finally(() => (stopping.current = false));
        }
        const status = await bridge.captureStatus().catch(() => null);
        await startScreen(source.id, {
          audio: !!status?.systemAudio,
          quality: '1080p30',
          content: 'motion',
        });
        notify(
          status?.systemAudio
            ? 'Tarayıcı penceresi perdede. Başka sekmeye geçersen o da görünür; YouTube’da otomatik oynatmayı kapatırsan sıradaki videoyu biz açarız.'
            : 'Tarayıcı penceresi perdede, ama bu bilgisayar sistem sesini paylaşamıyor; video sessiz gider.',
        );
      }
      owned.itemId = item.id;
      owned.sourceId = source.id;
      owned.startedAt = Date.now();
      set('sharing');
    } catch (failure) {
      set('error', uiError(failure));
    }
  }, [item, title, realtime.sharing, notify]);

  useEffect(() => {
    if (!item || !browser || !auto || realtime.status !== 'connected' || attempted.has(item.id))
      return;
    attempted.add(item.id);
    void share();
  }, [item, browser, auto, realtime.status, share]);

  // Leaving a browser video: end its share unless the next one continues in the same way.
  useEffect(() => {
    if (!owned.itemId || owned.itemId === itemId || (browser && auto)) return;
    owned.itemId = null;
    owned.sourceId = null;
    if (!realtime.sharing) return;
    stopping.current = true;
    void stopScreen()
      .then(() => notify('Tarayıcıdaki videoyu kapatabilirsin.'))
      .catch(() => {})
      .finally(() => (stopping.current = false));
  }, [itemId, browser, auto, realtime.sharing, notify]);

  // The sharer closing the window or stopping the share means this video is done.
  useEffect(() => {
    const was = wasSharing.current;
    wasSharing.current = realtime.sharing;
    if (!was || realtime.sharing || stopping.current || !itemId || owned.itemId !== itemId) return;
    owned.itemId = null;
    owned.sourceId = null;
    setState({ itemId, phase: 'idle', error: '' });
    if (advanced.current !== itemId) {
      advanced.current = itemId;
      quiet({ type: 'queue.next', fromItemId: itemId, reason: 'ended' });
    }
  }, [realtime.sharing, itemId, quiet]);

  // No player events cross the browser boundary; the video's length decides the end.
  const [, tick] = useState(0);
  useEffect(() => {
    if (phase !== 'sharing' || !durationSec || !itemId) return;
    const timer = setInterval(() => {
      tick((value) => value + 1);
      if (
        owned.itemId === itemId &&
        advanced.current !== itemId &&
        Date.now() - owned.startedAt >= (durationSec + END_SLACK_SEC) * 1000
      ) {
        advanced.current = itemId;
        quiet({ type: 'queue.next', fromItemId: itemId, reason: 'ended' });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, durationSec, itemId, quiet]);

  const remaining =
    phase === 'sharing' && durationSec && owned.itemId === itemId
      ? Math.max(0, durationSec + END_SLACK_SEC - (Date.now() - owned.startedAt) / 1000)
      : null;
  return {
    phase,
    error: state.itemId === itemId ? state.error : '',
    remaining,
    share,
  };
}

/** What the screen shows for a browser-only video until its window share arrives. */
export function CinemaBrowserCard({
  item,
  phase,
  error,
  sharerName,
  mine,
  canShare,
  canSkip,
  skipReason,
  onShare,
  onSkip,
}: {
  item: YouTubeItem;
  phase: BrowserPhase;
  error: string;
  sharerName: string | null;
  mine: boolean;
  canShare: boolean;
  canSkip: boolean;
  skipReason?: string;
  onShare(): void;
  onSkip(): void;
}) {
  const busy = phase === 'opening';
  return (
    <div className="cozy-curtain browser-video" role="status">
      <span className="cozy-curtain-mark">
        <Globe size={28} />
      </span>
      <h3>{item.media.title}</h3>
      <p>
        Bu videonun sahibi YouTube dışında oynatılmasına izin vermiyor. Video tarayıcıda açılıp
        perdeye paylaşılır; herkes buradan izler.
      </p>
      {mine ? (
        busy ? (
          <p className="cozy-browser-step">
            <LoaderCircle size={16} className="spin" />
            Tarayıcında açılıyor, pencere aranıyor…
          </p>
        ) : phase === 'not-found' ? (
          <p className="cozy-add-error">
            Tarayıcı penceresini bulamadım. Video açıldıysa pencereyi kendin seçebilirsin.
          </p>
        ) : phase === 'error' ? (
          <p className="cozy-add-error">{error}</p>
        ) : null
      ) : sharerName ? (
        <p className="cozy-browser-step">
          <LoaderCircle size={16} className="spin" />
          {sharerName} tarayıcısından paylaşacak…
        </p>
      ) : (
        <p className="cozy-muted">Ekleyen kişi ses odasında değil.</p>
      )}
      <div className="button-row">
        {canShare && (mine ? phase !== 'opening' : true) && (
          <button className="button primary" onClick={onShare}>
            {mine && phase !== 'idle' ? <RotateCcw size={16} /> : <MonitorUp size={16} />}
            {mine && phase !== 'idle' ? 'Yeniden dene' : 'Tarayıcımda açıp paylaş'}
          </button>
        )}
        {mine && (phase === 'not-found' || phase === 'error') && (
          <button
            className="button secondary"
            onClick={() => window.dispatchEvent(new Event('rooms:choose-capture'))}
          >
            Pencereyi kendim seçeyim
          </button>
        )}
        <button
          className="button secondary"
          disabled={!canSkip}
          title={canSkip ? undefined : skipReason}
          onClick={onSkip}
        >
          <SkipForward size={16} />
          Sıradakine geç
        </button>
      </div>
      <a
        className="cozy-chip"
        href={`https://www.youtube.com/watch?v=${item.media.videoId}`}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={13} />
        YouTube’da aç
      </a>
    </div>
  );
}

export const remainingLabel = (seconds: number) => `${clock(seconds)} sonra sıradakine geçilir`;
