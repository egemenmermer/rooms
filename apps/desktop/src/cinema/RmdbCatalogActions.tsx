import { useState } from 'react';
import { Bookmark, BookmarkCheck, NotebookPen, Plus } from 'lucide-react';
import type { CinemaItem } from '../../../../packages/community-cinema/src/types';
import { useCommunity } from '../community';
import { t } from '../i18n';
import { cinemaErrorText } from './cinema-bridge';
import { matchWork, withWatchlist } from './rmdb-model';
import { addToRmdb, mutateRmdbWork, useRmdbList } from './rmdb-store';
import { useHall } from './use-hall';

/**
 * On a catalog film or series: add it to RMDB by hand or onto the shared İzlenecekler list,
 * then open it there. A title RMDB already has (the hall watched it) offers that entry at once.
 */
export function RmdbCatalogActions({
  item,
  onRmdb,
}: {
  item: CinemaItem;
  onRmdb?(workId: string): void;
}) {
  const hall = useHall();
  const user = useCommunity((state) => state.user);
  const rmdb = useRmdbList(hall.hallId, 30_000);
  const [busy, setBusy] = useState<'add' | 'watchlist' | null>(null);
  if (item.kind === 'live') return null;
  const addedId = rmdb.refs[item.ref];
  const work =
    (addedId ? rmdb.works?.find((value) => value.id === addedId) : null) ??
    (rmdb.works ? matchWork(rmdb.works, item) : null);
  const workId = work?.id ?? addedId ?? null;
  const onWatchlist = !!work?.onWatchlist;

  const add = async (watchlist: boolean) => {
    setBusy(watchlist ? 'watchlist' : 'add');
    try {
      await addToRmdb(hall.hallId, item.ref, watchlist);
      hall.notify(
        watchlist
          ? t("{title} İzlenecekler'e eklendi.", { title: item.title })
          : t("{title} Tayfa'ya eklendi.", { title: item.title }),
      );
    } catch (error) {
      hall.notify(cinemaErrorText(error));
    } finally {
      setBusy(null);
    }
  };
  const toggleWatchlist = async (id: string) => {
    if (!user) return;
    setBusy('watchlist');
    const me = { userId: user.id, name: user.displayName || user.username };
    try {
      await mutateRmdbWork(
        hall.hallId,
        id,
        (details) => withWatchlist(details, me, !onWatchlist, Date.now()),
        (bridge) => bridge.rmdbWatchlist(hall.hallId, id, !onWatchlist),
      );
    } catch (error) {
      hall.notify(cinemaErrorText(error));
    } finally {
      setBusy(null);
    }
  };

  if (!workId)
    return (
      <>
        <button className="button secondary" disabled={!!busy} onClick={() => void add(false)}>
          <Plus size={16} />
          {t("Tayfa'ya ekle")}
        </button>
        <button className="button secondary" disabled={!!busy} onClick={() => void add(true)}>
          <Bookmark size={16} />
          {t("İzlenecekler'e ekle")}
        </button>
      </>
    );
  return (
    <>
      {onRmdb && (
        <button className="button secondary" onClick={() => onRmdb(workId)}>
          <NotebookPen size={16} />
          {t("Tayfa'da aç")}
        </button>
      )}
      <button
        className="button secondary"
        aria-pressed={onWatchlist}
        disabled={!!busy}
        onClick={() => void (work ? toggleWatchlist(workId) : add(true))}
      >
        {onWatchlist ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
        {onWatchlist ? t("İzlenecekler'de") : t("İzlenecekler'e ekle")}
      </button>
    </>
  );
}
