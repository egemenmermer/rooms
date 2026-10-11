import './reference-cinema.css';
import { ReferenceIcon } from './ReferenceIcon';
import { VoiceAvatar } from './VoiceAvatar';
import { useRealtime } from './realtime';
import { activityBridge } from './runtime-sources';
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
    const roomId = useCurrentRoom(), a = useActivityRoom(roomId), navigate = useNavigate(), community = useCommunity(), voice=useRealtime();
    const [queueVisible,setQueueVisible]=useState(true);
    const urlInput=useRef<HTMLInputElement>(null);
    const self=a.room?.participants.find(p=>p.userId===community.user?.id);
    const controlAllowed=a.status==='connected'&&self?.canControl!==false&&a.room?.primary?.activity==='youtube';
    const controlReason=a.status!=='connected'?'Etkinlik hizmeti bağlı değil.':self?.canControl===false?'Bu odada etkinlik kontrol yetkin yok.':'Önce YouTube etkinliği başlat.';
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
            void Promise.resolve().then(()=>activityBridge().youtubePlayer(videoId)).then(value => {
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
        if(a.room?.primary&&a.room.primary.activity!=='youtube'){setError('Başka bir ana etkinlik devam ediyor. Yeni YouTube etkinliği için önce onu açıkça bitir.');return;}
        try {
            if (!a.room?.primary)
                await a.send({ type: 'start', activity: 'youtube', title: 'Birlikte YouTube' });
            await a.send({ type: 'queue.add', itemId: crypto.randomUUID(), media: { kind: 'youtube', videoId: id, title: title.trim() || `YouTube · ${id}` } });
            setUrl('');
            setTitle('');
        }
        catch { }
    };
    return <div className="youtube-page reference-youtube-page page-enter"><header className="reference-cinema-heading"><div><span className="reference-cinema-eyebrow">YOUTUBE TOGETHER</span><h2>YouTube Together</h2><p>{voice.roomName??'Oda'} · ortak oynatma ve kuyruk</p></div><button className="button secondary" aria-pressed={queueVisible} onClick={()=>setQueueVisible(!queueVisible)}><ReferenceIcon name="queue" size={17}/>Kuyruk</button></header>
    {!roomId?<EmptyState icon={<Users size={32}/>} title="Oda seç"><button className="button primary" onClick={()=>navigate('/settings?tab=connections')}>Topluluğa bağlan<ArrowRight size={16}/></button></EmptyState>:<div className={`reference-youtube-layout ${queueVisible?'with-queue':''}`}><div className="reference-youtube-main"><form className="reference-cinema-url-row" onSubmit={e=>{e.preventDefault();void add();}}><label><ReferenceIcon name="link" size={17}/><input ref={urlInput} aria-label="YouTube video bağlantısı" value={url} onChange={e=>setUrl(e.target.value)} placeholder="YouTube video bağlantısı" required maxLength={2048}/></label><button className="button primary" disabled={a.status!=='connected'||a.busy||!url.trim()||self?.canControl===false} title={self?.canControl===false?'Bu odada etkinlik kontrol yetkin yok.':a.status!=='connected'?'Etkinlik hizmetine bağlan.':undefined}><ReferenceIcon name="plus" size={16}/>Kuyruğa ekle</button></form><details className="reference-youtube-title-option"><summary>Başlık ekle</summary><input aria-label="İsteğe bağlı video başlığı" value={title} onChange={e=>setTitle(e.target.value)} maxLength={240}/></details>
    {blocked&&<div className="reference-cinema-notice" role="status"><ReferenceIcon name="play" size={17}/><span>Otomatik oynatma engellendi. Resmî oynatıcının oynat düğmesine basıp odaya eşitle.</span><button className="button secondary small" disabled={!ready} onClick={()=>{setBlocked(false);synchronize();}}>Şimdi eşitle</button></div>}
    <div className="youtube-stage reference-youtube-stage" aria-busy={!!videoId&&!ready&&!playerError}>{playerError?<div className="reference-cinema-empty"><ReferenceIcon name="external-link" size={38}/><h3>Bu video burada oynatılamıyor</h3><p>{playerError}</p><div className="button-row">{videoId&&<a className="button primary" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer"><ReferenceIcon name="external-link" size={16}/>YouTube’da aç</a>}<button className="button secondary" onClick={()=>urlInput.current?.focus()}><ReferenceIcon name="plus" size={16}/>Başka video ekle</button><button className="button secondary" disabled={a.status!=='connected'} onClick={()=>setAttempt(value=>value+1)}>Yeniden dene</button></div></div>:player?<iframe ref={frame} src={player.url} title="Resmî YouTube oynatıcısı" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<div className="reference-cinema-empty">{videoId?<span className="reference-cinema-spinner"/>:<ReferenceIcon name="play" size={39}/>}<h3>{videoId?'Oynatıcı hazırlanıyor…':'İlk videoyu ekle'}</h3><p>{videoId?'Resmî YouTube oynatıcısı açılıyor.':'Bir YouTube video bağlantısı yapıştır.'}</p></div>}</div>
    {videoId&&!ready&&!playerError&&<div className="youtube-player-status" role="status"><LoaderCircle size={16} className="spin"/>Resmî YouTube oynatıcısı hazırlanıyor…</div>}
    {videoId&&<div className="reference-youtube-controls"><div><strong>{active?.media.title}</strong><small>{a.status==='connected'?`${a.room?.participants.length??0} oda katılımcısı`:'Etkinlik hizmeti bağlı değil'}</small></div><button className="button secondary small" disabled={!ready||!!playerError||!controlAllowed||a.busy} title={!controlAllowed?controlReason:!ready?'Oynatıcı hazır değil.':undefined} onClick={()=>send({type:'playback',playing:!a.room?.timeline.playing,positionSec:displayPosition,rate:1})}><ReferenceIcon name={a.room?.timeline.playing?'pause':'play'} size={16}/>{a.room?.timeline.playing?'Herkes için duraklat':'Herkes için oynat'}</button><IconButton label="Şimdi eşitle" disabled={!ready||!!playerError||a.status!=='connected'} onClick={synchronize}><ReferenceIcon name="refresh" size={17}/></IconButton></div>}
    {videoId&&<div className="youtube-timeline reference-youtube-timeline"><span>{clock(seekDraft??displayPosition)}</span><input type="range" aria-label="Ortak oynatma konumu" aria-valuetext={`${clock(seekDraft??displayPosition)} / ${clock(duration)}`} min={0} max={duration||1} step={1} value={Math.min(duration||1,seekDraft??displayPosition)} disabled={!ready||!!playerError||!controlAllowed||!duration||a.busy} onChange={e=>setSeekDraft(Number(e.currentTarget.value))} onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)} onPointerUp={e=>seek(Number(e.currentTarget.value))} onPointerCancel={()=>setSeekDraft(null)} onKeyDown={e=>{const value=Number(e.currentTarget.value),step=e.shiftKey?10:1;const targets:Record<string,number>={ArrowLeft:value-step,ArrowDown:value-step,ArrowRight:value+step,ArrowUp:value+step,Home:0,End:duration,PageUp:value+10,PageDown:value-10,Enter:value};if(e.key in targets){e.preventDefault();seek(targets[e.key]!);}}} onBlur={()=>setSeekDraft(null)}/><span>{clock(duration)}</span></div>}
    <div className="reference-cinema-footer"><div className="reference-cinema-avatar-stack">{(a.room?.participants??[]).slice(0,6).map(p=><VoiceAvatar key={p.userId} id={p.userId} name={p.displayName}/>)}</div><div><strong>{a.room?.participants.length??0} oda katılımcısı</strong><small>{voice.status==='connected'?`${voice.roomName} · ses bağlantısı açık`:'Ses bağlantısı yok'}</small></div><button className="button ghost" onClick={()=>navigate('/voice')}><ReferenceIcon name="headphones" size={16}/>Salona dön</button></div>
    {videoId&&<a className="text-button youtube-external" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">YouTube’da aç<ExternalLink size={13}/></a>}
    </div>{queueVisible&&<aside className="reference-youtube-queue"><div className="reference-youtube-queue-heading"><h3>Sıradakiler <span>{a.room?.queue.length??0}</span></h3><IconButton label="Kuyruğu kapat" onClick={()=>setQueueVisible(false)}><ReferenceIcon name="x" size={17}/></IconButton></div>{(a.room?.queue??[]).map((item,i)=>{const isCurrent=active?.id===item.id;const reorder=(direction:number)=>{const ids=a.room!.queue.map(q=>q.id),other=i+direction;if(other<0||other>=ids.length||isCurrent||ids[other]===active?.id)return;[ids[i],ids[other]]=[ids[other]!,ids[i]!];send({type:'queue.reorder',itemIds:ids});};return <div className={`reference-youtube-queue-item ${isCurrent?'active':''}`} key={item.id}><button className="reference-youtube-select" disabled={!controlAllowed||a.busy||item.media.kind!=='youtube'||isCurrent} title={item.media.kind!=='youtube'?'Bu öğe YouTube videosu değil.':!controlAllowed?controlReason:undefined} onClick={()=>send({type:'queue.select',itemId:item.id})}><span>{isCurrent?<ReferenceIcon name="volume" size={14}/>:i+1}</span><span className="reference-cinema-item-mark"><ReferenceIcon name="play" size={22}/></span><div><strong>{item.media.title}</strong><small>{isCurrent?'Güncel içerik':`${a.room?.participants.find(p=>p.userId===item.addedBy)?.displayName??'Katılımcı'} ekledi`}</small></div></button><div className="reference-youtube-queue-actions"><IconButton label={`${item.media.title} yukarı taşı`} disabled={!controlAllowed||a.busy||i===0||isCurrent||a.room?.queue[i-1]?.id===active?.id} onClick={()=>reorder(-1)}><ReferenceIcon name="arrow-up" size={13}/></IconButton><IconButton label={`${item.media.title} aşağı taşı`} disabled={!controlAllowed||a.busy||i===(a.room?.queue.length??0)-1||isCurrent||a.room?.queue[i+1]?.id===active?.id} onClick={()=>reorder(1)}><ReferenceIcon name="arrow-down" size={13}/></IconButton><IconButton label={`${item.media.title} sıradan kaldır`} disabled={!controlAllowed||a.busy||isCurrent} onClick={()=>send({type:'queue.remove',itemId:item.id})}><ReferenceIcon name="x" size={13}/></IconButton></div></div>;})}{!a.room?.queue.length&&<p className="reference-youtube-queue-empty">Kuyruk boş.</p>}<button className="button secondary full" onClick={()=>urlInput.current?.focus()}><ReferenceIcon name="plus" size={16}/>Kuyruğa ekle</button><div className="reference-youtube-participants"><h3>Katılımcılar <span>{a.room?.participants.length??0} kişi</span></h3>{a.room?.participants.map(p=><div className="reference-cinema-person" key={p.userId}><VoiceAvatar id={p.userId} name={p.displayName}/><div><strong>{p.displayName}{p.userId===community.user?.id?' (sen)':''}</strong><small>{p.userId===a.room?.primary?.hostUserId?'Oturumu düzenleyen':'Oda katılımcısı'}</small></div><ReferenceIcon name="headphones" size={14}/></div>)}</div></aside>}</div>}
    {(error||a.error)&&<div className="reference-cinema-notice" role="alert"><ReferenceIcon name="alert-triangle" size={17}/><span>{error||a.error}</span><button className="button secondary small" onClick={()=>void a.refresh()}>Yeniden bağlan</button></div>}</div>;
}
