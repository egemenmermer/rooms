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
import { hallMedia, hallProgress, openNowCommands, suggestCommands } from './hall-model';

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
    async (media: SharedMedia, label = media.title) => {
      const id =
        media.kind === 'community-media'
          ? media.ref
          : media.kind === 'youtube'
            ? media.videoId
            : '';
      if (opening.current === id) return;
      opening.current = id;
      try {
        if (canDirect || !roomRef.current?.primary) {
          await sendAll(openNowCommands(roomRef.current, media, crypto.randomUUID()));
        } else {
          await sendAll(suggestCommands(roomRef.current, media, crypto.randomUUID()));
          notify(`${label} sıraya önerildi.`);
        }
      } catch (error) {
        notify(cinemaErrorText(error));
      } finally {
        opening.current = null;
      }
    },
    [canDirect, sendAll, notify],
  );
  const openItem = useCallback((item: CinemaItem) => open(hallMedia(item)), [open]);
  const openEpisode = useCallback(
    (series: CinemaItem, episode: CinemaEpisode) =>
      open({
        kind: 'community-media',
        ref: episode.ref,
        title: `${series.title} · ${episode.season}. Sezon ${episode.episode}. Bölüm`.slice(0, 240),
        live: false,
        art: episode.art && /^[a-f0-9]{16,64}$/.test(episode.art) ? episode.art : null,
      }),
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
