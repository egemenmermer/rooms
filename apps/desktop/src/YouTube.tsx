import { tr } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, ExternalLink, Film, ListVideo, LoaderCircle, Pause, Play, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { EmptyState, IconButton } from '@rooms/design';
import { useActivityRoom } from './activity';
import { useCurrentRoom } from './Agent';
import type { ActivityCommand } from '../../../packages/activity-protocol/src';
function parseVideo(value: string) { if (/^[\w-]{11}$/.test(value))
    return value; try {
    const u = new URL(value);
    if (u.hostname === 'youtu.be')
        return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
        const id = u.searchParams.get('v') ?? u.pathname.split('/').at(-1);
        return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
}
catch { } return null; }
export default function YouTube() {
    const roomId = useCurrentRoom(), a = useActivityRoom(roomId), navigate = useNavigate();
    const [url, setUrl] = useState(''), [title, setTitle] = useState(''), [error, setError] = useState(''), [player, setPlayer] = useState<{
        url: string;
        nonce: string;
    } | null>(null), [ready, setReady] = useState(false), [blocked, setBlocked] = useState(false), [position, setPosition] = useState(0);
    const frame = useRef<HTMLIFrameElement>(null), applying = useRef(0), latest = useRef(a.room), serverOffset = useRef(a.serverOffsetMs);
    latest.current = a.room;
    serverOffset.current = a.serverOffsetMs;
    const active = a.room?.queue.find(i => i.id === a.room?.timeline.itemId);
    const videoId = active?.media.kind === 'youtube' ? active.media.videoId : null;
    const send = useCallback((command: ActivityCommand) => void a.send(command).catch(() => { }), [a.send]);
    const playerCommand = useCallback((action: 'play' | 'pause' | 'seek' | 'position', positionSec?: number) => { if (player)
        frame.current?.contentWindow?.postMessage({ type: 'rooms-youtube-command', nonce: player.nonce, action, positionSec }, new URL(player.url).origin); }, [player]);
    useEffect(() => { let stale = false; setPlayer(null); setReady(false); setError(''); if (videoId)
        void window.rooms?.activity.youtubePlayer(videoId).then(value => { if (!stale)
            setPlayer(value); }).catch(e => { if (!stale)
            setError(e.message); }); return () => { stale = true; }; }, [videoId]);
    useEffect(() => { if (!player)
        return; const listener = (event: MessageEvent) => { if (event.source !== frame.current?.contentWindow || event.origin !== new URL(player.url).origin || event.data?.type !== 'rooms-youtube' || event.data.nonce !== player.nonce)
        return; const { event: kind, data } = event.data; if (kind === 'ready') {
        setReady(true);
        setBlocked(false);
    }
    else if (kind === 'error') {
        setError(`YouTube bu videoyu oynatamadı (kod ${Number(data?.code) || '—'}). Video gömülü oynatmaya kapalı veya bu bölgede kullanılamıyor olabilir.`);
    }
    else if (kind === 'autoplay-blocked')
        setBlocked(true);
    else if (kind === 'position' && Number.isFinite(data?.positionSec)) {
        setPosition(data.positionSec);
    }
    else if (kind === 'state' && Number.isFinite(data?.positionSec) && [0, 1, 2].includes(data?.state)) {
        setPosition(data.positionSec);
        if (Date.now() > applying.current && latest.current?.primary?.activity === 'youtube') {
            const playing = data.state === 1;
            const timeline = latest.current.timeline;
            const expectedPosition = timeline.positionSec + (timeline.playing ? Math.max(0, Date.now() + serverOffset.current - timeline.effectiveServerTimeMs) / 1000 * timeline.rate : 0);
            if (playing !== timeline.playing || Math.abs(data.positionSec - expectedPosition) > 3)
                send({ type: 'playback', playing, positionSec: data.positionSec, rate: 1 });
        }
    } }; window.addEventListener('message', listener); return () => window.removeEventListener('message', listener); }, [player, send]);
    const synchronize = useCallback(() => { const timeline = latest.current?.timeline; if (!ready || !timeline)
        return; applying.current = Date.now() + 1800; const expected = timeline.positionSec + (timeline.playing ? Math.max(0, Date.now() + serverOffset.current - timeline.effectiveServerTimeMs) / 1000 * timeline.rate : 0); playerCommand('seek', expected); playerCommand(timeline.playing ? 'play' : 'pause'); }, [ready, playerCommand]);
    useEffect(() => { synchronize(); }, [a.room?.timeline.epoch, a.room?.timeline.effectiveServerTimeMs, synchronize]);
    useEffect(() => { if (!ready)
        return; const timer = setInterval(() => playerCommand('position'), 1500); return () => clearInterval(timer); }, [ready, playerCommand]);
    const add = async () => { const id = parseVideo(url.trim()); if (!id) {
        setError(tr("Ge\u00E7erli bir YouTube video adresi veya 11 karakterli video kimli\u011Fi gir."));
        return;
    } setError(''); try {
        if (!a.room?.primary)
            await a.send({ type: 'start', activity: 'youtube', title: 'Birlikte YouTube' });
        await a.send({ type: 'queue.add', itemId: crypto.randomUUID(), media: { kind: 'youtube', videoId: id, title: title.trim() || `YouTube · ${id}` } });
        setUrl('');
        setTitle('');
    }
    catch { } };
    return <div className="youtube-page page-enter"><div className="page-intro"><div><span className="eyebrow">{tr("AYNI V\u0130DEO. AYNI AN.")}</span><h2>{tr("Birlikte YouTube.")}</h2><p>{tr("Herkes kendi resm\u00EE oynat\u0131c\u0131s\u0131yla izler. Kumanda odan\u0131z\u0131n.")}</p></div><span className="small-tag">{tr("BA\u011EIMSIZ OYNATMA")}</span></div>{!roomId ? <EmptyState icon={<Users size={32}/>} title={tr("\u00D6nce ayn\u0131 odada bulu\u015Fun.")}>{tr("Birlikte izlemek i\u00E7in toplulu\u011Funa ba\u011Flan ve oda se\u00E7.")}<button className="button primary" onClick={() => navigate('/settings?tab=connections')}>{tr("Toplulu\u011Fa ba\u011Flan")}<ArrowRight size={16}/></button></EmptyState> : <div className="youtube-layout"><div className="youtube-main"><div className="youtube-stage">{player ? <iframe ref={frame} src={player.url} title={tr("Resm\u00EE YouTube oynat\u0131c\u0131s\u0131")} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> : <div className="youtube-empty"><Play size={39}/><h3>{videoId ? tr("Oynat\u0131c\u0131 haz\u0131rlan\u0131yor\u2026") : tr("\u0130lk videoyu sen se\u00E7.")}</h3><p>{videoId ? tr("Yetkili sunucudaki resm\u00EE oynat\u0131c\u0131 a\u00E7\u0131l\u0131yor.") : tr("Bir ba\u011Flant\u0131 ekle. S\u0131radan se\u00E7. Birlikte izleyin.")}</p></div>}</div><div className="shared-player-controls"><span><strong>{active?.media.title ?? tr("Hen\u00FCz video se\u00E7ilmedi")}</strong><small>{a.status === 'connected' ? `${a.room?.participants.length ?? 0} katılımcı · oda bağlı` : tr("Etkinlik hizmeti ba\u011Fl\u0131 de\u011Fil")}</small></span><button className="button secondary small" disabled={!ready || a.busy} onClick={() => send({ type: 'playback', playing: !a.room?.timeline.playing, positionSec: position, rate: 1 })}>{a.room?.timeline.playing ? <Pause size={16}/> : <Play size={16}/>} {a.room?.timeline.playing ? tr("Herkes i\u00E7in duraklat") : tr("Herkes i\u00E7in oynat")}</button><IconButton label={tr("\u015Eimdi e\u015Fitle")} disabled={!ready} onClick={synchronize}><RefreshCw size={17}/></IconButton></div>{blocked && <div className="settings-note"><Play size={18}/><p>{tr("Taray\u0131c\u0131 otomatik oynatmay\u0131 durdurdu. Yukar\u0131daki resm\u00EE oynat\u0131c\u0131n\u0131n oynat d\u00FC\u011Fmesine bas\u0131p ard\u0131ndan")}<button className="text-button" onClick={() => { setBlocked(false); synchronize(); }}>{tr("\u015Eimdi e\u015Fitle")}</button>{tr("se\u00E7ene\u011Fini kullan.")}</p></div>}{videoId && <a className="text-button youtube-external" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">{tr("YouTube'da a\u00E7")}<ExternalLink size={13}/></a>}<p className="dock-footnote">{tr("Reklamlar, b\u00F6lge k\u0131s\u0131tlamalar\u0131 ve oynatma izinleri her izleyicide ba\u011F\u0131ms\u0131zd\u0131r. Ses odan\u0131z a\u00E7\u0131k kal\u0131r.")}</p></div><aside className="shared-queue"><div className="section-heading"><h3>{tr("Birlikte s\u0131radaki")}</h3><ListVideo size={18}/></div><form onSubmit={e => { e.preventDefault(); void add(); }}><label className="field-label">{tr("V\u0130DEO ADRES\u0130")}<input value={url} onChange={e => setUrl(e.target.value)} placeholder="youtube.com/watch?v=…" required/></label><label className="field-label">{tr("BA\u015ELIK \u00B7 \u0130STE\u011EE BA\u011ELI")}<input value={title} onChange={e => setTitle(e.target.value)} placeholder={tr("Bu videonun ad\u0131")} maxLength={240}/></label><button className="button secondary full" disabled={a.status !== 'connected' || a.busy || !url.trim()}><Plus size={15}/>{tr("Ortak s\u0131raya ekle")}</button></form>{a.room?.queue.map((item, i) => <div className={`shared-queue-item ${active?.id === item.id ? 'selected' : ''}`} key={item.id}><button onClick={() => send({ type: 'queue.select', itemId: item.id })} disabled={a.busy || item.media.kind !== 'youtube'}><span>{String(i + 1).padStart(2, '0')}</span><strong>{item.media.title}</strong><Play size={14}/></button><div className="shared-queue-actions"><IconButton label={tr("Videoyu yukar\u0131 ta\u015F\u0131")} disabled={i === 0 || a.busy} onClick={() => { const ids = a.room!.queue.map(q => q.id); [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!]; send({ type: 'queue.reorder', itemIds: ids }); }}><ArrowUp size={13}/></IconButton><IconButton label={tr("Videoyu s\u0131radan kald\u0131r")} disabled={a.busy} onClick={() => send({ type: 'queue.remove', itemId: item.id })}><Trash2 size={13}/></IconButton></div></div>)}{!a.room?.queue.length && <div className="inline-empty"><ListVideo size={25}/><p>{tr("S\u0131ra hen\u00FCz bo\u015F.")}</p></div>}</aside></div>}{(error || a.error) && <div className="error-pane" role="alert">{error || a.error}</div>}</div>;
}
