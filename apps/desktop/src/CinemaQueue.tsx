import { useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eraser,
  Film,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { ActivityCommand, RoomSnapshot } from '../../../packages/activity-protocol/src';
import { musicSearchQuerySchema } from '../../../packages/shared-contracts/src/music';
import { activityBridge } from './runtime-sources';
import { uiError } from './i18n';
import {
  clock,
  looksLikeAddress,
  parseYouTubeVideo,
  queueProgress,
  youtubeThumbnail,
} from './cinema-youtube';

export interface YouTubeChoice {
  videoId: string;
  title: string;
}
type AddMode = 'queue' | 'now';

function searchError(error: unknown) {
  const text = String(error instanceof Error ? error.message : error);
  if (text.includes('MUSIC_JOIN_FIRST'))
    return 'Arama için önce ses odasına katıl. Bağlantı yapıştırmak her zaman çalışır.';
  if (text.includes('MUSIC_PERMISSION_DENIED')) return 'Bu odada arama iznin yok.';
  if (/RATE_LIMITED|429/.test(text)) return 'Kısa sürede çok arama yapıldı. Biraz bekleyip dene.';
  if (/MUSIC_(NOT_CONFIGURED|SEARCH_UNAVAILABLE|SEARCH_BUSY)/.test(text))
    return 'Arama şu anda kullanılamıyor. Bağlantıyı yapıştırarak ekleyebilirsin.';
  return uiError(error);
}

/** Paste a YouTube link (added directly) or type words (searched through the room's DJ search). */
export function YouTubeAddBox({
  channelId,
  disabled,
  disabledReason,
  canStartNow,
  startReason,
  autoFocus = false,
  onAdd,
}: {
  channelId: string | null;
  disabled: boolean;
  disabledReason?: string;
  canStartNow: boolean;
  startReason?: string;
  autoFocus?: boolean;
  onAdd(choice: YouTubeChoice, mode: AddMode): Promise<void>;
}) {
  const [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [results, setResults] = useState<{ id: string; title: string; durationSec: number }[] | null>(
      null,
    );
  const videoId = parseYouTubeVideo(input);
  const query = input.trim();
  const searchable =
    !videoId &&
    !looksLikeAddress(query) &&
    musicSearchQuerySchema.safeParse(query).success &&
    !!window.rooms?.music?.search;
  const add = async (choice: YouTubeChoice, mode: AddMode) => {
    setBusy(true);
    setError('');
    try {
      await onAdd(choice, mode);
      setInput('');
      setResults(null);
    } catch (failure) {
      setError(uiError(failure));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (mode: AddMode) => {
    if (busy || disabled) return;
    if (videoId) {
      setBusy(true);
      setError('');
      const details = await Promise.race([
        activityBridge()
          .youtubeDetails?.(videoId)
          .catch(() => null) ?? Promise.resolve(null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6500)),
      ]);
      setBusy(false);
      if (details && !details.playable) {
        setError(
          'Bu video başka uygulamalarda oynatılamıyor (gizli, kaldırılmış ya da sahibi izin vermiyor).',
        );
        return;
      }
      await add({ videoId, title: details?.title || 'YouTube videosu' }, mode);
      return;
    }
    if (!query) return;
    if (!searchable) {
      setError(
        looksLikeAddress(query)
          ? 'Bu bir YouTube video bağlantısı değil. Video sayfasının bağlantısını yapıştır.'
          : window.rooms?.music?.search
            ? 'Aramak için en az 2 karakter yaz.'
            : 'Arama yalnızca masaüstü uygulamasında çalışır. Bağlantı yapıştırabilirsin.',
      );
      return;
    }
    if (!channelId) {
      setError('Arama için önce bir ses odasına katıl.');
      return;
    }
    setBusy(true);
    setError('');
    setResults(null);
    try {
      setResults(await window.rooms!.music.search(channelId, query));
    } catch (failure) {
      setError(searchError(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cozy-add">
      <form
        className="cozy-add-row"
        onSubmit={(event) => {
          event.preventDefault();
          void submit('queue');
        }}
      >
        <label>
          {videoId || !query ? <Plus size={17} /> : <Search size={17} />}
          <input
            aria-label="YouTube bağlantısı veya arama"
            placeholder="YouTube bağlantısı yapıştır ya da ara"
            value={input}
            autoFocus={autoFocus}
            maxLength={2048}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            onChange={(event) => {
              setInput(event.target.value);
              setError('');
              if (!event.target.value.trim()) setResults(null);
            }}
          />
        </label>
        <button
          className="button primary"
          disabled={disabled || busy || !query}
          title={disabled ? disabledReason : undefined}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : null}
          {videoId ? 'Sıraya ekle' : 'Ara'}
        </button>
        {videoId && (
          <button
            type="button"
            className="button secondary"
            disabled={disabled || busy || !canStartNow}
            title={!canStartNow ? startReason : 'Şu an oynayanın yerine hemen aç'}
            onClick={() => void submit('now')}
          >
            <Play size={15} />
            Şimdi aç
          </button>
        )}
      </form>
      {error && (
        <p className="cozy-add-error" role="alert">
          {error}
        </p>
      )}
      {results && (
        <div className="cozy-results" role="region" aria-label="YouTube arama sonuçları">
          {!results.length && <p className="cozy-muted">Sonuç bulunamadı.</p>}
          {results.map((result) => (
            <div className="cozy-result" key={result.id}>
              <img src={youtubeThumbnail(result.id)} alt="" loading="lazy" draggable={false} />
              <div>
                <strong>{result.title}</strong>
                <small>{result.durationSec ? clock(result.durationSec) : 'YouTube'}</small>
              </div>
              <button
                className="cozy-icon"
                aria-label={`${result.title} sıraya ekle`}
                title="Sıraya ekle"
                disabled={busy || disabled}
                onClick={() => void add({ videoId: result.id, title: result.title }, 'queue')}
              >
                <Plus size={17} />
              </button>
              <button
                className="cozy-icon"
                aria-label={`${result.title} şimdi aç`}
                title={!canStartNow ? startReason : 'Şimdi aç'}
                disabled={busy || disabled || !canStartNow}
                onClick={() => void add({ videoId: result.id, title: result.title }, 'now')}
              >
                <Play size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The shared queue: everyone may suggest; playing order follows the session's control setting. */
export function CinemaQueue({
  room,
  me,
  canDirect,
  canSuggest,
  directReason,
  busy,
  nameOf,
  run,
  onClose,
  addBox,
}: {
  room: RoomSnapshot | null;
  me: string | null;
  canDirect: boolean;
  canSuggest: boolean;
  directReason: string;
  busy: boolean;
  nameOf(userId: string): string;
  run(command: ActivityCommand): void;
  onClose(): void;
  addBox: ReactNode;
}) {
  const queue = room?.queue ?? [];
  const { current, watched } = queueProgress(room);
  const why = canDirect ? undefined : directReason;
  const move = (index: number, direction: number) => {
    const ids = queue.map((item) => item.id),
      other = index + direction;
    if (
      other < 0 ||
      other >= ids.length ||
      ids[index] === current?.id ||
      ids[other] === current?.id
    )
      return;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    run({ type: 'queue.reorder', itemIds: ids });
  };
  return (
    <aside className="cozy-queue" aria-label="Ortak sıra">
      <div className="cozy-queue-head">
        <h3>
          Sıradakiler <span>{queue.length}</span>
        </h3>
        <button className="cozy-icon" aria-label="Sırayı gizle" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      {addBox}
      <ol className="cozy-queue-list">
        {queue.map((item, index) => {
          const playing = item.id === current?.id;
          const done = watched.some((value) => value.id === item.id);
          const own = item.addedBy === me;
          return (
            <li
              key={item.id}
              className={`cozy-queue-item ${playing ? 'playing' : ''} ${done ? 'watched' : ''}`}
            >
              <button
                className="cozy-queue-open"
                disabled={!canDirect || busy || playing}
                title={playing ? 'Şu an oynuyor' : (why ?? 'Şimdi aç')}
                onClick={() => run({ type: 'queue.select', itemId: item.id, play: true })}
              >
                <span className="cozy-queue-thumb">
                  {item.media.kind === 'youtube' ? (
                    <img
                      src={youtubeThumbnail(item.media.videoId)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <Film size={20} />
                  )}
                  {playing ? (
                    <span className="cozy-eq" aria-label="Şu an oynuyor">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <span className="cozy-queue-play">
                      <Play size={16} fill="currentColor" />
                    </span>
                  )}
                </span>
                <span className="cozy-queue-text">
                  <strong>{item.media.title}</strong>
                  <small>
                    {playing ? 'Şimdi · ' : done ? 'İzlendi · ' : `${index + 1}. · `}
                    {own ? 'sen ekledin' : `${nameOf(item.addedBy)} ekledi`}
                  </small>
                </span>
              </button>
              <span className="cozy-queue-actions">
                <button
                  className="cozy-icon"
                  aria-label={`${item.media.title} yukarı taşı`}
                  title={why}
                  disabled={
                    !canDirect ||
                    busy ||
                    index === 0 ||
                    playing ||
                    queue[index - 1]?.id === current?.id
                  }
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="cozy-icon"
                  aria-label={`${item.media.title} aşağı taşı`}
                  title={why}
                  disabled={
                    !canDirect ||
                    busy ||
                    index === queue.length - 1 ||
                    playing ||
                    queue[index + 1]?.id === current?.id
                  }
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="cozy-icon"
                  aria-label={`${item.media.title} sıradan kaldır`}
                  title={playing ? 'Oynayan video kaldırılamaz' : own ? undefined : why}
                  disabled={(!canDirect && !(own && canSuggest)) || busy || playing}
                  onClick={() => run({ type: 'queue.remove', itemId: item.id })}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {!queue.length && (
        <p className="cozy-muted cozy-queue-empty">
          Sıra boş. Bir bağlantı yapıştır; video bitince sıradaki kendiliğinden başlar.
        </p>
      )}
      {watched.length > 0 && (
        <button
          className="button ghost small cozy-queue-clear"
          disabled={!canDirect || busy}
          title={why}
          onClick={() => {
            for (const item of watched) run({ type: 'queue.remove', itemId: item.id });
          }}
        >
          <Eraser size={14} />
          İzlenenleri temizle ({watched.length})
        </button>
      )}
    </aside>
  );
}
