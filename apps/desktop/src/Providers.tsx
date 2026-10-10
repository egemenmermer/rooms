import { tr, uiError } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, ExternalLink, Film, FolderOpen, KeyRound, Link2, LoaderCircle, Play, Plus, RefreshCw, Search, ShieldCheck, Star, Trash2, Tv, X } from 'lucide-react';
import Hls from 'hls.js';
import { EmptyState, IconButton, Modal } from '@rooms/design';
import type { PersonalChannel, PersonalLibraryItem, ProviderConnection } from '../electron/provider-contracts';
const errorMessage = uiError;
export function PersonalProviders({ notify }: {
    notify(message: string): void;
}) {
    const [connections, setConnections] = useState<ProviderConnection[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState<'playlist' | 'xtream' | 'rd' | null>(null), [name, setName] = useState(''), [url, setUrl] = useState(''), [xmltv, setXmltv] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState(''), [auth, setAuth] = useState<{
        userCode: string;
        verificationUrl: string;
        expiresAt: string;
        interval: number;
    } | null>(null), [selected, setSelected] = useState<ProviderConnection | null>(null), [channels, setChannels] = useState<PersonalChannel[]>([]), [library, setLibrary] = useState<PersonalLibraryItem[]>([]), [query, setQuery] = useState(''), [favorites, setFavorites] = useState(false), [media, setMedia] = useState<{
        url: string;
        name: string;
        live: boolean;
        startAt?: number;
    } | null>(null);
    const [guide, setGuide] = useState<{
        channel: string;
        programs: {
            title: string;
            description: string;
            startsAt: string;
            endsAt: string;
        }[];
    } | null>(null);
    const refresh = useCallback(async () => {
        if (!window.rooms?.providers)
            return;
        try {
            setConnections(await window.rooms.providers.status());
        }
        catch (e) {
            setError(errorMessage(e));
        }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    const run = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError('');
        try {
            await work();
            await refresh();
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    };
    const close = useCallback(() => { setShow(null); setUrl(''); setXmltv(''); setPassword(''); setUsername(''); setAuth(null); }, []);
    useEffect(() => {
        if (!auth || show !== 'rd')
            return;
        let stopped = false;
        const timer = setInterval(() => {
            if (Date.now() > new Date(auth.expiresAt).getTime()) {
                setAuth(null);
                setError(tr("Yetkilendirme kodunun s\u00FCresi doldu. Yeni kod al."));
                return;
            }
            void window.rooms?.providers.rdPoll().then(async (s) => {
                if (stopped)
                    return;
                if (s.state === 'connected') {
                    close();
                    await refresh();
                    notify(tr("Ki\u015Fisel Real-Debrid hesab\u0131n ba\u011Fland\u0131."));
                }
                else if (s.state === 'expired') {
                    setAuth(null);
                    setError(tr("Yetkilendirme s\u00FCresi doldu. Yeniden ba\u015Flat."));
                }
            }).catch(e => {
                if (!stopped)
                    setError(errorMessage(e));
            });
        }, Math.max(5000, auth.interval * 1000));
        return () => { stopped = true; clearInterval(timer); };
    }, [auth, show, close, refresh, notify]);
    const openLibrary = async (connection: ProviderConnection) => {
        setSelected(connection);
        setGuide(null);
        setQuery('');
        setChannels([]);
        setLibrary([]);
        await run(async () => {
            if (connection.type === 'real-debrid')
                setLibrary(await window.rooms!.providers.rdLibrary());
            else
                setChannels(await window.rooms!.providers.channels(connection.id));
        });
    };
    return <section className="personal-connections"><div className="section-heading"><div><h3>{"Medya ba\u011Flant\u0131lar\u0131"}</h3><span>{""}</span></div><IconButton label={tr("Medya ba\u011Flant\u0131lar\u0131n\u0131 yenile")} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/></IconButton></div>
 <div className="provider-options">{[{ id: 'playlist' as const, title: 'Oynatma listesi', detail: tr("Kendi M3U / M3U8 kayna\u011F\u0131n"), icon: Tv }, { id: 'xtream' as const, title: 'Xtream', detail: tr("Ki\u015Fisel sa\u011Flay\u0131c\u0131 hesab\u0131n"), icon: Link2 }, { id: 'rd' as const, title: 'Real-Debrid', detail: tr("Kendi yetkili medya ar\u015Fivin"), icon: FolderOpen }].map(p => <button className="provider-option" key={p.id} disabled={!window.rooms?.providers} title={!window.rooms?.providers ? tr("Masa\u00FCst\u00FC uygulamas\u0131 gerekli") : ''} onClick={() => { setError(''); setShow(p.id); }}><p.icon size={21}/><strong>{p.title}</strong><small>{p.detail}</small><Plus size={14}/></button>)}</div>
 {connections.map(c => <div className="model-row provider-row" key={c.id}><span className="model-mark"><Tv size={20}/></span><div><strong>{c.name}</strong><small>{c.type === 'real-debrid' ? tr("Ki\u015Fisel ar\u015Fiv") : `${c.channelCount} kanal`} · {c.status === 'connected' ? tr("Ba\u011Fl\u0131") : c.status === 'auth-expired' ? tr("Yetkilendirme s\u00FCresi doldu") : tr("Ba\u011Flant\u0131 hatas\u0131")}</small></div><button className="button secondary small" disabled={busy || c.status !== 'connected'} onClick={() => void openLibrary(c)}>{c.type === 'real-debrid' ? tr("Ar\u015Fivi a\u00E7") : tr("Kanallar\u0131 a\u00E7")}<ArrowRight size={14}/></button><IconButton label={`${c.name} bağlantısını kaldır`} disabled={busy} onClick={() => void run(() => window.rooms!.providers.disconnect(c.id))}><Trash2 size={15}/></IconButton></div>)}
 {error && <div className="error-pane" role="alert">{error}</div>}
 {show && <Modal title={show === 'rd' ? "Real-Debrid ba\u011Fla" : "Kaynak ekle"} onClose={close} className="provider-modal">{show === 'rd' ? <><p className="modal-description">{tr("Resm\u00EE Real-Debrid yetkilendirmesi ile yaln\u0131zca kendi hesab\u0131na ba\u011Flan.")}</p>{auth ? <div className="device-auth"><KeyRound size={30}/><span>{tr("YETK\u0130LEND\u0130RME KODUN")}</span><strong>{auth.userCode}</strong><p>{tr("Kodu resm\u00EE yetkilendirme sayfas\u0131na gir. ROOMS ba\u011Flant\u0131y\u0131 burada kontrol eder.")}</p><a className="button primary" href={auth.verificationUrl} target="_blank" rel="noreferrer">{tr("Yetkilendirme sayfas\u0131")}<ExternalLink size={15}/></a><small><LoaderCircle size={13} className="spin"/>{tr("Onay\u0131n bekleniyor \u00B7")}{new Date(auth.expiresAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}{tr("sonuna kadar")}</small></div> : <button className="button primary full" disabled={busy} onClick={() => void run(async () => setAuth(await window.rooms!.providers.rdStart()))}>{busy ? <LoaderCircle size={16} className="spin"/> : <KeyRound size={16}/>}{tr("Yetkilendirmeyi ba\u015Flat")}</button>}</> : <form onSubmit={e => {
                    e.preventDefault();
                    void run(async () => {
                        if (show === 'playlist')
                            await window.rooms!.providers.connectPlaylist({ name: name.trim(), url: url.trim(), ...(xmltv.trim() ? { xmltvUrl: xmltv.trim() } : {}) });
                        else
                            await window.rooms!.providers.connectXtream({ name: name.trim(), serverUrl: url.trim(), username, password });
                        close();
                        setName('');
                        notify(tr("Ki\u015Fisel kayna\u011F\u0131n eklendi."));
                    });
                }}><label className="field-label">{tr("BA\u011ELANTI ADI")}<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={"Kaynak ad\u0131"} required maxLength={80}/></label><label className="field-label">{show === 'playlist' ? tr("YETK\u0130L\u0130 M3U / M3U8 ADRES\u0130") : tr("SA\u011ELAYICI ADRES\u0130")}<input type="password" value={url} onChange={e => setUrl(e.target.value)} autoComplete="off" required placeholder="https://…"/></label>{show === 'playlist' ? <label className="field-label">{tr("PROGRAM REHBER\u0130 \u00B7 \u0130STE\u011EE BA\u011ELI")}<input type="password" value={xmltv} onChange={e => setXmltv(e.target.value)} autoComplete="off" placeholder="XMLTV adresi"/></label> : <><label className="field-label">{tr("KULLANICI ADI")}<input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="off"/></label><label className="field-label">{tr("PAROLA")}<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password"/></label></>}<p className="modal-footnote">{tr("Yaln\u0131zca izleme yetkin olan ki\u015Fisel kayna\u011F\u0131n\u0131 ekle. Oynatma ve bi\u00E7im deste\u011Fi kayna\u011F\u0131na g\u00F6re de\u011Fi\u015Fir.")}</p><button className="button primary full" disabled={busy || !name.trim() || !url.trim()}>{busy ? <LoaderCircle size={16} className="spin"/> : <Plus size={16}/>}{tr("Kayna\u011F\u0131 ekle")}</button></form>}{error && <div className="error-pane" role="alert">{error}</div>}</Modal>}
 {selected && <Modal title={selected.name} onClose={() => { setSelected(null); setMedia(null); }} className="personal-library-modal">{media ? <PersonalPlayer media={media} notify={notify} onClose={() => setMedia(null)}/> : <><div className="library-toolbar"><div className="launcher-search"><Search size={16}/><input aria-label={tr("Ki\u015Fisel i\u00E7erik ara")} value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("Kanal veya i\u00E7erik ara\u2026")}/></div>{selected.type !== 'real-debrid' && <button className={`button secondary small ${favorites ? 'selected' : ''}`} onClick={() => setFavorites(v => !v)}><Star size={15} fill={favorites ? 'currentColor' : 'none'}/>{tr("Favoriler")}</button>}</div>{guide && <section className="program-guide"><div className="section-heading"><h3>{guide.channel} · Program rehberi</h3><IconButton label="Program rehberini kapat" onClick={() => setGuide(null)}><X size={14}/></IconButton></div>{guide.programs.length ? guide.programs.map((p, i) => <article key={i}><time>{new Date(p.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} – {new Date(p.endsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</time><div><strong>{p.title}</strong><p>{p.description}</p></div></article>) : <p>Bu kanal için program bilgisi bulunamadı. Kaynağına ait XMLTV rehberini bağlantı ayarlarına ekleyebilirsin.</p>}</section>}<div className="personal-channel-list">{busy && <div className="inline-empty"><LoaderCircle className="spin" size={23}/><p>{tr("Ki\u015Fisel i\u00E7eriklerin y\u00FCkleniyor\u2026")}</p></div>}{channels.filter(c => (!favorites || c.favorite) && (c.name + c.group).toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))).map(c => <div className="personal-channel" key={c.id}><button disabled={busy} onClick={() => void run(async () => setMedia(await window.rooms!.providers.play(selected.id, c.id)))}><span className="channel-symbol"><Tv size={18}/></span><span><strong>{c.name}</strong><small>{c.group || tr("Ki\u015Fisel kanal")}</small></span><Play size={16}/></button><IconButton label="Program rehberini aç" disabled={busy} onClick={() => void run(async () => setGuide({ channel: c.name, programs: await window.rooms!.providers.epg(selected.id, c.id) }))}><Clock3 size={16}/></IconButton><IconButton label={c.favorite ? tr("Favorilerden \u00E7\u0131kar") : 'Favorilere ekle'} disabled={busy} onClick={() => void run(async () => { await window.rooms!.providers.favorite(selected.id, c.id, !c.favorite); setChannels(a => a.map(x => x.id === c.id ? { ...x, favorite: !x.favorite } : x)); })}><Star size={16} fill={c.favorite ? 'currentColor' : 'none'}/></IconButton></div>)}{library.filter(i => i.name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))).map(item => <button className="personal-library-item" key={item.id} disabled={busy} onClick={() => void run(async () => setMedia(await window.rooms!.providers.rdPlay(item.id)))}><Film size={20}/><span><strong>{item.name}</strong><small>{(item.size / 1024 / 1024).toFixed(1)}{tr("MB")}</small></span><Play size={17}/></button>)}{!busy && !channels.length && !library.length && <div className="inline-empty"><FolderOpen size={30}/><p>{tr("Bu kaynakta listelenecek i\u00E7erik bulunamad\u0131.")}</p></div>}</div></>}{error && <div className="error-pane" role="alert">{error}</div>}<p className="modal-footnote"><ShieldCheck size={13}/>{tr("Ki\u015Fisel oynatma \u00B7 di\u011Fer \u00FCyelerle payla\u015F\u0131lmaz")}</p></Modal>}
 </section>;
}
function PersonalPlayer({ media, onClose, notify }: {
    media: {
        url: string;
        name: string;
        live: boolean;
        startAt?: number;
    };
    onClose(): void;
    notify(message: string): void;
}) {
    const ref = useRef<HTMLVideoElement>(null);
    const lastSave = useRef(0), completed = useRef(false);
    const savePosition = useCallback((force = false) => {
        const video = ref.current;
        if (!video || media.live || !window.rooms?.providers || !video.readyState)
            return;
        const now = Date.now();
        if (!force && now - lastSave.current < 5000)
            return;
        lastSave.current = now;
        void window.rooms.providers.saveResume(media.url, completed.current ? 0 : video.currentTime).catch(e => notify(uiError(e)));
    }, [media.url, media.live, notify]);
    useEffect(() => { completed.current = false; lastSave.current = 0; const video = ref.current; return () => { if (video?.readyState && !media.live)
        void window.rooms?.providers.saveResume(media.url, completed.current ? 0 : video.currentTime).catch(e => notify(uiError(e))); }; }, [media.url, media.live, notify]);
    const [error, setError] = useState(''), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const video = ref.current;
        if (!video)
            return;
        setError('');
        setLoading(true);
        let hls: Hls | null = null;
        if (Hls.isSupported()) {
            hls = new Hls({ enableWorker: true });
            hls.loadSource(media.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => setLoading(false));
            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
                        hls?.destroy();
                        hls = null;
                        video.src = media.url;
                    }
                    else {
                        setLoading(false);
                        setError(tr("Ki\u015Fisel kaynak oynat\u0131lamad\u0131. Kaynak \u00E7evrimd\u0131\u015F\u0131, yetkilendirme s\u00FCresi dolmu\u015F veya medya bi\u00E7imi desteklenmiyor olabilir."));
                    }
                }
            });
        }
        else
            video.src = media.url;
        return () => { hls?.destroy(); video.pause(); video.removeAttribute('src'); video.load(); };
    }, [media.url, attempt]);
    return <div className="personal-player"><div className="section-heading"><div><span className="eyebrow">{media.live ? tr("K\u0130\u015E\u0130SEL CANLI YAYIN") : tr("K\u0130\u015E\u0130SEL MEDYA")}</span><h3>{media.name}</h3></div><button className="button secondary small" onClick={onClose}>{tr("Listeye d\u00F6n")}</button></div><div className="personal-player-stage"><video ref={ref} controls playsInline onLoadedMetadata={() => { const video = ref.current; if (video && !media.live && media.startAt && Number.isFinite(video.duration) && media.startAt < video.duration - 2)
        video.currentTime = media.startAt; }} onTimeUpdate={() => savePosition()} onPause={() => savePosition(true)} onEnded={() => { completed.current = true; savePosition(true); }} onPlay={() => { completed.current = false; }} onLoadedData={() => setLoading(false)} onCanPlay={() => setLoading(false)} onError={() => { setLoading(false); setError(tr("Bu kaynak veya medya bi\u00E7imi oynat\u0131lam\u0131yor. Yetkili kayna\u011F\u0131n\u0131 ve ba\u011Flant\u0131n\u0131 kontrol et.")); }} aria-label={tr("Ki\u015Fisel medya oynat\u0131c\u0131s\u0131")}/>{loading && !error && <div className="personal-player-loading"><LoaderCircle size={28} className="spin"/><span>{tr("Kaynak haz\u0131rlan\u0131yor\u2026")}</span></div>}</div>{error && <div className="error-pane" role="alert"><p>{error}</p><button className="button secondary small" onClick={() => setAttempt(v => v + 1)}><RefreshCw size={14}/>{tr("Yeniden dene")}</button></div>}</div>;
}
