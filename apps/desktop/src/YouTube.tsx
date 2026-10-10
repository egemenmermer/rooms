import { tr, uiError } from './i18n';
import './youtube-controls.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, ExternalLink, Film, ListVideo, LoaderCircle, Pause, Play, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { EmptyState, IconButton } from '@rooms/design';
import { useActivityRoom } from './activity';
import { useCurrentRoom } from './Agent';
import { useCommunity } from './community';
import type { ActivityCommand } from '../../../packages/activity-protocol/src';
function parseVideo(value: string) {
    if (/^[\w-]{11}$/.test(value))
        return value;
    try {
        const u = new URL(value);
        if (u.hostname === 'youtu.be')
            return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
        if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
            const id = u.searchParams.get('v') ?? u.pathname.split('/').at(-1);
            return id && /^[\w-]{11}$/.test(id) ? id : null;
        }
    }
    catch { }
    return null;
}
export default function YouTube() {
    const roomId = useCurrentRoom(), a = useActivityRoom(roomId), navigate = useNavigate(), community = useCommunity();
    const [url, setUrl] = useState(''), [title, setTitle] = useState(''), [error, setError] = useState(''), [playerError, setPlayerError] = useState(''), [attempt, setAttempt] = useState(0), [player, setPlayer] = useState<{
        url: string;
        nonce: string;
    } | null>(null), [ready, setReady] = useState(false), [blocked, setBlocked] = useState(false), [position, setPosition] = useState(0), [duration, setDuration] = useState(0), [seekDraft, setSeekDraft] = useState<number | null>(null);
    const frame = useRef<HTMLIFrameElement>(null), applying = useRef(0), latest = useRef(a.room), serverOffset = useRef(a.serverOffsetMs);
    latest.current = a.room;
    serverOffset.current = a.serverOffsetMs;
    const active = a.room?.queue.find(i => i.id === a.room?.timeline.itemId);
    const videoId = active?.media.kind === 'youtube' ? active.media.videoId : null;
    const joined = a.room?.participants.some(p => p.userId === community.user?.id) ?? false;
    useEffect(() => {
        if (videoId && a.status === 'connected' && community.user && !joined)
            void a.send({ type: 'join' }).catch(() => { });
    }, [videoId, a.status, a.send, community.user, joined]);
    const send = useCallback((command: ActivityCommand) => void a.send(command).catch(() => { }), [a.send]);
    const playerCommand = useCallback((action: 'play' | 'pause' | 'seek' | 'position', positionSec?: number) => {
        if (player)
            frame.current?.contentWindow?.postMessage({ type: 'rooms-youtube-command', nonce: player.nonce, action, positionSec }, new URL(player.url).origin);
    }, [player]);
    useEffect(() => {
        let stale = false;
        setPlayer(null);
        setReady(false);
        setDuration(0);
        setSeekDraft(null);
        setBlocked(false);
        setPlayerError('');
        if (videoId)
            void window.rooms?.activity.youtubePlayer(videoId).then(value => {
                if (!stale)
                    setPlayer(value);
            }).catch(e => {
                if (!stale)
                    setPlayerError(uiError(e));
            });
        return () => { stale = true; };
    }, [videoId, attempt]);
    useEffect(() => {
        if (!videoId || ready || playerError)
            return;
        const timer = setTimeout(() => setPlayerError('YouTube oynatıcısı 25 saniye içinde hazır olmadı. Bağlantını kontrol edip yeniden dene.'), 25000);
        return () => clearTimeout(timer);
    }, [videoId, attempt, ready, playerError]);
    useEffect(() => {
        if (!player)
            return;
        const listener = (event: MessageEvent) => {
            if (event.source !== frame.current?.contentWindow || event.origin !== new URL(player.url).origin || event.data?.type !== 'rooms-youtube' || event.data.nonce !== player.nonce)
                return;
            const { event: kind, data } = event.data;
            if (kind === 'ready') {
                setReady(true);
                setPlayerError('');
                setBlocked(false);
            }
            else if (kind === 'error') {
                setReady(false);
                setBlocked(false);
                // Official codes: https://developers.google.com/youtube/iframe_api_reference#onError
                const code = Number(data?.code);
                const reasons: Record<number, string> = { 2: 'Video kimliği veya oynatma parametreleri geçersiz.', 5: 'Bu video mevcut HTML5 oynatıcıda açılamadı.', 100: 'Video kaldırılmış veya özel olabilir.', 101: 'Video sahibi uygulama içinde oynatmaya izin vermiyor.', 150: 'Video sahibi uygulama içinde oynatmaya izin vermiyor.', 153: 'YouTube bu oynatıcının kaynak doğrulamasını kabul etmedi.' };
                setPlayerError(`YouTube videoyu oynatamadı (kod ${Number.isFinite(code) ? code : '—'}). ${reasons[code] ?? 'Video bu bölgede veya oynatıcıda kullanılamıyor olabilir.'} Başka bir video seçebilir veya YouTube’da açabilirsin.`);
            }
            else if (kind === 'autoplay-blocked')
                setBlocked(true);
            else if (kind === 'position' && Number.isFinite(data?.positionSec)) {
                setPosition(data.positionSec);
                if (Number.isFinite(data.durationSec) && data.durationSec > 0 && data.durationSec <= 86400)
                    setDuration(data.durationSec);
            }
            else if (kind === 'state' && Number.isFinite(data?.positionSec) && [0, 1, 2].includes(data?.state)) {
                setPosition(data.positionSec);
                if (Date.now() > applying.current && latest.current?.primary?.activity === 'youtube') {
                    const playing = data.state === 1;
                    const timeline = latest.current.timeline;
                    const expectedPosition = timeline.positionSec + (timeline.playing ? Math.max(0, Date.now() + serverOffset.current - timeline.effectiveServerTimeMs) / 1000 * timeline.rate : 0);
                    if (playing !== timeline.playing || (playing && Math.abs(data.positionSec - expectedPosition) > 3))
                        send({ type: 'playback', playing, positionSec: data.positionSec, rate: 1 });
                }
            }
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [player, send]);
    const synchronize = useCallback(() => {
        const timeline = latest.current?.timeline;
        if (!ready || !timeline)
            return;
        applying.current = Date.now() + 1800;
        const expected = timeline.positionSec + (timeline.playing ? Math.max(0, Date.now() + serverOffset.current - timeline.effectiveServerTimeMs) / 1000 * timeline.rate : 0);
        playerCommand('seek', expected);
        playerCommand(timeline.playing ? 'play' : 'pause');
    }, [ready, playerCommand]);
    useEffect(() => { synchronize(); }, [a.room?.timeline.epoch, a.room?.timeline.effectiveServerTimeMs, synchronize]);
    useEffect(() => {
        if (!ready)
            return;
        const timer = setInterval(() => playerCommand('position'), 1500);
        return () => clearInterval(timer);
    }, [ready, playerCommand]);
    const displayPosition = a.room?.timeline.playing ? position : (a.room?.timeline.positionSec ?? position);
    const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const seek = (seconds: number) => { setSeekDraft(null); send({ type: 'playback', playing: latest.current?.timeline.playing ?? false, positionSec: Math.max(0, Math.min(duration, seconds)), rate: latest.current?.timeline.rate ?? 1 }); };
    const add = async () => {
        const id = parseVideo(url.trim());
        if (!id) {
            setError(tr("Ge\u00E7erli bir YouTube video adresi veya 11 karakterli video kimli\u011Fi gir."));
            return;
        }
        setError('');
        try {
            if (!a.room?.primary)
                await a.send({ type: 'start', activity: 'youtube', title: 'Birlikte YouTube' });
            await a.send({ type: 'queue.add', itemId: crypto.randomUUID(), media: { kind: 'youtube', videoId: id, title: title.trim() || `YouTube · ${id}` } });
            setUrl('');
            setTitle('');
        }
        catch { }
    };
    return <div className="youtube-page page-enter"><div className="page-intro"><h2>YouTube</h2><span className="small-tag">{tr("BA\u011EIMSIZ OYNATMA")}</span></div>{!roomId ? <EmptyState icon={<Users size={32}/>} title={"Oda se\u00E7"}>{tr("Birlikte izlemek i\u00E7in toplulu\u011Funa ba\u011Flan ve oda se\u00E7.")}<button className="button primary" onClick={() => navigate('/settings?tab=connections')}>{tr("Toplulu\u011Fa ba\u011Flan")}<ArrowRight size={16}/></button></EmptyState> : <div className="youtube-layout"><div className="youtube-main"><div className="youtube-stage" aria-busy={!!videoId && !ready && !playerError}>{player ? <iframe ref={frame} src={player.url} title={tr("Resm\u00EE YouTube oynat\u0131c\u0131s\u0131")} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> : <div className="youtube-empty"><Play size={39}/><h3>{videoId ? tr("Oynat\u0131c\u0131 haz\u0131rlan\u0131yor\u2026") : "Video yok"}</h3><p>{videoId ? tr("Yetkili sunucudaki resm\u00EE oynat\u0131c\u0131 a\u00E7\u0131l\u0131yor.") : ""}</p></div>}</div>{videoId && !ready && !playerError && <div className="youtube-player-status" role="status"><LoaderCircle size={16} className="spin"/><span>Resmî YouTube oynatıcısı hazırlanıyor…</span></div>}{playerError && <div className="youtube-player-error" role="alert"><p>{playerError}</p><button className="button secondary small" disabled={a.status !== 'connected'} title={a.status !== 'connected' ? 'Önce oda bağlantısını yeniden kur.' : undefined} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15}/>Oynatıcıyı yeniden aç</button></div>}<div className="shared-player-controls"><span><strong>{active?.media.title ?? tr("Hen\u00FCz video se\u00E7ilmedi")}</strong><small>{a.status === 'connected' ? `${a.room?.participants.length ?? 0} katılımcı · oda bağlı` : tr("Etkinlik hizmeti ba\u011Fl\u0131 de\u011Fil")}</small></span><button className="button secondary small" disabled={!ready || !!playerError || a.status !== 'connected' || a.busy} onClick={() => send({ type: 'playback', playing: !a.room?.timeline.playing, positionSec: displayPosition, rate: 1 })}>{a.room?.timeline.playing ? <Pause size={16}/> : <Play size={16}/>} {a.room?.timeline.playing ? tr("Herkes i\u00E7in duraklat") : tr("Herkes i\u00E7in oynat")}</button><IconButton label={tr("\u015Eimdi e\u015Fitle")} disabled={!ready || !!playerError || a.status !== 'connected'} onClick={synchronize}><RefreshCw size={17}/></IconButton></div><div className="youtube-timeline"><span>{clock(seekDraft ?? displayPosition)}</span><input type="range" aria-label="Ortak oynatma konumu" aria-valuetext={`${clock(seekDraft ?? displayPosition)} / ${clock(duration)}`} min={0} max={duration || 1} step={1} value={Math.min(duration || 1, seekDraft ?? displayPosition)} disabled={!ready || !!playerError || a.status !== 'connected' || !duration || a.busy} onChange={e => setSeekDraft(Number(e.currentTarget.value))} onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)} onPointerUp={e => seek(Number(e.currentTarget.value))} onPointerCancel={() => setSeekDraft(null)} onKeyDown={e => {
                const value = Number(e.currentTarget.value), step = e.shiftKey ? 10 : 1;
                const targets: Record<string, number> = { ArrowLeft: value - step, ArrowDown: value - step, ArrowRight: value + step, ArrowUp: value + step, Home: 0, End: duration, PageUp: value + 10, PageDown: value - 10, Enter: value };
                if (e.key in targets) {
                    e.preventDefault();
                    seek(targets[e.key]!);
                }
            }} onBlur={() => setSeekDraft(null)}/><span>{clock(duration)}</span></div>{blocked && <div className="settings-note"><Play size={18}/><p>{tr("Taray\u0131c\u0131 otomatik oynatmay\u0131 durdurdu. Yukar\u0131daki resm\u00EE oynat\u0131c\u0131n\u0131n oynat d\u00FC\u011Fmesine bas\u0131p ard\u0131ndan")}<button className="text-button" onClick={() => { setBlocked(false); synchronize(); }}>{tr("\u015Eimdi e\u015Fitle")}</button>{tr("se\u00E7ene\u011Fini kullan.")}</p></div>}{videoId && <a className="text-button youtube-external" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">{tr("YouTube'da a\u00E7")}<ExternalLink size={13}/></a>}</div><aside className="shared-queue"><div className="section-heading"><h3>{"S\u0131ra"}</h3><ListVideo size={18}/></div><form onSubmit={e => { e.preventDefault(); void add(); }}><label className="field-label">{tr("V\u0130DEO ADRES\u0130")}<input value={url} onChange={e => setUrl(e.target.value)} placeholder="youtube.com/watch?v=…" required/></label><label className="field-label">{tr("BA\u015ELIK \u00B7 \u0130STE\u011EE BA\u011ELI")}<input value={title} onChange={e => setTitle(e.target.value)} placeholder={tr("Bu videonun ad\u0131")} maxLength={240}/></label><button className="button secondary full" disabled={a.status !== 'connected' || a.busy || !url.trim()}><Plus size={15}/>{tr("Ortak s\u0131raya ekle")}</button></form>{a.room?.queue.map((item, i) => <div className={`shared-queue-item ${active?.id === item.id ? 'selected' : ''}`} key={item.id}><button onClick={() => send({ type: 'queue.select', itemId: item.id })} disabled={a.busy || item.media.kind !== 'youtube'}><span>{String(i + 1).padStart(2, '0')}</span><strong>{item.media.title}</strong><Play size={14}/></button><div className="shared-queue-actions"><IconButton label={tr("Videoyu yukar\u0131 ta\u015F\u0131")} disabled={i === 0 || a.busy} onClick={() => { const ids = a.room!.queue.map(q => q.id); [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!]; send({ type: 'queue.reorder', itemIds: ids }); }}><ArrowUp size={13}/></IconButton><IconButton label={tr("Videoyu s\u0131radan kald\u0131r")} disabled={a.busy} onClick={() => send({ type: 'queue.remove', itemId: item.id })}><Trash2 size={13}/></IconButton></div></div>)}{!a.room?.queue.length && <div className="inline-empty"><ListVideo size={25}/><p>{tr("S\u0131ra hen\u00FCz bo\u015F.")}</p></div>}</aside></div>}{(error || a.error) && <div className="error-pane" role="alert">{error || a.error}</div>}</div>;
}
