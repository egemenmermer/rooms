import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SocialMember } from '@rooms/social';
import { IconButton } from '@rooms/design';
import { useCommunity } from './community';
import { useRealtime } from './realtime';
import { VoiceAvatar } from './VoiceAvatar';
import { ReferenceIcon } from './ReferenceIcon';
import { uiError } from './i18n';

export function RoomMembers({ onClose, notify }: { onClose(): void; notify(message: string): void }) {
  const c = useCommunity(), media = useRealtime(), navigate = useNavigate();
  const [members, setMembers] = useState<SocialMember[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    setMembers([]); setError(''); setLoading(true);
    const refresh = async () => {
      try {
        let next: SocialMember[] = [];
        if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
          const fixture = await import('./dev/reference-fixtures');
          next = fixture.getReferenceFriends().map(f => ({ user: f.user, status: f.status, statusText: fixture.getReferencePresenceText(f.user.id), roles: [] }));
          if (c.user) next.unshift({ user: c.user, status: 'online', statusText: 'Buradayım', roles: [] });
        } else if (c.activeSpaceId && window.rooms) {
          next = await window.rooms.social.members(c.activeSpaceId);
        }
        if (!disposed) { setMembers(next); setError(''); }
      } catch (failure) { if (!disposed) setError(uiError(failure)); }
      finally { if (!disposed) setLoading(false); }
    };
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { disposed = true; clearInterval(timer); };
  }, [c.activeSpaceId, c.user?.id]);
  const visible = members.map(member => ({ ...member, status: c.status === 'connected' ? c.presence[member.user.id] ?? member.status : 'unknown' }));
  const online = visible.filter(m => ['online', 'idle', 'dnd'].includes(m.status));
  const offline = visible.filter(m => m.status === 'invisible');
  const unknown = visible.filter(m => m.status === 'unknown');
  const group = (label: string, rows: typeof visible) => rows.length > 0 && <section className="room-member-group"><h6>{label} — {rows.length}</h6>{rows.map(member => {
    const participant = media.participants.find(p => p.id === member.user.id);
    return <button className={`room-member-row ${member.status === 'invisible' ? 'offline' : ''}`} key={member.user.id} onClick={() => {
      if (member.user.id === c.user?.id) navigate('/settings?tab=profile');
      else void c.createDM(member.user.id).then(() => navigate('/chat')).catch(e => notify(uiError(e)));
    }}><span className="room-member-photo"><VoiceAvatar id={member.user.id} name={member.user.displayName}/><i className={`member-presence ${member.status}`} aria-label={member.status === 'online' ? 'Çevrimiçi' : member.status === 'invisible' ? 'Çevrimdışı' : member.status === 'unknown' ? 'Durum bilinmiyor' : 'Uzakta'}/></span><span><strong>{member.user.displayName || member.user.username}{member.user.id === c.user?.id && <small>sen</small>}</strong><em>{member.statusText || (participant ? participant.muted ? 'Mikrofon kapalı' : participant.speaking ? 'Konuşuyor' : media.roomName : member.statusText || (member.status === 'invisible' ? 'Çevrimdışı' : member.status === 'unknown' ? 'Durum bilinmiyor' : 'Çevrimiçi'))}</em></span></button>;
  })}</section>;
  return <aside className="room-members-panel"><header><span>ODA ÜYELERİ</span><IconButton label="Üye panelini kapat" onClick={onClose}><ReferenceIcon name="close" size={18}/></IconButton></header><div className="room-members-body">{loading && <p role="status">Üyeler yükleniyor…</p>}{group('ÇEVRİMİÇİ', online)}{group('ÇEVRİMDIŞI', offline)}{group('DURUM BİLİNMİYOR', unknown)}{!loading && !members.length && !error && <p>Üye yok.</p>}{error && <p role="alert" className="friends-error">{error}</p>}</div></aside>;
}
