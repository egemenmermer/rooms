import { useNavigate } from 'react-router-dom';
import { ArrowRight, AudioLines, Plus } from 'lucide-react';
import type { Overlay } from './App';
import { useCommunity } from './community';
import { useRealtime, joinVoice } from './realtime';
import { ConnectionPane } from './ConnectionPane';
export function Home({ open }: { open(value: Overlay): void }) {
  const c = useCommunity(), r = useRealtime(), navigate = useNavigate();
  if (!c.user) return <div className="home-page page-enter"><ConnectionPane/></div>;
  const voices = c.channels.filter(ch => ch.type === 2);
  return <div className="home-page page-enter"><div className="page-intro"><h2>{c.spaces.find(s => s.id === c.activeSpaceId)?.name ?? 'Topluluk'}</h2><button className="button secondary small" onClick={() => open('launcher')}><Plus size={16}/>Etkinlik başlat</button></div>
    <section><div className="section-heading"><h3>Ses odaları</h3></div><div className="real-home-rooms">{voices.map(ch => <button key={ch.id} onClick={() => { navigate('/voice'); if (r.channelId !== ch.id) void joinVoice(ch.id,ch.name).catch(() => {}); }}><span className="voice-action-icon"><AudioLines size={20}/></span><span><strong>{ch.name}</strong>{r.channelId === ch.id && <small>{r.status === 'connected' ? `${r.participants.length} kişi` : 'Bağlanıyor'}</small>}</span><ArrowRight size={16}/></button>)}</div>{!voices.length && <p className="muted">Ses odası yok.</p>}</section>
    <section className="your-spaces-section"><div className="section-heading"><h3>Topluluklar</h3><button className="text-button" onClick={() => open('invite')}>Davet<Plus size={14}/></button></div><div className="home-spaces">{c.spaces.map(s => <button key={s.id} onClick={() => { void c.openSpace(s.id); navigate('/chat'); }}><span className="space-symbol blue">{s.name.slice(0,1)}</span><strong>{s.name}</strong><ArrowRight size={15}/></button>)}</div></section>
  </div>;
}
