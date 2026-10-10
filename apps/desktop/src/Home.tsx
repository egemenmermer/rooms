import { tr } from './i18n';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AudioLines, ChevronRight, Film, Moon, Play, Plus, Sparkles } from 'lucide-react';
import type { Overlay } from './App';
import { useCommunity } from './community';
import { useRealtime, joinVoice } from './realtime';
import { ConnectionPane } from './ConnectionPane';
export function Home({ open }: { open(value: Overlay): void }) {
  const c = useCommunity();
  if (!c.user) return <div className="home-page page-enter"><section className="hero welcome-hero"><div className="hero-scrim"/><div className="hero-copy"><span className="hero-kicker">SİZE ÖZEL BİR YER</span><h2>Dostlarınla.<br/><em>Her akşam.</em></h2><p>Topluluğuna giriş yap. Sohbetleriniz, ses odalarınız ve birlikte yapacaklarınız burada.</p></div></section><ConnectionPane/></div>;
  return <CommunityHome open={open}/>;
}
function CommunityHome({ open }: {
    open(value: Overlay): void;
}) {
    const c = useCommunity();
    const r = useRealtime();
    const navigate = useNavigate();
    const name = c.user?.displayName || c.user?.username || 'sen';
    const voices = c.channels.filter(ch => ch.type === 2);
    return <div className="home-page page-enter"><div className="page-intro"><div><span className="eyebrow">{tr("YOUR EVENING STARTS HERE")}</span><h2>{tr("Good evening,") + " "}{name}.</h2><p>{tr("A little less scrolling. A little more together.")}</p></div><div className="date-pill"><Moon size={15}/><span>{tr("Stay a while.")}</span></div></div><section className="hero"><img className="hero-art" src="./artwork/blue-hour.jpg" alt={tr("Original mountain valley at blue hour")}/><div className="hero-scrim"/><div className="hero-top"><span className="pill"><Film size={13}/>{tr("YOUR PRIVATE PLACE")}</span><span className="hero-preview">{tr("ÖZEL TOPLULUK")}</span></div><div className="hero-copy"><span className="hero-kicker">{tr("SOME NIGHTS ARE BETTER TOGETHER.")}</span><h2>{tr("Good company.")}<br /><em>{tr("Great stories.")}</em></h2><p>{tr("A place to catch up. A moment to slow down.")}<br />{tr("Make a little room for each other.")}</p><div className="hero-buttons"><button className="button primary" onClick={() => navigate('/voice')}><AudioLines size={16}/>{tr("Find your room")}<ArrowRight size={16}/></button><button className="button hero-secondary" onClick={() => navigate('/cinema')}><Play size={16}/>{tr("Dosya seç ve izle")}</button></div></div><div className="hero-bottom"><div className="hero-company"><span>{r.status === 'connected' ? `${r.roomName} · ${r.participants.length} kişi` : tr("An evening with your people")}<small>{r.status === 'connected' ? tr("Voice stays connected while you explore.") : tr("Private community \u00B7 presence unavailable")}</small></span></div><span className="hero-credit">{tr("ROOMS") + " "}<span>{tr("Original artwork")}</span></span></div></section><section className="tonight-section"><div className="section-heading"><div><h3>{tr("Make yourself at home")}</h3><span>{c.spaces.find(s => s.id === c.activeSpaceId)?.name ?? tr("Your community")}</span></div><button className="text-button" onClick={() => open('invite')}>{tr("Invite a friend")}<Plus size={14}/></button></div><div className="real-home-rooms">{voices.map(ch => <button key={ch.id} onClick={() => {
                navigate('/voice');
                if (r.channelId !== ch.id)
                    void joinVoice(ch.id, ch.name).catch(() => { });
            }}><span className="voice-action-icon"><AudioLines size={20}/></span><span><strong>{ch.name}</strong><small>{r.channelId === ch.id ? r.status === 'connected' ? `${r.participants.length} kişi odanda` : tr("Connecting\u2026") : tr("Open voice room \u00B7 join with mic off")}</small></span><ArrowRight size={16}/></button>)}{!voices.length && <button onClick={() => navigate('/chat')}><span className="voice-action-icon"><Sparkles size={20}/></span><span><strong>{tr("Start with a hello")}</strong><small>{tr("Open your private conversation")}</small></span><ArrowRight size={16}/></button>}<button onClick={() => open('launcher')}><span className="voice-action-icon"><Plus size={20}/></span><span><strong>{tr("Make a night of it")}</strong><small>{tr("Sinema, ortak anket veya oyun")}</small></span><ArrowRight size={16}/></button></div></section><section className="your-spaces-section"><div className="section-heading"><h3>{tr("Your little corners")}</h3><button className="text-button" onClick={() => navigate('/spaces')}>{tr("All spaces")}<ChevronRight size={14}/></button></div><div className="home-spaces">{c.spaces.slice(0, 3).map(s => <button key={s.id} onClick={() => { void c.openSpace(s.id); navigate('/chat'); }}><span className="space-symbol blue">{s.name.slice(0, 1)}</span><span><strong>{s.name}</strong><small>{tr("Your private community")}</small></span><ChevronRight size={15}/></button>)}</div></section><footer className="home-footer"><Sparkles size={12}/>{tr("The best part of tonight is who\u2019s on the other side.")}</footer></div>;
}
