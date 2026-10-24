import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Gamepad2, X } from 'lucide-react';
import { t } from '../i18n';
import { useActivityRoom } from '../activity';
import { useCommunity } from '../community';
import { useVoiceContext } from '../realtime';
import type { GamePublicState } from '../../../../packages/activity-protocol/src';
import { gameNames } from './catalog';
import { playGameCue } from './shared/sounds';
import './turn-notice.css';

/**
 * A key for "it is the viewer's turn right now", or null. One key per turn (seat + deadline), so
 * a poll that repeats the same view never raises a second notice. A seat a bot took over is not
 * the viewer's turn: the bot plays it.
 */
export function ownTurnKey(game: GamePublicState | null | undefined, userId?: string) {
  if (!game || !userId || game.status !== 'playing' || game.turn === null) return null;
  const own = game.seats.find((seat) => seat.userId === userId);
  if (!own || own.bot || own.seat !== game.turn || game.view.ownRecovery?.takeover) return null;
  const legal = Array.isArray(game.view.legalActions) ? game.view.legalActions : [];
  if (!legal.length) return null;
  return `${game.kind}:${game.history.length}:${own.seat}:${Number(game.view.turnDeadline ?? 0)}`;
}

/**
 * Route independent: when it becomes the viewer's turn at the current room's table while they are
 * on another page, a small notice offers the way back. With the window in the background it also
 * asks for the content-free desktop notification, only when the person opted in to notifications.
 * Mount once next to `<RoomEventSounds />`; it reuses the room's shared activity poll.
 */
export function GameTurnNotice() {
  // Same room as the /games route (`useCurrentRoom`), read through narrow selectors so speaking
  // updates never re-render the shell; Agent.tsx itself is lazy and stays out of the main bundle.
  const userId = useCommunity((s) => s.user?.id),
    activeChannelId = useCommunity((s) => s.activeChannelId),
    voiceChannelId = useVoiceContext((s) => s.channelId),
    activity = useActivityRoom(userId ? (voiceChannelId ?? activeChannelId) : null),
    location = useLocation(),
    navigate = useNavigate();
  const room = activity.status === 'connected' ? activity.room : null;
  const game = room?.primary && room.primary.activity === room.game?.kind ? room.game : null;
  const key = ownTurnKey(game, userId);
  const onGames = location.pathname.startsWith('/games');
  const [dismissed, setDismissed] = useState<string | null>(null),
    [now, setNow] = useState(Date.now());
  const announced = useRef<string | null>(null);
  const visible = !!key && !onGames && dismissed !== key;
  useEffect(() => {
    if (!key || announced.current === key) return;
    announced.current = key;
    if (onGames) return;
    // The table plays its own turn cue on /games; elsewhere this is the only sound of it.
    playGameCue('turn');
    if (typeof document !== 'undefined' && document.hasFocus()) return;
    const notifications = window.rooms?.notifications;
    if (!notifications?.reminder) return;
    void notifications
      .status()
      .then((status) =>
        status.enabled
          ? notifications.reminder?.({
              title: 'Tayfa',
              detail: t('Sıra sende · {game}', { game: game ? (gameNames[game.kind] ?? '') : '' }),
            })
          : undefined,
      )
      .catch(() => {});
  }, [key, onGames, game]);
  const deadline = Number(game?.view.turnDeadline ?? 0);
  useEffect(() => {
    if (!visible || !deadline) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [visible, deadline]);
  if (!visible || !game) return null;
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - now - activity.serverOffsetMs) / 1000))
    : null;
  return (
    <aside className="game-turn-notice" role="status" aria-live="polite">
      <Gamepad2 size={18} aria-hidden />
      <div>
        <strong>{t('Sıra sende')}</strong>
        <small>
          {seconds === null
            ? (gameNames[game.kind] ?? '')
            : t('{game} · {seconds} sn', { game: gameNames[game.kind] ?? '', seconds })}
        </small>
      </div>
      <button
        className="button primary small"
        onClick={() => {
          setDismissed(key);
          navigate('/games?tab=table');
        }}
      >
        {t('Masaya dön')}
      </button>
      <button
        className="game-turn-notice-close"
        aria-label={t('Bildirimi kapat')}
        onClick={() => setDismissed(key)}
      >
        <X size={15} />
      </button>
    </aside>
  );
}
