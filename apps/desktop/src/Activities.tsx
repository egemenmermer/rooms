import { tr } from './i18n';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Film, Gamepad2, Layers3, ListPlus, MonitorUp, Pencil, Plus, Search, Tv, Vote, Play } from 'lucide-react';
import { activityRegistry } from '@rooms/activities';
import { EmptyState, Modal } from '@rooms/design';
import { useCommunity } from './community';
const icons: Record<string, typeof Film> = { cinema: Film, youtube: Play, screen: MonitorUp, iptv: Tv, poll: Vote, quiz: Gamepad2, tier: Layers3, whiteboard: Pencil };
export function ActivityLauncher({ onClose }: {
    onClose(): void;
}) {
    const community = useCommunity(), navigate = useNavigate();
    const [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
    const catalog = [
        { id: 'cinema', label: 'Sinema', category: 'watch', icon: Film, description: tr("Kendi dosyanı bu cihazda oynat. Birlikte izlemek için YouTube veya ekran paylaşımı kullan."), path: '/cinema', tag: 'Kendi dosyanı seç' },
        { id: 'youtube', label: 'Birlikte YouTube', category: 'watch', icon: Play, description: tr("Resm\u00EE oynat\u0131c\u0131, herkesin kendi ekran\u0131nda."), path: '/youtube', tag: 'Ortak oda gerekir' },
        { id: 'screen', label: tr("Ekran payla\u015F\u0131m\u0131"), category: 'share', icon: MonitorUp, description: tr("Se\u00E7ti\u011Fin pencereyi ses odanla payla\u015F."), path: '/voice', tag: tr("Ger\u00E7ek ses odas\u0131 gerekir") },
        { id: 'iptv', label: tr("Ki\u015Fisel medya"), category: 'watch', icon: Tv, description: tr("Kendi IPTV, Xtream ve Real-Debrid ba\u011Flant\u0131lar\u0131n."), path: '/settings?tab=connections', tag: tr("Ki\u015Fisel kaynak ekle") },
        { id: 'poll', label: 'Ortak anket', category: 'together', icon: Vote, description: "", path: '/together?tab=polls', tag: 'Ortak oda gerekir' },
        { id: 'whiteboard', label: 'Beyaz tahta', category: 'together', icon: Pencil, description: "", path: '/together?tab=board', tag: 'Ortak oda gerekir' },
        { id: 'games', label: tr("Oyun masas\u0131"), category: 'play', icon: Gamepad2, description: 'Hold’em, Blackjack, Batak ve 101. Sanal puanlarla.', path: '/games', tag: tr("Masay\u0131 ke\u015Ffet") },
        { id: 'agent', label: tr("Oda yard\u0131mc\u0131s\u0131"), category: 'together', icon: Layers3, description: tr("Kendi modelinle g\u00F6revler, sonu\u00E7lar ve oda haf\u0131zas\u0131."), path: '/agent', tag: tr("Ayr\u0131 sunucu gerekir") },
    ];
    return <Modal title={"Etkinlikler"} onClose={onClose} className="launcher-modal"><div className="launcher-search"><Search size={17}/><input autoFocus aria-label="Etkinlik ara" placeholder={"Ba\u015Fl\u0131k"} value={query} onChange={e => setQuery(e.target.value)}/></div><div className="segmented" aria-label="Etkinlik kategorileri">{[{ id: 'all', label: tr("T\u00FCm\u00FC") }, { id: 'watch', label: tr("\u0130zle") }, { id: 'share', label: tr("Payla\u015F") }, { id: 'play', label: 'Oyna' }, { id: 'together', label: 'Birlikte' }].map(c => <button key={c.id} aria-pressed={filter === c.id} className={filter === c.id ? 'selected' : ''} onClick={() => setFilter(c.id)}>{c.label}</button>)}</div><div className="activity-grid">{catalog.filter(a => (filter === 'all' || a.category === filter) && (a.label + a.description).toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))).map(a => <button className="activity-tile ready" key={a.id} onClick={() => { navigate(a.path); onClose(); }}><span className={`activity-icon ${a.id}`}><a.icon size={25}/></span><strong>{a.label}</strong><span className="availability local">{a.tag}<ArrowRight size={13}/></span></button>)}</div></Modal>;
}
