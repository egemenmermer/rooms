import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import {
  directsSession,
  type ActivityCommand,
  type SharedMedia,
} from '../../../../packages/activity-protocol/src';
import type {
  CinemaEpisode,
  CinemaItem,
  CinemaStatus,
} from '../../../../packages/community-cinema/src/types';
import { useActivityRoom } from '../activity';
import { useCommunity } from '../community';
import { useRealtime } from '../realtime';
import { cinemaErrorText } from './cinema-bridge';
import {
  hallMedia,
  hallProgress,
  isHallItem,
  openNowCommands,
  resumeCommands,
  resumeMedia,
  suggestCommands,
  type HallResume,
} from './hall-model';

export type HallActions = ReturnType<typeof useHallState>;

/** Activity state, permissions and the commands every hall view shares. */
export function useHallState({
  hallId,
  status,
  notify,
}: {
  hallId: string;
  status: CinemaStatus;
  notify(message: string): void;
}) {
  const activity = useActivityRoom(hallId);
  const me = useCommunity((s) => s.user?.id ?? null);
  const realtime = useRealtime();
  const room = activity.room;
  const primary = room?.primary ?? null;
  const connected = activity.status === 'connected';
  const self = room?.participants.find((p) => p.userId === me);
  const roleControl = self ? self.canControl : true;
  const canDirect = connected && directsSession(primary, me, roleControl);
  const isHost = !!me && primary?.hostUserId === me;
  const { current, upcoming } = hallProgress(room);
  const directReason = !connected
    ? 'Salon hizmeti bağlı değil.'
    : !roleControl
      ? 'Bu salonda oynatmayı yönetme iznin yok.'
      : 'Kumanda ev sahibinde. Sıraya öneri ekleyebilirsin.';
  const send = activity.send;
  const sendAll = useCallback(
    async (commands: ActivityCommand[]) => {
      for (const command of commands) await send(command);
    },
    [send],
  );
  const run = useCallback(
    (command: ActivityCommand) =>
      void send(command).catch((error) => notify(cinemaErrorText(error))),
    [send, notify],
  );
  const quiet = useCallback(
    (command: ActivityCommand) => void send(command).catch(() => activity.clearError()),
    [send, activity.clearError],
  );
  // Repeated opens of the same thing while a command is in flight are dropped.
  const opening = useRef<string | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  const open = useCallback(
    async (
      media: SharedMedia,
      label = media.title,
      /**
       * `itemId`: a queue id every viewer derives the same way, so two of them starting the same
       * next episode add it once. `quiet`: no notices (an automatic step, not a click).
       */
      options: { itemId?: string; quiet?: boolean } = {},
    ) => {
      const id =
        media.kind === 'community-media'
          ? media.ref
          : media.kind === 'youtube'
            ? media.videoId
            : '';
      if (opening.current === id) return;
      opening.current = id;
      try {
        const itemId = options.itemId ?? crypto.randomUUID();
        if (canDirect || !roomRef.current?.primary) {
          await sendAll(openNowCommands(roomRef.current, media, itemId));
        } else {
          await sendAll(suggestCommands(roomRef.current, media, itemId));
          if (!options.quiet) notify(`${label} sıraya önerildi.`);
        }
      } catch (error) {
        if (!options.quiet) notify(cinemaErrorText(error));
      } finally {
        opening.current = null;
      }
    },
    [canDirect, sendAll, notify],
  );
  // The room as last rendered, a moment after a command: waits until it shows `ref`.
  const showing = useCallback(async (ref: string) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const { current } = hallProgress(roomRef.current);
      if (isHallItem(current) && current.media.ref === ref) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }, []);
  /**
   * RMDB: open a film or episode where the hall stopped. With the remote it opens now and then
   * seeks; `playback` names no item, so the seek goes out only while the hall still shows this
   * title. Without the remote it is suggested to the queue and starts from the beginning.
   */
  const resume = useCallback(
    async (target: HallResume) => {
      if (opening.current === target.ref) return;
      opening.current = target.ref;
      try {
        const plan = resumeCommands(roomRef.current, target, crypto.randomUUID(), canDirect);
        await sendAll(plan.open);
        if (plan.suggested) {
          notify(`${resumeMedia(target).title} sıraya önerildi; açılınca baştan başlar.`);
          return;
        }
        if (!plan.seek) return;
        if (!(await showing(target.ref))) {
          notify('Salon bu arada başka bir şeye geçti; kaldığı yere sarılmadı.');
          return;
        }
        await send(plan.seek);
      } catch (error) {
        notify(cinemaErrorText(error));
      } finally {
        opening.current = null;
      }
    },
    [canDirect, send, sendAll, notify, showing],
  );
  const openItem = useCallback((item: CinemaItem) => open(hallMedia(item)), [open]);
  const openEpisode = useCallback(
    (series: CinemaItem, episode: CinemaEpisode, options?: { itemId?: string; quiet?: boolean }) =>
      open(
        {
          kind: 'community-media',
          ref: episode.ref,
          title: `${series.title} · ${episode.season}. Sezon ${episode.episode}. Bölüm`.slice(
            0,
            240,
          ),
          live: false,
          art: episode.art && /^[a-f0-9]{16,64}$/.test(episode.art) ? episode.art : null,
        },
        undefined,
        options,
      ),
    [open],
  );
  const nameOf = useCallback(
    (id: string) =>
      id === me
        ? 'Sen'
        : (room?.participants.find((p) => p.userId === id)?.displayName ??
          realtime.participants.find((p) => p.id === id)?.name ??
          'Biri'),
    [room?.participants, realtime.participants, me],
  );
  return useMemo(
    () => ({
      hallId,
      status,
      activity,
      room,
      primary,
      me,
      connected,
      joined: !!self,
      roleControl,
      canDirect,
      isHost,
      current,
      upcoming,
      directReason,
      run,
      quiet,
      send,
      sendAll,
      open,
      openItem,
      openEpisode,
      resume,
      nameOf,
      notify,
    }),
    [
      hallId,
      status,
      activity,
      room,
      primary,
      me,
      connected,
      self,
      roleControl,
      canDirect,
      isHost,
      current,
      upcoming,
      directReason,
      run,
      quiet,
      send,
      sendAll,
      open,
      openItem,
      openEpisode,
      resume,
      nameOf,
      notify,
    ],
  );
}

export const HallContext = createContext<HallActions | null>(null);

export function useHall(): HallActions {
  const value = useContext(HallContext);
  if (!value) throw new Error('useHall must be used inside the cinema hall.');
  return value;
}
