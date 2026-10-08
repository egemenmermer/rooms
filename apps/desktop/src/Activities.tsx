import { tr } from './i18n';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Film, Gamepad2, Layers3, ListPlus, MonitorUp, Pencil, Plus, Search, Tv, Vote, Play } from 'lucide-react';
import { activityRegistry } from '@rooms/activities';
import { EmptyState, Modal } from '@rooms/design';
import { useRooms } from './store';
import { useCommunity } from './community';
const icons: Record<string, typeof Film> = { cinema: Film, youtube: Play, screen: MonitorUp, iptv: Tv, poll: Vote, quiz: Gamepad2, tier: Layers3, whiteboard: Pencil };
export function ActivityLauncher({ onClose }: {
    onClose(): void;
}) {
    const community = useCommunity(), navigate = useNavigate();
    const [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
    const catalog = [
        { id: 'cinema', label: 'Sinema', category: 'watch', icon: Film, description: tr("Ki\u015Fisel oynatma ve ortak oda kumandas\u0131."), path: '/cinema', tag: tr("Yerel film haz\u0131r") },
        { id: 'youtube', label: 'Birlikte YouTube', category: 'watch', icon: Play, description: tr("Resm\u00EE oynat\u0131c\u0131, herkesin kendi ekran\u0131nda."), path: '/youtube', tag: 'Ortak oda gerekir' },
        { id: 'screen', label: tr("Ekran payla\u015F\u0131m\u0131"), category: 'share', icon: MonitorUp, description: tr("Se\u00E7ti\u011Fin pencereyi ses odanla payla\u015F."), path: '/voice', tag: tr("Ger\u00E7ek ses odas\u0131 gerekir") },
        { id: 'iptv', label: tr("Ki\u015Fisel medya"), category: 'watch', icon: Tv, description: tr("Kendi IPTV, Xtream ve Real-Debrid ba\u011Flant\u0131lar\u0131n."), path: '/settings?tab=connections', tag: tr("Ki\u015Fisel kaynak ekle") },
        { id: 'poll', label: 'Ortak anket', category: 'together', icon: Vote, description: tr("Ak\u015Fam\u0131n karar\u0131n\u0131 hep beraber verin."), path: community.mode === 'real' ? '/together?tab=polls' : '/polls', tag: community.mode === 'real' ? 'Ortak oda gerekir' : tr("Yerel demo haz\u0131r") },
        { id: 'whiteboard', label: 'Beyaz tahta', category: 'together', icon: Pencil, description: tr("Birlikte \u00E7iz. Bir fikir, bir not b\u0131rak."), path: '/together?tab=board', tag: 'Ortak oda gerekir' },
        { id: 'games', label: tr("Oyun masas\u0131"), category: 'play', icon: Gamepad2, description: 'Hold’em, Blackjack, Batak ve 101. Sanal puanlarla.', path: '/games', tag: tr("Masay\u0131 ke\u015Ffet") },
        { id: 'agent', label: tr("Oda yard\u0131mc\u0131s\u0131"), category: 'together', icon: Layers3, description: tr("Kendi modelinle g\u00F6revler, sonu\u00E7lar ve oda haf\u0131zas\u0131."), path: '/agent', tag: tr("Ayr\u0131 sunucu gerekir") },
    ];
    return <Modal title={tr("Bu ak\u015Fam birlikte.")} onClose={onClose} className="launcher-modal"><p className="modal-description">{tr("Ayn\u0131 dostlar. Birlikte yapacak yeni \u015Feyler.")}</p><div className="launcher-search"><Search size={17}/><input autoFocus aria-label="Etkinlik ara" placeholder={tr("Bu ak\u015Fam ne yapal\u0131m?")} value={query} onChange={e => setQuery(e.target.value)}/></div><div className="segmented" aria-label="Etkinlik kategorileri">{[{ id: 'all', label: tr("T\u00FCm\u00FC") }, { id: 'watch', label: tr("\u0130zle") }, { id: 'share', label: tr("Payla\u015F") }, { id: 'play', label: 'Oyna' }, { id: 'together', label: 'Birlikte' }].map(c => <button key={c.id} aria-pressed={filter === c.id} className={filter === c.id ? 'selected' : ''} onClick={() => setFilter(c.id)}>{c.label}</button>)}</div><div className="activity-grid">{catalog.filter(a => (filter === 'all' || a.category === filter) && (a.label + a.description).toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))).map(a => <button className="activity-tile ready" key={a.id} onClick={() => { navigate(a.path); onClose(); }}><span className={`activity-icon ${a.id}`}><a.icon size={25}/></span><strong>{a.label}</strong><p>{a.description}</p><span className="availability local">{a.tag}<ArrowRight size={13}/></span></button>)}</div><p className="modal-footnote">{tr("Etkinlikler de\u011Fi\u015Fir. Ses odan\u0131z a\u00E7\u0131k kal\u0131r.")}</p></Modal>;
}
export function Polls() {
    const { polls, activeSpace, createPoll, vote } = useRooms();
    const [show, setShow] = useState(false);
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);
    const close = useCallback(() => setShow(false), []);
    const current = polls.filter(p => p.roomId === activeSpace);
    return <div className="polls-page page-enter"><div className="page-intro"><div><span className="eyebrow">{tr("TOGETHER / LOCAL ACTIVITY")}</span><h2>{tr("Everyone gets a say.")}</h2><p>{tr("Big plans start with a small decision.")}</p></div><button className="button primary" onClick={() => setShow(true)}><Plus size={16}/>{tr("Create a poll")}</button></div>{current.length === 0 ? <EmptyState icon={<Vote size={34}/>} title={tr("What should we do tonight?")}>{tr("Ask a question. Add a few options. Make a little plan.")}<button className="button primary" onClick={() => setShow(true)}>{tr("Create your first poll")}<ArrowRight size={16}/></button></EmptyState> : <div className="poll-list">{current.map(p => {
                if (p.payload.type !== 'poll')
                    return null;
                const payload = p.payload;
                const counts = Object.values(payload.votes);
                return <section className="poll-card" key={p.id}><span className="eyebrow">{tr("LOCAL POLL / REVISION") + " "}{p.revision}</span><h3>{payload.question}</h3>{payload.options.map(o => <button key={o.id} className={`poll-option ${payload.votes['local-user'] === o.id ? 'voted' : ''}`} onClick={() => vote(p.id, o.id)}><span className="poll-progress" style={{ width: `${counts.length ? (counts.filter(v => v === o.id).length / counts.length) * 100 : 0}%` }}/><span className="poll-option-label">{payload.votes['local-user'] === o.id ? <Check size={16}/> : <span className="poll-radio"/>}{o.label}</span><span>{counts.filter(v => v === o.id).length}</span></button>)}<p>{counts.length}{" " + tr("local vote") + ""}{" " + tr("\u00B7 You can change your mind.") + ""}</p></section>;
            })}</div>}<div className="activity-explainer"><ListPlus size={21}/><div><h4>{tr("A small Activity. A bigger foundation.")}</h4><p>{tr("This poll uses the versioned Activity contract. Votes are local to this device; shared voting requires the Activity service.")}</p></div></div>{show && <Modal title={tr("Put it to the room.")} onClose={close}><form onSubmit={e => {
                e.preventDefault();
                if (question.trim() && options.every(o => o.trim())) {
                    createPoll(question.trim(), options.map(o => o.trim()));
                    setQuestion('');
                    setOptions(['', '']);
                    close();
                }
            }}><label className="field-label">{tr("YOUR QUESTION")}<input autoFocus required aria-label={tr("Poll question")} maxLength={120} placeholder={tr("What are we watching tonight?")} value={question} onChange={e => setQuestion(e.target.value)}/></label><span className="field-label">{tr("THE OPTIONS")}</span>{options.map((o, i) => <input className="option-input" key={i} required aria-label={`Anket seçeneği ${i + 1}`} maxLength={80} placeholder={`Seçenek ${i + 1}`} value={o} onChange={e => setOptions(a => a.map((v, j) => j === i ? e.target.value : v))}/>)}{options.length < 6 && <button type="button" className="text-button add-option" onClick={() => setOptions(a => [...a, ''])}><Plus size={14}/>{tr("Add an option")}</button>}<button className="button primary full" disabled={!question.trim() || options.some(o => !o.trim())}>{tr("Start local poll")}<ArrowRight size={16}/></button></form></Modal>}</div>;
}
