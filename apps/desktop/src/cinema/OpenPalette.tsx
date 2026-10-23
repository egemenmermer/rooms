import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Film, MonitorPlay, Search, Tv } from 'lucide-react';
import type { CinemaItem } from '../../../../packages/community-cinema/src/types';
import { parseYouTubeVideo, youtubeThumbnail } from '../cinema-youtube';
import { CinemaArt, QualityBadges } from './CinemaArt';
import { rememberItems } from './catalog-cache';
import { activityBridge } from '../runtime-sources';
import { cinemaErrorText, getCinemaBridge } from './cinema-bridge';
import { useGuides, useNow } from './guide-cache';
import { programmeAt } from './hall-model';
import { useHall } from './use-hall';
import { t } from '../i18n';

type Result = { kind: 'item'; item: CinemaItem } | { kind: 'youtube'; videoId: string };

const groups: { kind: CinemaItem['kind']; label: string }[] = [
  { kind: 'live', label: t('Kanallar') },
  { kind: 'movie', label: t('Filmler') },
  { kind: 'series', label: t('Diziler') },
];

/**
 * ⌘K "Aç…": one box for channels, films, series and pasted YouTube links. It opens and closes
 * without animation because people reach for it constantly.
 */
export function OpenPalette({
  onClose,
  onSeries,
}: {
  onClose(): void;
  onSeries(ref: string): void;
}) {
  const hall = useHall();
  const [text, setText] = useState('');
  const [items, setItems] = useState<CinemaItem[]>([]);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const videoId = parseYouTubeVideo(text);

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const query = text.trim();
    if (!query || videoId) {
      setItems([]);
      setSearching(false);
      return;
    }
    let current = true;
    setSearching(true);
    const timer = setTimeout(() => {
      const bridge = getCinemaBridge();
      if (!bridge) return;
      bridge
        .search(hall.hallId, query)
        .then((result) => {
          if (!current) return;
          rememberItems(result);
          setItems(result);
          setError('');
          setActive(0);
        })
        .catch((reason) => current && setError(cinemaErrorText(reason)))
        .finally(() => current && setSearching(false));
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, videoId, hall.hallId]);

  const results: Result[] = useMemo(
    () =>
      videoId
        ? [{ kind: 'youtube', videoId }]
        : groups.flatMap((group) =>
            items
              .filter((item) => item.kind === group.kind)
              .map((item) => ({ kind: 'item' as const, item })),
          ),
    [videoId, items],
  );
  const now = useNow();
  const guides = useGuides(
    hall.hallId,
    items
      .filter((item) => item.kind === 'live' && item.hasGuide)
      .slice(0, 12)
      .map((item) => item.ref),
  );
  const steer = hall.canDirect || !hall.primary;
  const choose = (result: Result | undefined) => {
    if (!result) return;
    if (result.kind === 'youtube') {
      const videoId = result.videoId;
      onClose();
      void (async () => {
        // The public title makes the queue readable; a private or removed video is refused here.
        let details: Awaited<
          ReturnType<NonNullable<ReturnType<typeof activityBridge>['youtubeDetails']>>
        > = null;
        try {
          details = (await activityBridge().youtubeDetails?.(videoId)) ?? null;
        } catch {
          details = null;
        }
        if (details && details.playable === false) {
          hall.notify(t('Bu YouTube videosu gizli ya da kaldırılmış.'));
          return;
        }
        const title = details && details.playable ? details.title : t('YouTube videosu');
        await hall.open({
          kind: 'youtube',
          videoId,
          title: title.trim().slice(0, 240) || t('YouTube videosu'),
        });
      })();
      return;
    }
    if (result.item.kind === 'series') {
      onSeries(result.item.ref);
      onClose();
      return;
    }
    void hall.openItem(result.item);
    onClose();
  };

  return (
    <div className="hall-palette-backdrop instant-overlay" onPointerDown={onClose}>
      <div
        className="hall-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('Salonda aç')}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((value) =>
              results.length
                ? (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
                : 0,
            );
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(results[active]);
          }
        }}
      >
        <label className="hall-palette-input">
          <Search size={18} />
          <input
            ref={input}
            value={text}
            placeholder={t('Kanal, film, dizi ara ya da YouTube bağlantısı yapıştır')}
            aria-label={t('Aranacak içerik')}
            aria-controls="hall-palette-results"
            aria-activedescendant={results[active] ? `hall-palette-${active}` : undefined}
            onChange={(event) => setText(event.target.value)}
          />
          <kbd>esc</kbd>
        </label>
        <div id="hall-palette-results" className="hall-palette-results" role="listbox">
          {!text.trim() && (
            <p className="hall-palette-hint">
              {t('Bir şey yaz: “trt”, “mavi saat” ya da bir YouTube bağlantısı.')}{' '}
              {steer
                ? t('Enter salonda herkes için açar.')
                : t('Kumanda ev sahibinde; Enter sıraya önerir.')}
            </p>
          )}
          {text.trim() && !videoId && !searching && !items.length && !error && (
            <p className="hall-palette-hint">
              {t('“{query}” için sonuç yok.', { query: text.trim() })}
            </p>
          )}
          {error && <p className="hall-palette-hint error">{error}</p>}
          {results.map((result, index) => {
            const first =
              result.kind === 'item' &&
              (index === 0 ||
                (results[index - 1] as Result).kind !== 'item' ||
                (results[index - 1] as { item: CinemaItem }).item.kind !== result.item.kind);
            const onAir =
              result.kind === 'item' && result.item.kind === 'live'
                ? programmeAt(guides[result.item.ref], now)
                : null;
            return (
              <div key={result.kind === 'item' ? result.item.ref : result.videoId}>
                {first && result.kind === 'item' && (
                  <span className="hall-palette-group">
                    {groups.find((group) => group.kind === result.item.kind)?.label}
                  </span>
                )}
                <button
                  id={`hall-palette-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={`hall-palette-row ${index === active ? 'active' : ''}`}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(result)}
                >
                  {result.kind === 'youtube' ? (
                    <>
                      <span className="hall-art wide">
                        <img src={youtubeThumbnail(result.videoId)} alt="" draggable={false} />
                      </span>
                      <span className="hall-palette-text">
                        <strong>
                          <MonitorPlay size={14} /> {t('YouTube videosu')}
                        </strong>
                        <small>{result.videoId}</small>
                      </span>
                    </>
                  ) : (
                    <>
                      <CinemaArt
                        hallId={hall.hallId}
                        art={result.item.art}
                        title={result.item.title}
                        shape={result.item.kind === 'live' ? 'logo' : 'poster'}
                      />
                      <span className="hall-palette-text">
                        <strong>
                          {result.item.kind === 'live' ? <Tv size={14} /> : <Film size={14} />}
                          {result.item.title}
                          <QualityBadges badges={result.item.badges} max={1} />
                        </strong>
                        <small>
                          {onAir
                            ? t('Şimdi: {title}', { title: onAir.title })
                            : result.item.kind === 'live'
                              ? result.item.number !== null
                                ? t('Kanal {number}', { number: result.item.number })
                                : t('Canlı kanal')
                              : [
                                  result.item.year,
                                  result.item.kind === 'series' ? t('Dizi') : t('Film'),
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                        </small>
                      </span>
                    </>
                  )}
                  {index === active && (
                    <span className="hall-palette-action">
                      {result.kind === 'item' && result.item.kind === 'series'
                        ? t('Bölümleri gör')
                        : steer
                          ? t('Salonda aç')
                          : t('Sıraya öner')}
                      <CornerDownLeft size={13} />
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
