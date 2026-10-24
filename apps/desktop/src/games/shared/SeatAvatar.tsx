import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import { Hourglass, UserMinus } from 'lucide-react';
import { Avatar } from '@rooms/design';
import { t } from '../../i18n';
import { mediaProvider } from '../../runtime-sources';
import { VoiceAvatar } from '../../VoiceAvatar';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { guardTimer } from './TurnClock';
import './seat-avatar.css';

export type GameSeat = GamePublicState['seats'][number];

/** Owner/host seat controls, provided by the table shell so every seat can offer them. */
export interface SeatControls {
  /** Whether the button shows: the viewer may free this seat at all. */
  canRemove(seat: GameSeat): boolean;
  /** Shown but not pressable right now (a command in flight, no connection, a local fixture). */
  disabled: boolean;
  disabledReason?: string;
  remove(seat: number): Promise<boolean>;
}
export const SeatControlsContext = createContext<SeatControls | null>(null);

/**
 * Whether the viewer may free this seat. The server publishes `removable` per seat by the rule
 * `game.seat.remove` enforces (owner or room host, an away seat, never one's own). Older servers
 * send none: the viewer then guesses from `bot` and `connected`, so a seat that just dropped can
 * still be refused (the shell shows that error).
 */
export function seatRemovable(
  game: GamePublicState,
  seat: GameSeat,
  userId: string | undefined,
  roomHostId: string | undefined,
) {
  if (!userId) return false;
  if (typeof seat.removable === 'boolean') return seat.removable;
  return (
    (game.ownerId === userId || roomHostId === userId) &&
    seat.userId !== userId &&
    (seat.bot || !seat.connected)
  );
}

// Reads the media snapshot directly (not `realtime.ts`), so the lazy game views stay light.
const subscribeMedia = (listener: () => void) => {
  try {
    return mediaProvider().subscribeState(listener);
  } catch {
    return () => {};
  }
};
/** One boolean per seat, so a speaking tick re-renders only the seats whose state changed. */
export function useSpeaking(userId: string) {
  return useSyncExternalStore(subscribeMedia, () => {
    try {
      const snapshot = mediaProvider().snapshot();
      if (snapshot.status !== 'connected') return false;
      const person = snapshot.participants.find((p) => p.id === userId);
      return !!person?.speaking && !person.muted;
    } catch {
      return false;
    }
  });
}

/**
 * Turn time left on a ring around the avatar; red under 10 seconds. At zero the ring stays full
 * and red with an hourglass (not a number: a red "0" reads as an unread badge). A value that
 * cannot be a real turn time (see `guardTimer`) draws nothing.
 */
function SeatClock({ timer, deadline }: { timer: number | null; deadline: number }) {
  // The ring's full length is the time left when this turn was first seen.
  const total = useRef<{ deadline: number; seconds: number } | null>(null);
  const seconds = guardTimer(timer);
  if (seconds === null) return null;
  if (!total.current || total.current.deadline !== deadline)
    total.current = { deadline, seconds: Math.max(seconds, 1) };
  const expired = seconds === 0,
    fraction = expired ? 1 : Math.max(0, Math.min(1, seconds / total.current.seconds)),
    radius = 26,
    length = 2 * Math.PI * radius;
  return (
    <>
      <svg className={`rg-seat-ring${expired ? ' expired' : ''}`} viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r={radius} />
        <circle
          cx="30"
          cy="30"
          r={radius}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - fraction)}
        />
      </svg>
      {expired ? (
        <span className="rg-seat-clock expired" role="img" aria-label={t('Süre doldu')}>
          <Hourglass size={12} aria-hidden />
        </span>
      ) : (
        <span className="rg-seat-clock" aria-label={t('{seconds} saniye kaldı', { seconds })}>
          {seconds}
        </span>
      )}
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
    shown = turn ? guardTimer(timer) : null,
    low = shown !== null && shown <= 10;
  return (
    <div
      className={`rg-seat-avatar${speaking ? ' speaking' : ''}${turn ? ' turn' : ''}${low ? ' low' : ''}${seat.bot ? ' bot' : ''}${seat.connected ? '' : ' away'}`}
    >
      <div className="rg-seat-face">
        {seat.bot ? <Avatar name={seat.name} /> : <VoiceAvatar id={seat.userId} name={seat.name} />}
        {shown !== null && <SeatClock timer={shown} deadline={deadline} />}
        {seat.bot && <span className="rg-seat-badge">{'BOT'}</span>}
      </div>
      {speaking && <span className="rg-visually-hidden">{t('Konuşuyor')}</span>}
      {controls?.canRemove(seat) && (
        <button
          className="rg-seat-remove"
          disabled={controls.disabled}
          title={controls.disabledReason ?? t('Koltuğu boşalt')}
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
