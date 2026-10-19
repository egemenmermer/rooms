import './community-cinema.css';
import './hall-background.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Volume2, VolumeX, X } from 'lucide-react';
import type { CinemaStatus } from '../../../../packages/community-cinema/src/types';
import { storeVolume, storedVolume } from '../cinema-youtube';
import { useCommunityCinema } from './cinema-status';
import { stopHallBackground, useHallBackground } from './hall-background';
import type { PlayerControls } from './HallPlayer';
import { HallStage } from './HallStage';
import { HallContext, useHallState } from './use-hall';

/** Corner players mounted per hall; a remount must not give up the seat. */
const corners = new Map<string, number>();

/** The hall in a corner of the app while its page is closed: same seat, this viewer's volume. */
export default function HallBackgroundPlayer({
  hallId,
  notify,
}: {
  hallId: string;
  notify(message: string): void;
}) {
  const cinema = useCommunityCinema();
  // Another community is open now, or its hall moved: this corner has nothing to show.
  const elsewhere = !!cinema.status && cinema.hallId !== hallId;
  useEffect(() => {
    if (elsewhere) stopHallBackground();
  }, [elsewhere]);
  if (!cinema.status || cinema.hallId !== hallId) return null;
  return <Corner hallId={hallId} status={cinema.status} notify={notify} />;
}

function Corner({
  hallId,
  status,
  notify,
}: {
  hallId: string;
  status: CinemaStatus;
  notify(message: string): void;
}) {
  const hall = useHallState({ hallId, status, notify });
  const navigate = useNavigate();
  const [audio, setAudioState] = useState(storedVolume);
  const setAudio = useCallback((value: { volume: number; muted: boolean }) => {
    setAudioState(value);
    storeVolume(value);
  }, []);
  const controls = useRef<PlayerControls | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const latest = useRef(hall);
  latest.current = hall;

  // The page's seat rule: sit down while something plays.
  useEffect(() => {
    if (hall.connected && hall.primary && !hall.joined) hall.quiet({ type: 'join' });
  }, [hall.connected, hall.primary, hall.joined, hall.quiet]);
  // The hall ended or was closed: nothing left to watch.
  const ended = hall.connected && !hall.current;
  useEffect(() => {
    if (ended) stopHallBackground();
  }, [ended]);
  // Closing the corner gives up the seat. The hall page taking the screen back keeps it, and
  // so does React re-running effects (development): decide once React has settled.
  useEffect(() => {
    corners.set(hallId, (corners.get(hallId) ?? 0) + 1);
    return () => {
      corners.set(hallId, (corners.get(hallId) ?? 1) - 1);
      const seat = latest.current;
      setTimeout(() => {
        if ((corners.get(hallId) ?? 0) > 0 || useHallBackground.getState().pages > 0) return;
        if (seat.joined) seat.quiet({ type: 'leave' });
      }, 0);
    };
  }, [hallId]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === host.current);
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      if (document.fullscreenElement === host.current)
        void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.current?.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      notify('Tam ekran açılamadı.');
    }
  }, [notify]);
  const open = useCallback(() => navigate('/cinema'), [navigate]);

  if (!hall.current) return null;
  return createPortal(
    <HallContext.Provider value={hall}>
      <div className="hall-background" role="region" aria-label="Sinema küçük oynatıcı">
        <div ref={host} className="hall-screen-host mini">
          <HallStage
            mode="mini"
            fullscreen={fullscreen}
            panelOpen={false}
            osd={null}
            audio={audio}
            onAudio={setAudio}
            welcome={null}
            controls={controls}
            keyboard={false}
            onToggleFullscreen={() => void toggleFullscreen()}
            onTogglePanel={open}
            onExpand={open}
            onZap={open}
          />
        </div>
        <div className="hall-background-actions">
          <button
            className="hall-icon-button"
            aria-label={audio.muted ? 'Sinemanın sesini aç' : 'Sinemanın sesini kapat'}
            title={audio.muted ? 'Sinemanın sesini aç' : 'Sinemanın sesini kapat'}
            onClick={() => setAudio({ ...audio, muted: !audio.muted })}
          >
            {audio.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button
            className="hall-icon-button"
            aria-label="Küçük oynatıcıyı kapat"
            title="Yalnızca sende kapanır, salon sürer."
            onClick={stopHallBackground}
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </HallContext.Provider>,
    document.body,
  );
}
