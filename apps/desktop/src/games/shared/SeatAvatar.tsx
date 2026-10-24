import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import { UserMinus } from 'lucide-react';
import { Avatar } from '@rooms/design';
import { t } from '../../i18n';
import { mediaProvider } from '../../runtime-sources';
import { useVoiceContext } from '../../realtime';
import { VoiceAvatar } from '../../VoiceAvatar';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import './seat-avatar.css';

export type GameSeat = GamePublicState['seats'][number];

/** Owner/host seat controls, provided by the table shell so every seat can offer them. */
export interface SeatControls {
  canRemove(seat: GameSeat): boolean;
  remove(seat: number): Promise<boolean>;
}
export const SeatControlsContext = createContext<SeatControls | null>(null);

/**
 * Whether the owner or the room host may free this seat. The server frees a bot, a player who
 * left or was taken over, or one disconnected for 30 s; the public view only shows `bot` and
 * `connected`, so a seat that just dropped can still be refused (the shell shows that error).
 */
export function seatRemovable(
  game: GamePublicState,
  seat: GameSeat,
  userId: string | undefined,
  roomHostId: string | undefined,
) {
  return (
    !!userId &&
    (game.ownerId === userId || roomHostId === userId) &&
    seat.userId !== userId &&
    (seat.bot || !seat.connected)
  );
}

const subscribeMedia = (listener: () => void) => {
  try {
    const unsubscribeMedia = mediaProvider().subscribeState(listener),
      unsubscribeVoice = useVoiceContext.subscribe(listener);
    return () => {
      unsubscribeMedia();
      unsubscribeVoice();
    };
  } catch {
    return () => {};
  }
};
/** One boolean per seat, so a speaking tick re-renders only the seats whose state changed. */
export function useSpeaking(userId: string) {
  return useSyncExternalStore(subscribeMedia, () => {
    try {
      if (useVoiceContext.getState().busy) return false;
      const snapshot = mediaProvider().snapshot();
      if (snapshot.status !== 'connected') return false;
      const person = snapshot.participants.find((p) => p.id === userId);
      return !!person?.speaking && !person.muted;
    } catch {
      return false;
    }
  });
}

/** Turn time left on a ring around the avatar; red under 10 seconds. */
function SeatClock({ timer, deadline }: { timer: number; deadline: number }) {
  // The ring's full length is the time left when this turn was first seen.
  const total = useRef<{ deadline: number; seconds: number } | null>(null);
  if (!total.current || total.current.deadline !== deadline)
    total.current = { deadline, seconds: Math.max(timer, 1) };
  const fraction = Math.max(0, Math.min(1, timer / total.current.seconds)),
    radius = 26,
    length = 2 * Math.PI * radius;
  return (
    <>
      <svg className="rg-seat-ring" viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r={radius} />
        <circle
          cx="30"
          cy="30"
          r={radius}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - fraction)}
        />
      </svg>
      <span className="rg-seat-clock" aria-label={t('{seconds} saniye kaldı', { seconds: timer })}>
        {timer}
      </span>
    </>
  );
}

/**
 * The avatar of one game seat: profile photo (initials for bots), the voice speaking ring, a bot
 * badge, the turn clock on whichever seat is playing, and the owner's "Koltuğu boşalt".
 * Adopt with one line in place of `<Avatar name={seat.name} />`:
 * `<SeatAvatar seat={seat} game={game} timer={timer} />`.
 */
export function SeatAvatar({
  seat,
  game,
  timer,
}: {
  seat: GameSeat;
  game: GamePublicState;
  timer: number | null;
}) {
  const speaking = useSpeaking(seat.userId),
    controls = useContext(SeatControlsContext);
  const turn = game.status === 'playing' && game.turn === seat.seat,
    deadline = Number(game.view.turnDeadline ?? 0),
    low = turn && timer !== null && timer <= 10;
  return (
    <div
      className={`rg-seat-avatar${speaking ? ' speaking' : ''}${turn ? ' turn' : ''}${low ? ' low' : ''}${seat.bot ? ' bot' : ''}${seat.connected ? '' : ' away'}`}
    >
      <div className="rg-seat-face">
        {seat.bot ? <Avatar name={seat.name} /> : <VoiceAvatar id={seat.userId} name={seat.name} />}
        {turn && timer !== null && <SeatClock timer={timer} deadline={deadline} />}
        {seat.bot && <span className="rg-seat-badge">{t('Bot')}</span>}
      </div>
      {speaking && <span className="rg-visually-hidden">{t('Konuşuyor')}</span>}
      {controls?.canRemove(seat) && (
        <button
          className="rg-seat-remove"
          title={t('Koltuğu boşalt')}
          aria-label={t('{name} koltuğunu boşalt', { name: seat.name })}
          onClick={() => void controls.remove(seat.seat)}
        >
          <UserMinus size={12} />
          <span>{t('Koltuğu boşalt')}</span>
        </button>
      )}
    </div>
  );
}
