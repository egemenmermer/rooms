import { openRoomActivity } from './MusicDJ';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Overlay } from './App';
import { useCommunity } from './community';
import { useRealtime, joinVoice } from './realtime';
import { useActivityRoom } from './activity';
import { ConnectionPane } from './ConnectionPane';
import { ReferenceIcon } from './ReferenceIcon';
import { VoiceAvatar } from './VoiceAvatar';
import { uiError } from './i18n';
import './reference-home.css';

export function Home({
  open,
  notify,
}: {
  open(value: Overlay): void;
  notify(message: string): void;
}) {
  const c = useCommunity(),
    r = useRealtime(),
    navigate = useNavigate();
  const activity = useActivityRoom(c.user ? r.channelId : null);
  const primary = activity.status === 'connected' ? activity.room?.primary : null;
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture'))
      void import('./dev/reference-fixtures').then(() => {
        if (alive) setArt('/__reference/01_brand/cinema-still.svg');
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!c.user)
    return (
      <div className="home-page">
        <ConnectionPane />
      </div>
    );
  const voices = c.channels.filter((channel) => channel.type === 2),
    space = c.spaces.find((s) => s.id === c.activeSpaceId);
  const activityPath =
    primary?.activity === 'cinema'
      ? '/cinema'
      : primary?.activity === 'youtube'
        ? '/watch/youtube'
        : primary?.activity === 'screen'
          ? '/voice?view=share'
          : '/games';
  const currentDate =
    import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')
      ? new Date('2026-10-10T18:00:00Z')
      : new Date();
  const date = currentDate.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  if (c.busy || c.loadingMessages)
    return (
      <div className="reference-home" aria-busy="true">
        <div className="reference-home-skeleton">
          <i />
          <i />
        </div>
        <div className="reference-room-grid">
          {[1, 2, 3].map((id) => (
            <div key={id} className="reference-room-skeleton" />
          ))}
        </div>
        <p role="status">Aktif odalar yükleniyor…</p>
      </div>
    );
  if (!c.spaces.length)
    return (
      <div className="reference-home">
        <div className="reference-social-empty">
          <span>
            <ReferenceIcon name="home" size={38} />
          </span>
          <h2>Topluluk yok</h2>
          <button className="button primary" onClick={() => navigate('/setup/invite')}>
            Davet aç
          </button>
        </div>
      </div>
    );
  return (
    <div className="minimal-home">
      <h1>Odalar</h1>
      {c.channels.map((ch) => (
        <button
          key={ch.id}
          className="minimal-home-room"
          onClick={() => {
            navigate('/chat');
            void c.openChannel(ch.id).catch((error) => notify(uiError(error)));
            if (ch.type === 2)
              void joinVoice(ch.id, ch.name).catch((error) => notify(uiError(error)));
          }}
        >
          {ch.name}
        </button>
      ))}
      {!c.channels.length && <p>Soldan bir topluluk seç.</p>}
    </div>
  );
}
