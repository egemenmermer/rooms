import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  CalendarCheck,
  Check,
  Eye,
  Heart,
  ListPlus,
  Play,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react';
import { Modal } from '@rooms/design';
import {
  RMDB_REVIEW_MAX,
  type RmdbDiaryEntry,
  type RmdbPerson,
  type RmdbProgress,
  type RmdbRating,
  type RmdbReview,
  type RmdbReviewInput,
  type RmdbWorkDetails,
} from '../../../../packages/community-cinema/src/types';
import { useCommunity } from '../community';
import { VoiceAvatar } from '../VoiceAvatar';
import { cinemaErrorText } from './cinema-bridge';
import { hhmm, isHallItem, minutesLabel } from './hall-model';
import {
  averageText,
  clock,
  dateInputValue,
  dateLabel,
  diaryPosition,
  emptyReview,
  episodeLong,
  episodeShort,
  noResumeNote,
  peopleText,
  progressShare,
  ratingHistogram,
  resumeAction,
  reviewInputOf,
  rewatches,
  seasonsOf,
  starsLabel,
  unfinished,
  watchedAtFromInput,
  withMyReview,
  withWatchlist,
} from './rmdb-model';
import { mutateRmdbWork, removeFromRmdb, useRmdbWork } from './rmdb-store';
import { HeartButton, StarPicker, Stars } from './RmdbStars';
import { useHall } from './use-hall';
import { Credits, DetailsHead, VodSkeleton } from './VodTab';
import { getLocale, locale, t } from '../i18n';

/** The signed-in member as RMDB names them. */
function useMe(): RmdbPerson | null {
  const user = useCommunity((state) => state.user);
  return user ? { userId: user.id, name: user.displayName || user.username } : null;
}

/** A confirmation that a second click within a few seconds completes. */
function useSecondClick() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return [armed, setArmed] as const;
}

/** The heart, shared by the actions and the review editor: it saves at once. */
function useHeart(details: RmdbWorkDetails) {
  const hall = useHall();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (!me) return;
    const own = details.reviews.find((review) => review.author.userId === me.userId);
    const input = { ...reviewInputOf(own), liked: !details.mine.liked };
    const next = emptyReview(input) ? null : input;
    setBusy(true);
    try {
      await mutateRmdbWork(
        hall.hallId,
        details.id,
        (value) => withMyReview(value, me, next, Date.now()),
        (bridge) => bridge.rmdbReview(hall.hallId, details.id, next),
      );
    } catch (error) {
      hall.notify(cinemaErrorText(error));
    } finally {
      setBusy(false);
    }
  };
  return { liked: details.mine.liked, busy, toggle: () => void toggle() };
}

/** One RMDB work: what it is, where the hall stopped, the members' ratings, reviews and diary. */
export function RmdbDetails({
  workId,
  backLabel,
  onBack,
}: {
  workId: string;
  backLabel: string;
  onBack(): void;
}) {
  const hall = useHall();
  const { details, error, gone, reload } = useRmdbWork(hall.hallId, workId);
  const back = (
    <button className="hall-text-button hall-back" onClick={onBack}>
      <ArrowLeft size={15} />
      {backLabel}
    </button>
  );
  if (gone)
    return (
      <div className="hall-vod details-view rmdb">
        {back}
        <div className="rmdb-empty" role="status">
          <p>{t("Bu kayıt artık Tayfa'da yok.")}</p>
        </div>
      </div>
    );
  if (!details)
    return (
      <div className="hall-vod details-view rmdb">
        {back}
        {error ? (
          <div className="rmdb-empty" role="alert">
            <p>{error}</p>
            <button className="button secondary" onClick={reload}>
              {t('Yeniden dene')}
            </button>
          </div>
        ) : (
          <VodSkeleton />
        )}
      </div>
    );
  return (
    <div className="hall-vod details-view rmdb">
      {back}
      <DetailsHead
        hallId={hall.hallId}
        backdrop={details.backdrop}
        art={details.art}
        title={details.title}
      >
        <span className="hall-eyebrow">
          {details.kind === 'movie' ? t('Film') : t('Dizi')} · Tayfa
        </span>
        <h2>{details.title}</h2>
        <WorkMeta details={details} />
        {unfinished(details) && details.progress && <ProgressNote progress={details.progress} />}
        {details.plot && <p>{details.plot}</p>}
        <Credits director={details.director} cast={details.cast} />
        <WorkActions details={details} onRemoved={onBack} />
      </DetailsHead>
      <div className="rmdb-columns">
        <div className="rmdb-column">
          <ReviewEditor key={details.id} details={details} />
          <Reviews details={details} />
        </div>
        <div className="rmdb-column side">
          <RatingSummary details={details} />
          {details.kind === 'series' && details.episodes.length > 0 && (
            <Episodes details={details} />
          )}
          <Diary details={details} />
        </div>
      </div>
    </div>
  );
}

function WorkMeta({ details }: { details: RmdbWorkDetails }) {
  const watched =
    details.kind === 'series'
      ? details.episodes.length
        ? t('{count} bölüm izlendi', { count: details.episodes.length })
        : null
      : details.watchCount > 1
        ? t('{count} kez izlendi', { count: details.watchCount })
        : details.watchCount === 1
          ? t('Bir kez izlendi')
          : null;
  const parts = [
    details.year,
    details.genre,
    details.durationSec ? minutesLabel(details.durationSec * 1000) : null,
    watched,
  ].filter(Boolean);
  return (
    <p className="hall-meta">
      {details.averageRating !== null && (
        <span
          className="hall-rating"
          title={t('{count} puan', { count: details.ratingCount })}
          aria-label={t('Topluluk puanı {rating} / 5', {
            rating: averageText(details.averageRating),
          })}
        >
          <Star size={13} fill="currentColor" />
          {averageText(details.averageRating)}
          <small className="rmdb-of">/ 5</small>
        </span>
      )}
      {parts.map((part) => (
        <span key={String(part)}>{part}</span>
      ))}
    </p>
  );
}

function ProgressNote({ progress }: { progress: RmdbProgress }) {
  return (
    <div className="rmdb-progress-note">
      <span
        className="rmdb-progress"
        style={{ '--progress': progressShare(progress) } as CSSProperties}
      />
      <small>
        {t('Yarım kaldı · {progress}', {
          progress: [
            progress.episode ? episodeShort(progress.episode) : null,
            progress.durationSec
              ? `${clock(progress.positionSec)} / ${clock(progress.durationSec)}`
              : clock(progress.positionSec),
          ]
            .filter(Boolean)
            .join(' · '),
        })}
      </small>
    </div>
  );
}

function WorkActions({ details, onRemoved }: { details: RmdbWorkDetails; onRemoved(): void }) {
  const hall = useHall();
  const me = useMe();
  const heart = useHeart(details);
  const [logging, setLogging] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = resumeAction(details);
  const steer = hall.canDirect || !hall.primary;
  const playingRef = isHallItem(hall.current) ? hall.current.media.ref : null;
  const playing = !!details.resume && details.resume.ref === playingRef;

  const toggleWatchlist = async () => {
    if (!me) return;
    const on = !details.onWatchlist;
    try {
      await mutateRmdbWork(
        hall.hallId,
        details.id,
        (value) => withWatchlist(value, me, on, Date.now()),
        (bridge) => bridge.rmdbWatchlist(hall.hallId, details.id, on),
      );
    } catch (error) {
      hall.notify(cinemaErrorText(error));
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await removeFromRmdb(hall.hallId, details.id);
      hall.notify(t("{title} Tayfa'dan kaldırıldı.", { title: details.title }));
      onRemoved();
    } catch (error) {
      hall.notify(cinemaErrorText(error));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  const watchlistBy = details.watchlist
    ? details.watchlist.by.userId === hall.me
      ? t('sen ekledin')
      : t('{name} ekledi', { name: details.watchlist.by.name })
    : null;

  return (
    <>
      <div className="hall-detail-actions rmdb-actions">
        {action && (
          <button
            className="button primary"
            disabled={playing}
            onClick={() =>
              void hall.resume({ ...details.resume!, positionSec: action.positionSec })
            }
          >
            {!steer ? (
              <ListPlus size={16} />
            ) : action.kind === 'restart' ? (
              <RotateCcw size={16} />
            ) : (
              <Play size={16} />
            )}
            {playing ? t('Salonda açık') : steer ? action.label : t('Sıraya öner')}
          </button>
        )}
        <button
          className="button secondary"
          aria-pressed={details.onWatchlist}
          onClick={() => void toggleWatchlist()}
        >
          {details.onWatchlist ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
          {details.onWatchlist ? t("İzlenecekler'de") : t("İzlenecekler'e ekle")}
        </button>
        <button
          className="button secondary"
          aria-expanded={logging}
          onClick={() => setLogging((value) => !value)}
        >
          <CalendarCheck size={16} />
          {t('İzledim')}
        </button>
        <HeartButton liked={heart.liked} disabled={heart.busy} onToggle={heart.toggle} />
        {hall.status.isOwner && (
          <button className="hall-text-button quiet rmdb-remove" onClick={() => setConfirm(true)}>
            <Trash2 size={14} />
            {t("Tayfa'dan kaldır")}
          </button>
        )}
      </div>
      {logging && <LogForm details={details} onDone={() => setLogging(false)} />}
      {!action ? (
        <div className="rmdb-note">{noResumeNote(details, hall.status.connected)}</div>
      ) : (
        !steer &&
        !playing && (
          <div className="rmdb-note">
            {hall.directReason}
            {action.kind === 'continue' &&
              ` ${t('Önerilen başlık kaldığı yerden değil, baştan başlar.')}`}
          </div>
        )
      )}
      {details.watchlist && (
        <div className="rmdb-note">
          <Bookmark size={13} />
          {t('İzlenecekler listesinde · {by}, {date}', {
            by: watchlistBy ?? '',
            date: dateLabel(details.watchlist.at),
          })}
        </div>
      )}
      {confirm && (
        <Modal title={t("Tayfa'dan kaldırılsın mı?")} onClose={() => setConfirm(false)}>
          <div className="cs-confirm">
            <p>
              {t(
                "“{title}” bütün puanları, yorumları ve günlüğüyle birlikte Tayfa'dan silinir. Bu geri alınamaz.",
                { title: details.title },
              )}
            </p>
            <div className="cs-actions">
              <button className="button secondary" onClick={() => setConfirm(false)}>
                {t('Vazgeç')}
              </button>
              <button
                className="button primary danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 size={16} />
                {t('Kaldır')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** "İzledim": a diary line for this member, today unless an earlier day is picked. */
function LogForm({ details, onDone }: { details: RmdbWorkDetails; onDone(): void }) {
  const hall = useHall();
  const today = dateInputValue(Date.now());
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const watchedAt = watchedAtFromInput(date, Date.now());
    if (watchedAt === null) {
      setError(t('Bugün ya da daha önceki bir gün seç.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await mutateRmdbWork(hall.hallId, details.id, null, (bridge) =>
        bridge.rmdbLog(hall.hallId, details.id, watchedAt),
      );
      hall.notify(t('Günlüğe eklendi.'));
      onDone();
    } catch (failure) {
      setError(cinemaErrorText(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="rmdb-log"
      aria-label={t('Günlüğe ekle')}
      onSubmit={(event) => void submit(event)}
    >
      <label>
        {t('Ne zaman izledin?')}
        <input
          type="date"
          value={date}
          min="1900-01-01"
          max={today}
          required
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <button className="button primary small" type="submit" disabled={busy}>
        {t('Günlüğe ekle')}
      </button>
      <button className="hall-text-button quiet" type="button" onClick={onDone}>
        {t('Vazgeç')}
      </button>
      {error && (
        <p className="hall-form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

type Draft = { rating: RmdbRating | null; text: string; spoiler: boolean };
const draftOf = (review: RmdbReview | null | undefined): Draft => ({
  rating: review?.rating ?? null,
  text: review?.text ?? '',
  spoiler: review?.spoiler ?? false,
});
const sameDraft = (a: Draft, b: Draft) =>
  a.rating === b.rating && a.text === b.text && a.spoiler === b.spoiler;

/** This member's stars, words and spoiler mark; saved together with "Kaydet". */
function ReviewEditor({ details }: { details: RmdbWorkDetails }) {
  const hall = useHall();
  const me = useMe();
  const heart = useHeart(details);
  const own = details.reviews.find((review) => review.author.userId === hall.me) ?? null;
  const saved = draftOf(own);
  const [draft, setDraft] = useState<Draft>(saved);
  // The saved review the draft started from; null once a save failed (keep the words).
  const base = useRef<Draft | null>(saved);
  useEffect(() => {
    const from = base.current;
    setDraft((current) => (from && sameDraft(current, from) ? saved : current));
    base.current = saved;
    // Only a change of the saved review itself moves an untouched draft.
  }, [saved.rating, saved.text, saved.spoiler]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [confirming, setConfirming] = useSecondClick();
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  const hasText = !!draft.text.trim();
  const dirty = !sameDraft(draft, saved);
  const left = RMDB_REVIEW_MAX - draft.text.length;

  const send = async (input: RmdbReviewInput | null, done: string) => {
    if (!me) return;
    setBusy(true);
    setError('');
    try {
      const result = await mutateRmdbWork(
        hall.hallId,
        details.id,
        (value) => withMyReview(value, me, input, Date.now()),
        (bridge) => bridge.rmdbReview(hall.hallId, details.id, input),
      );
      const next = draftOf(result.reviews.find((review) => review.author.userId === me.userId));
      base.current = next;
      setDraft(next);
      setStatus(done);
    } catch (failure) {
      base.current = null;
      setError(cinemaErrorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const input: RmdbReviewInput = {
      rating: draft.rating,
      text: draft.text,
      spoiler: hasText && draft.spoiler,
      liked: details.mine.liked,
    };
    void send(emptyReview(input) ? null : input, t('Kaydedildi'));
  };

  return (
    <section className="rmdb-card rmdb-editor" aria-label={t('Senin puanın ve yorumun')}>
      <header className="rmdb-card-head">
        <h3>{own ? t('Senin puanın ve yorumun') : t('Puan ver, yorum yaz')}</h3>
        <HeartButton liked={heart.liked} disabled={heart.busy} onToggle={heart.toggle} />
      </header>
      <StarPicker
        value={draft.rating}
        disabled={busy}
        onChange={(rating) => setDraft((value) => ({ ...value, rating }))}
      />
      <textarea
        className="rmdb-textarea"
        aria-label={t('Yorumun')}
        placeholder={t('Ne düşündün? Yazmadan yalnızca puan da verebilirsin.')}
        maxLength={RMDB_REVIEW_MAX}
        rows={4}
        value={draft.text}
        disabled={busy}
        onChange={(event) => {
          const text = event.target.value;
          setDraft((value) => ({ ...value, text }));
        }}
      />
      <div className="rmdb-editor-foot">
        <label className="rmdb-check">
          <input
            type="checkbox"
            checked={hasText && draft.spoiler}
            disabled={!hasText || busy}
            onChange={(event) => {
              const spoiler = event.target.checked;
              setDraft((value) => ({ ...value, spoiler }));
            }}
          />
          {t('Spoiler içerir')}
        </label>
        <small className={`rmdb-counter ${left < 200 ? 'low' : ''}`}>
          {t('{count} karakter kaldı', { count: left.toLocaleString(locale) })}
        </small>
        <span className="rmdb-grow" />
        {status && (
          <span className="rmdb-saved" role="status">
            <Check size={14} />
            {status}
          </span>
        )}
        {own && (
          <button
            className={`hall-text-button ${confirming ? 'danger' : 'quiet'}`}
            disabled={busy}
            onBlur={() => setConfirming(false)}
            onClick={() => {
              if (!confirming) return setConfirming(true);
              setConfirming(false);
              void send(null, t('Silindi'));
            }}
          >
            <Trash2 size={13} />
            {confirming ? t('Puanı ve yorumu sil') : t('Sil')}
          </button>
        )}
        <button className="button primary small" disabled={!dirty || busy} onClick={save}>
          {t('Kaydet')}
        </button>
      </div>
      {error && (
        <p className="hall-form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Every member's rating and review: this member's first, then the newest. */
function Reviews({ details }: { details: RmdbWorkDetails }) {
  const hall = useHall();
  const [removing, setRemoving] = useState<RmdbReview | null>(null);
  const [busy, setBusy] = useState(false);
  const list = [
    ...details.reviews.filter((review) => review.author.userId === hall.me),
    ...details.reviews.filter((review) => review.author.userId !== hall.me),
  ];
  const remove = async (review: RmdbReview) => {
    setBusy(true);
    try {
      await mutateRmdbWork(hall.hallId, details.id, null, (bridge) =>
        bridge.rmdbRemoveReview(hall.hallId, details.id, review.author.userId),
      );
      setRemoving(null);
    } catch (error) {
      hall.notify(cinemaErrorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rmdb-section" aria-label={t('Yorumlar')}>
      <h3>
        {t('Yorumlar ve puanlar')} <small>{list.length}</small>
      </h3>
      {list.length ? (
        <ol className="rmdb-reviews">
          {list.map((review) => (
            <ReviewItem
              key={review.author.userId}
              review={review}
              own={review.author.userId === hall.me}
              onRemove={
                hall.status.isOwner && review.author.userId !== hall.me
                  ? () => setRemoving(review)
                  : undefined
              }
            />
          ))}
        </ol>
      ) : (
        <p className="rmdb-muted">{t('Henüz kimse puan vermedi ya da yorum yazmadı.')}</p>
      )}
      {removing && (
        <Modal title={t('Yorum kaldırılsın mı?')} onClose={() => setRemoving(null)}>
          <div className="cs-confirm">
            <p>
              {t(
                "{name} adlı üyenin puanı, yorumu ve beğenisi Tayfa'dan silinir. Bu geri alınamaz.",
                {
                  name: removing.author.name,
                },
              )}
            </p>
            <div className="cs-actions">
              <button className="button secondary" onClick={() => setRemoving(null)}>
                {t('Vazgeç')}
              </button>
              <button
                className="button primary danger"
                disabled={busy}
                onClick={() => void remove(removing)}
              >
                <Trash2 size={16} />
                {t('Yorumu kaldır')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function ReviewItem({
  review,
  own,
  onRemove,
}: {
  review: RmdbReview;
  own: boolean;
  onRemove?(): void;
}) {
  const [revealed, setRevealed] = useState(false);
  const hidden = review.spoiler && !own && !revealed;
  return (
    <li className={`rmdb-review ${own ? 'own' : ''}`}>
      <span className="rmdb-avatar">
        <VoiceAvatar id={review.author.userId} name={review.author.name} />
      </span>
      <div className="rmdb-review-body">
        <div className="rmdb-review-head">
          <strong>{review.author.name}</strong>
          {own && <span className="rmdb-tag">{t('Sen')}</span>}
          {review.rating !== null && <Stars rating={review.rating} size={13} />}
          {review.liked && (
            <span className="rmdb-liked" role="img" aria-label={own ? t('beğendin') : t('beğendi')}>
              <Heart size={13} fill="currentColor" aria-hidden="true" />
            </span>
          )}
          {review.spoiler && <span className="rmdb-tag spoiler">Spoiler</span>}
          <time dateTime={new Date(review.updatedAt).toISOString()}>
            {dateLabel(review.updatedAt)}
          </time>
          {onRemove && (
            <button
              className="hall-text-button quiet rmdb-review-remove"
              aria-label={t('{name} adlı üyenin yorumunu kaldır', { name: review.author.name })}
              onClick={onRemove}
            >
              {t('Kaldır')}
            </button>
          )}
        </div>
        {review.text ? (
          <div className={`rmdb-review-text ${hidden ? 'hidden' : ''}`}>
            <p aria-hidden={hidden || undefined}>{review.text}</p>
            {hidden && (
              <button className="rmdb-spoiler" onClick={() => setRevealed(true)}>
                <Eye size={14} />
                {t("Spoiler'ı göster")}
              </button>
            )}
          </div>
        ) : (
          <p className="rmdb-muted">
            {review.rating !== null
              ? own
                ? t('Yalnızca puan verdin.')
                : t('Yalnızca puan verdi.')
              : own
                ? t('Beğendin.')
                : t('Beğendi.')}
          </p>
        )}
      </div>
    </li>
  );
}

/** The community average with a ½–5★ distribution; this member's own step is marked. */
function RatingSummary({ details }: { details: RmdbWorkDetails }) {
  const counts = ratingHistogram(details.reviews);
  const max = Math.max(1, ...counts);
  return (
    <section className="rmdb-card" aria-label={t('Topluluk puanı')}>
      <h3>{t('Topluluk puanı')}</h3>
      {details.averageRating !== null ? (
        <>
          <div className="rmdb-score">
            <strong>{averageText(details.averageRating)}</strong>
            <span>/ 5</span>
            <Stars rating={details.averageRating} size={15} />
          </div>
          <p className="rmdb-muted">
            {[
              t('{count} puan', { count: details.ratingCount }),
              details.likeCount ? t('{count} beğeni', { count: details.likeCount }) : null,
              details.reviewCount ? t('{count} yorum', { count: details.reviewCount }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="rmdb-histogram">
            <span aria-hidden="true">½</span>
            <ol aria-label={t('Puan dağılımı')}>
              {counts.map((count, index) => (
                <li
                  key={index}
                  className={details.mine.rating === index + 1 ? 'mine' : ''}
                  title={t('{label} · {count} kişi', { label: starsLabel(index + 1), count })}
                >
                  <span className="rmdb-bar" style={{ '--share': count / max } as CSSProperties} />
                  <span className="rmdb-sr">
                    {t('{label}: {count} kişi', { label: starsLabel(index + 1), count })}
                  </span>
                </li>
              ))}
            </ol>
            <span aria-hidden="true">5</span>
          </div>
        </>
      ) : (
        <p className="rmdb-muted">{t('Henüz puan yok. İlk puanı sen ver.')}</p>
      )}
    </section>
  );
}

/** Series: the episodes the hall played, by season, with how far each got. */
function Episodes({ details }: { details: RmdbWorkDetails }) {
  return (
    <section className="rmdb-card" aria-label={t('İzlenen bölümler')}>
      <h3>
        {t('İzlenen bölümler')} <small>{details.episodes.length}</small>
      </h3>
      {seasonsOf(details.episodes).map((season) => (
        <div key={season.season} className="rmdb-season">
          <h4>{t('{season}. Sezon', { season: season.season })}</h4>
          <ol>
            {season.episodes.map((episode) => (
              <li key={episode.episode}>
                <span className="rmdb-episode-no">{episode.episode}</span>
                <span className="rmdb-episode-text">
                  <span>
                    {episode.title || t('{episode}. Bölüm', { episode: episode.episode })}
                  </span>
                  {!episode.finished && (
                    <span
                      className="rmdb-progress"
                      style={{ '--progress': progressShare(episode) } as CSSProperties}
                    />
                  )}
                </span>
                <small>
                  {episode.finished ? (
                    <>
                      <Check size={13} />
                      {t('Bitti')}
                    </>
                  ) : (
                    t('yarım · {time}', { time: clock(episode.positionSec) })
                  )}
                </small>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

/** Who watched when: hall watches with everyone who was there, and hand logs. */
function Diary({ details }: { details: RmdbWorkDetails }) {
  const hall = useHall();
  const again = rewatches(details.diary);
  const remove = async (entry: RmdbDiaryEntry) => {
    try {
      await mutateRmdbWork(hall.hallId, details.id, null, (bridge) =>
        bridge.rmdbRemoveLog(hall.hallId, details.id, entry.id),
      );
    } catch (error) {
      hall.notify(cinemaErrorText(error));
    }
  };
  return (
    <section className="rmdb-card" aria-label={t('Günlük')}>
      <h3>
        {t('Günlük')} <small>{details.diary.length}</small>
      </h3>
      {details.diary.length ? (
        <ol className="rmdb-diary">
          {details.diary.map((entry) => (
            <DiaryItem
              key={entry.id}
              entry={entry}
              me={hall.me}
              rewatch={again.has(entry.id)}
              position={diaryPosition(entry)}
              canRemove={
                hall.status.isOwner ||
                (entry.source === 'manual' && entry.loggedBy?.userId === hall.me)
              }
              onRemove={() => void remove(entry)}
            />
          ))}
        </ol>
      ) : (
        <p className="rmdb-muted">
          {t('Henüz izlenmedi. Salonda açılınca ya da “İzledim” ile buraya yazılır.')}
        </p>
      )}
    </section>
  );
}

function DiaryItem({
  entry,
  me,
  rewatch,
  position,
  canRemove,
  onRemove,
}: {
  entry: RmdbDiaryEntry;
  me: string | null;
  rewatch: boolean;
  position: number | null;
  canRemove: boolean;
  onRemove(): void;
}) {
  const [confirming, setConfirming] = useSecondClick();
  return (
    <li className="rmdb-diary-entry">
      <div className="rmdb-diary-top">
        <span className="rmdb-diary-when">
          <time dateTime={new Date(entry.watchedAt).toISOString()}>
            {dateLabel(entry.watchedAt)}
            {entry.source === 'hall' && <small> · {hhmm(entry.watchedAt)}</small>}
          </time>
          <span className="rmdb-tag">{entry.source === 'hall' ? t('Salonda') : t('Elle')}</span>
          {rewatch && (
            <span className="rmdb-tag" title={t('Daha önce de izlenmişti')}>
              <RotateCcw size={11} />
              {t('Tekrar')}
            </span>
          )}
        </span>
        {canRemove && (
          <button
            className={`hall-text-button ${confirming ? 'danger' : 'quiet'} rmdb-diary-remove`}
            aria-label={confirming ? t('Kaldırmayı onayla') : t('Günlükten kaldır')}
            title={t('Günlükten kaldır')}
            onBlur={() => setConfirming(false)}
            onClick={() => {
              if (!confirming) return setConfirming(true);
              setConfirming(false);
              onRemove();
            }}
          >
            <Trash2 size={13} />
            {confirming && t('Kaldır')}
          </button>
        )}
      </div>
      {entry.episode && (
        <div className="rmdb-diary-episode">
          {episodeLong(entry.episode)}
          {entry.episode.title ? ` · ${entry.episode.title}` : ''}
        </div>
      )}
      <div className="rmdb-diary-people">
        <span className="rmdb-avatars">
          {entry.viewers.slice(0, 4).map((viewer) => (
            <VoiceAvatar key={viewer.userId} id={viewer.userId} name={viewer.name} />
          ))}
        </span>
        <small>
          {peopleText(
            // English puts "You" first ("You, Emma and Leo"); Turkish ends with it ("Ece, Can ve Sen").
            [...entry.viewers]
              .sort((a, b) =>
                getLocale() === 'en' ? Number(b.userId === me) - Number(a.userId === me) : 0,
              )
              .map((viewer) => (viewer.userId === me ? t('Sen') : viewer.name)),
          )}
        </small>
        <span className={`rmdb-diary-state ${entry.finished ? 'done' : ''}`}>
          {entry.finished ? (
            <>
              <Check size={13} />
              {t('Bitti')}
            </>
          ) : position !== null ? (
            t('yarım · {time}', { time: clock(position) })
          ) : (
            t('yarım')
          )}
        </span>
      </div>
    </li>
  );
}
