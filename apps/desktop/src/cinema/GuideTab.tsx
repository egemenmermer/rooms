import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ListPlus, Play, X } from 'lucide-react';
import type { CinemaItem, CinemaProgramme } from '../../../../packages/community-cinema/src/types';
import { CinemaArt } from './CinemaArt';
import { useAllItems } from './catalog-cache';
import { useGuides, useNow } from './guide-cache';
import { dayLabel, hhmm, minutesLabel, timeRange } from './hall-model';
import { useHall } from './use-hall';

const ROW = 64;
const CHANNEL = 205;
const PX_PER_MIN = 4;
const BEFORE_MS = 60 * 60_000;
const SPAN_MS = 14 * 60 * 60_000;
const OVERSCAN = 4;

/** A two-dimensional guide: channels down, time across, only the visible cells rendered. */
export function GuideTab({
  categoryId,
  focusRef,
}: {
  categoryId: string | null;
  focusRef: string | null;
}) {
  const hall = useHall();
  const items = useAllItems(hall.hallId, 'live', categoryId);
  const channels = useMemo(
    () => (items.data?.items ?? []).filter((item) => item.hasGuide),
    [items.data],
  );
  const now = useNow(30_000);
  const [origin] = useState(() => Math.floor((Date.now() - BEFORE_MS) / 1_800_000) * 1_800_000);
  const width = (SPAN_MS / 60_000) * PX_PER_MIN;
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, left: 0, width: 900, height: 500 });
  const [focus, setFocus] = useState<{ ref: string; start: number } | null>(null);
  const x = (ms: number) => ((ms - origin) / 60_000) * PX_PER_MIN;

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () =>
      setView({
        top: element.scrollTop,
        left: element.scrollLeft,
        width: element.clientWidth,
        height: element.clientHeight,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Open on "now", a little to the right of the channel column.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element)
      element.scrollLeft = Math.max(0, ((Date.now() - origin) / 60_000) * PX_PER_MIN - 120);
  }, [origin]);
  useLayoutEffect(() => {
    if (!focusRef || !channels.length) return;
    const index = channels.findIndex((channel) => channel.ref === focusRef);
    const element = scroller.current;
    if (index >= 0 && element) element.scrollTop = Math.max(0, index * ROW - ROW * 2);
  }, [focusRef, channels]);

  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const last = Math.min(channels.length, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  const rows = channels.slice(first, last);
  const guides = useGuides(
    hall.hallId,
    rows.map((row) => row.ref),
  );
  const left = view.left - CHANNEL,
    right = view.left + view.width;
  const slots = useMemo(() => {
    const list: number[] = [];
    for (let t = origin; t < origin + SPAN_MS; t += 1_800_000) list.push(t);
    return list;
  }, [origin]);
  const focused = focus
    ? {
        channel: channels.find((channel) => channel.ref === focus.ref) ?? null,
        programme: guides[focus.ref]?.find((p) => p.start === focus.start) ?? null,
      }
    : null;

  if (items.loading && !items.data)
    return (
      <div className="hall-guide" role="status" aria-label="Rehber yükleniyor">
        <div className="hall-skeleton-list">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="hall-skeleton row" />
          ))}
        </div>
      </div>
    );
  if (!channels.length)
    return (
      <div className="hall-guide empty">
        <p className="hall-empty-note">
          {items.error ??
            'Bu kategoride rehberi olan kanal yok. Sahip ayarlardan bir XMLTV rehberi ekleyebilir.'}
        </p>
      </div>
    );
  return (
    <div className="hall-guide">
      <div className="hall-guide-day">{dayLabel(now)}</div>
      <div
        ref={scroller}
        className="hall-guide-scroll"
        onScroll={(event) => {
          const element = event.currentTarget;
          setView({
            top: element.scrollTop,
            left: element.scrollLeft,
            width: element.clientWidth,
            height: element.clientHeight,
          });
        }}
      >
        <div
          className="hall-guide-canvas"
          style={{ width: CHANNEL + width, height: 34 + channels.length * ROW }}
        >
          <div className="hall-guide-times" style={{ width: CHANNEL + width }}>
            <span className="hall-guide-corner">Bugün</span>
            {slots
              .filter((t) => x(t) + 120 > left && x(t) < right)
              .map((t) => (
                <span
                  key={t}
                  className={`hall-guide-slot ${now >= t && now < t + 1_800_000 ? 'current' : ''}`}
                  style={{ left: CHANNEL + x(t) }}
                >
                  {hhmm(t)}
                </span>
              ))}
          </div>
          <span className="hall-guide-now" style={{ left: CHANNEL + x(now) }} aria-hidden="true" />
          {rows.map((channel, offset) => {
            const top = 34 + (first + offset) * ROW;
            const list = guides[channel.ref];
            return (
              <div key={channel.ref} className="hall-guide-row" style={{ top, height: ROW }}>
                <button
                  className="hall-guide-channel"
                  title={`${channel.title} kanalını aç`}
                  onClick={() => void hall.openItem(channel)}
                >
                  <CinemaArt hallId={hall.hallId} art={channel.art} title={channel.title} />
                  <span>
                    <small>{channel.number ?? ''}</small>
                    <strong>{channel.title}</strong>
                  </span>
                </button>
                {list === undefined && (
                  <span
                    className="hall-guide-loading"
                    style={{ left: CHANNEL + Math.max(0, left) + 12 }}
                  />
                )}
                {list
                  ?.filter((p) => p.stop > origin && x(p.start) < right && x(p.stop) > left)
                  .map((p) => {
                    const start = Math.max(x(p.start), 0);
                    const airing = p.start <= now && p.stop > now;
                    const past = p.stop <= now;
                    const selected = focus?.ref === channel.ref && focus.start === p.start;
                    return (
                      <button
                        key={p.start}
                        className={`hall-guide-cell ${airing ? 'airing' : ''} ${past ? 'past' : ''} ${selected ? 'selected' : ''}`}
                        style={{ left: CHANNEL + start, width: Math.max(8, x(p.stop) - start - 3) }}
                        title={`${p.title} · ${timeRange(p)}`}
                        onClick={() => setFocus({ ref: channel.ref, start: p.start })}
                        onDoubleClick={() => airing && void hall.openItem(channel)}
                      >
                        <strong>{p.start < origin ? `… ${p.title}` : p.title}</strong>
                        <small>{timeRange(p)}</small>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
      {focused?.programme && focused.channel && (
        <ProgrammeDetail
          channel={focused.channel}
          programme={focused.programme}
          now={now}
          onClose={() => setFocus(null)}
        />
      )}
    </div>
  );
}

function ProgrammeDetail({
  channel,
  programme,
  now,
  onClose,
}: {
  channel: CinemaItem;
  programme: CinemaProgramme;
  now: number;
  onClose(): void;
}) {
  const hall = useHall();
  const airing = programme.start <= now && programme.stop > now;
  const future = programme.start > now;
  return (
    <aside className="hall-programme" aria-label={programme.title}>
      <header>
        <CinemaArt hallId={hall.hallId} art={channel.art} title={channel.title} />
        <div>
          <span className={`hall-eyebrow ${airing ? 'live' : ''}`}>
            {airing ? 'Yayında' : future ? 'Yaklaşan' : 'Yayınlandı'} · {channel.title}
          </span>
          <h3>{programme.title}</h3>
          <small>
            {timeRange(programme)} · {minutesLabel(programme.stop - programme.start)}
            {programme.category ? ` · ${programme.category}` : ''}
          </small>
        </div>
        <button className="hall-icon-button" aria-label="Kapat" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {programme.subTitle && <p className="hall-programme-sub">{programme.subTitle}</p>}
      {programme.description && <p>{programme.description}</p>}
      <div className="hall-detail-actions">
        {airing ? (
          <button className="button primary small" onClick={() => void hall.openItem(channel)}>
            {hall.canDirect || !hall.primary ? <Play size={15} /> : <ListPlus size={15} />}
            {hall.canDirect || !hall.primary ? 'Salonda aç' : 'Sıraya öner'}
          </button>
        ) : (
          <p className="hall-detail-note">
            {future
              ? `${hhmm(programme.start)}’da başlıyor. O saatte kanalı salonda açabilirsin.`
              : 'Bu program bitti. Geçmiş yayınlar şimdilik salonda açılamıyor.'}
          </p>
        )}
      </div>
    </aside>
  );
}
