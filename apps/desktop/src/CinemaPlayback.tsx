import './reference-cinema.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Film, FolderOpen, Headphones, Maximize, MessageCircle, Minimize, Pause, PictureInPicture2, Play, RotateCcw, Settings2, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { IconButton, Modal } from '@rooms/design';
import { ReferenceIcon } from './ReferenceIcon';
import { VoiceAvatar } from './VoiceAvatar';
import { tr, uiError } from './i18n';
import { useRealtime, toggleMic } from './realtime';
import { activityBridge } from './runtime-sources';
import { useActivityRoom } from './activity';
import { playbackPosition } from '../../../packages/activity-protocol/src/index';
import { useCommunity } from './community';
import { useCinemaSession, chooseCinemaMedia, clearCinemaSession } from './cinema-session';
import { MiniPlaybackChrome } from './MiniPlaybackChrome';
import './reference-mini-playback.css';
import { CinemaSourceCheck, cinemaSourceReadiness } from './CinemaSourceCheck';

const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;

/** Mount once beside Routes: navigation changes presentation, never video ownership. */
export default function CinemaPlayback({ notify }: { notify(message: string): void }) {
  const navigate = useNavigate(), location = useLocation(), realtime = useRealtime();
  const command = (operation: Promise<unknown>) => { void operation.catch(error => notify(uiError(error))); };
  const video = useRef<HTMLVideoElement>(null), stage = useRef<HTMLDivElement>(null);
  const playbackBlocked = useRef(false);
  const [playbackNotice, setPlaybackNotice] = useState('');
  const expectedPlayback = useRef<boolean | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const media = useCinemaSession(state => state.media);
  const fixtureMedia = import.meta.env.DEV && !!media?.url.startsWith('rooms-fixture://');
  const fixtureError = fixtureMedia && ['S25/source_missing', 'S26/error'].includes(document.documentElement.dataset.referenceFixture ?? '');
  const community = useCommunity();
  const binding = media?.binding;
  const activity = useActivityRoom(binding?.roomId ?? null);
  const latestActivity = useRef(activity); latestActivity.current = activity;
  const declaration = activity.room?.cinema?.sources.find(source => source.userId === community.user?.id && source.sourceVersion === binding?.sourceVersion);
  const canControl = !binding || (activity.status === 'connected' && !!declaration?.ready && activity.room?.participants.some(person => person.userId === community.user?.id && person.canControl));
  const controlReason = !declaration?.ready ? 'Önce kaynağını hazırla.' : activity.status !== 'connected' ? 'Etkinlik bağlantısı gerekli.' : 'Oynatma kontrol yetkin yok.';
  const previousHost = useRef<string | null>(null);
  const [hostNotice, setHostNotice] = useState('');
  const reconnecting = !!binding && activity.status !== 'connected';
  const readySources = activity.room?.cinema?.sources.filter(source => source.ready) ?? [];
  useEffect(() => {
    previousHost.current = null;
    setHostNotice('');
  }, [binding?.roomId, binding?.timelineEpoch]);
  useEffect(() => {
    if (!binding || activity.status !== 'connected') return;
    const host = activity.room?.primary?.hostUserId;
    if (!host) return;
    if (previousHost.current && previousHost.current !== host) {
      const name = activity.room?.participants.find(person => person.userId === host)?.displayName ?? 'Katılımcı';
      setHostNotice(`${name} oturumu düzenliyor.`);
    }
    previousHost.current = host;
  }, [binding, activity.room, activity.status]);
  const [confirmed, setConfirmed] = useState(false), [joining, setJoining] = useState(false);
  const [dismissedSourceCheck, setDismissedSourceCheck] = useState<typeof media>(null);
  const active = location.pathname === '/cinema' && !['queue','status','screen'].includes(new URLSearchParams(location.search).get('view') ?? '');
  const [buffering, setBuffering] = useState(false), [ended, setEnded] = useState(false);
  const [pip, setPip] = useState(false);
  const [collapsed, setCollapsed] = useState(() => import.meta.env.DEV && document.documentElement.dataset.referenceFixture === 'S30/compact');
  const [miniHidden, setMiniHidden] = useState(false);
  useEffect(() => { if (active) setMiniHidden(false); }, [active, media]);
  const [playing, setPlaying] = useState(false), [position, setPosition] = useState(0), [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(.65), [visible, setVisible] = useState(true), [error, setError] = useState('');
  const [settings, setSettings] = useState(false), [speed, setSpeed] = useState(1), [fullscreen, setFullscreen] = useState(false);
  const captionElement = useRef<HTMLTrackElement>(null), captionUrl = useRef<string | null>(null), captionEpoch = useRef(0);
  const [caption, setCaption] = useState<{ url: string; name: string } | null>(null);
  const [captionEnabled, setCaptionEnabled] = useState(true), [captionBusy, setCaptionBusy] = useState(false), [captionText, setCaptionText] = useState('');
  const clearCaption = useCallback(() => {
    captionEpoch.current++;
    if (captionUrl.current) URL.revokeObjectURL(captionUrl.current);
    captionUrl.current = null; setCaption(null); setCaptionText(''); setCaptionBusy(false);
  }, []);
  useEffect(() => { clearCaption(); return clearCaption; }, [media, clearCaption]);
  const chooseCaption = async () => {
    if (!media || !window.rooms?.chooseCaption || captionBusy) return;
    const selected = media, epoch = ++captionEpoch.current;
    setCaptionBusy(true);
    try {
      const result = await window.rooms.chooseCaption(selected.url);
      if (!result || epoch !== captionEpoch.current || useCinemaSession.getState().media !== selected) return;
      const url = URL.createObjectURL(new Blob([result.content], { type: 'text/vtt' }));
      if (captionUrl.current) URL.revokeObjectURL(captionUrl.current);
      captionUrl.current = url; setCaption({ url, name: result.name }); setCaptionEnabled(true); setCaptionText('');
    } catch (failure) { if (epoch === captionEpoch.current) notify(uiError(failure)); }
    finally { if (epoch === captionEpoch.current) setCaptionBusy(false); }
  };
  useEffect(() => {
    const element = captionElement.current;
    if (!element || !caption) return;
    const track = element.track;
    track.mode = captionEnabled ? 'hidden' : 'disabled';
    const update = () => setCaptionText(captionEnabled ? Array.from(track.activeCues ?? []).map(cue => { const vtt = cue as VTTCue; return typeof vtt.getCueAsHTML === 'function' ? vtt.getCueAsHTML().textContent ?? '' : vtt.text.replace(/<[^>]*>/g, ''); }).join('\n') : '');
    const failed = () => notify('Altyazı okunamadı. Geçerli bir WebVTT dosyası seç.');
    track.addEventListener('cuechange', update); element.addEventListener('load', update); element.addEventListener('error', failed); update();
    return () => { track.removeEventListener('cuechange', update); element.removeEventListener('load', update); element.removeEventListener('error', failed); };
  }, [caption, captionEnabled, notify]);

  const choose = async () => {
    try { if (await chooseCinemaMedia(media?.binding)) navigate('/cinema?view=personal'); }
    catch (error) { notify(uiError(error)); }
  };
  function nativePlayback(playing: boolean) {
    if (expectedPlayback.current === playing) { expectedPlayback.current = null; return; }
    const current = latestActivity.current;
    if (binding && declaration?.ready && current.status === 'connected' && current.room?.timeline.playing !== playing && video.current) void sharedPlayback(playing, video.current.currentTime, video.current.playbackRate);
  }
  async function sharedPlayback(shouldPlay: boolean, target: number, rate: number) {
    const bound = useCinemaSession.getState().media?.binding;
    if (!bound) return;
    const current = latestActivity.current;
    try { await current.send({ type: 'cinema.playback', itemId: bound.itemId, timelineEpoch: bound.timelineEpoch, sourceVersion: bound.sourceVersion, playing: shouldPlay, positionSec: target, rate }); }
    catch (failure) { notify(uiError(failure)); }
  }
  async function joinSource() {
    if (!binding || !cinemaSourceReadiness({duration, expectedDuration:activity.room?.cinema?.durationSec ?? null, mediaReady:(video.current?.readyState ?? 0)>=2, buffering, error, confirmed, connected:activity.status==='connected', busy:joining}).canJoin) return;
    const selected = media;
    setJoining(true);
    try {
      if (!declaration) await activity.send({ type: 'cinema.source', expectedSourceVersion: activity.room?.cinema?.sources.find(source => source.userId === community.user?.id)?.sourceVersion ?? null, itemId: binding.itemId, referenceId: binding.referenceId, timelineEpoch: binding.timelineEpoch, sourceVersion: binding.sourceVersion, durationSec: duration });
      if (useCinemaSession.getState().media !== selected) return;
      await activity.send({ type: 'cinema.ready', itemId: binding.itemId, timelineEpoch: binding.timelineEpoch, sourceVersion: binding.sourceVersion, ready: true });
    } catch (failure) { notify(uiError(failure)); }
    finally { setJoining(false); }
  }
  const reveal = useCallback(() => {
    setVisible(true); if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { if (video.current && !video.current.paused && !stage.current?.contains(document.activeElement)) setVisible(false); }, 2800);
  }, []);
  const toggle = useCallback(async () => {
    const v = video.current; if (!v) return;
    const selected = useCinemaSession.getState().media;
    if (selected?.binding) { const current = latestActivity.current; const declared = current.room?.cinema?.sources.find(source => source.userId === community.user?.id && source.sourceVersion === selected.binding?.sourceVersion); if (!declared?.ready || current.status !== 'connected') { notify('Önce kaynağını hazırla.'); return; } if (!current.room?.participants.some(person => person.userId === community.user?.id && person.canControl)) { notify('Oynatma kontrol yetkin yok.'); return; } if (current.room?.timeline.playing && v.paused) { try { expectedPlayback.current = true; await v.play(); playbackBlocked.current = false; setPlaybackNotice(''); } catch { notify('Videoyu oynatmak için yeniden dene.'); } reveal(); return; } const shouldPlay = !current.room?.timeline.playing; if (shouldPlay) { try { expectedPlayback.current = true; await v.play(); playbackBlocked.current = false; setPlaybackNotice(''); } catch { notify('Videoyu oynatmak için yeniden dene.'); return; } } await sharedPlayback(shouldPlay, v.currentTime, v.playbackRate); reveal(); return; }
    if (v.paused) { try { await v.play(); if (useCinemaSession.getState().media === selected) setError(''); } catch { if (useCinemaSession.getState().media === selected) setError('Dosya oynatılamadı. Yeniden yükle veya başka bir dosya seç.'); } }
    else v.pause(); reveal();
  }, [reveal, binding, community.user?.id, notify]);
  const seek = useCallback((value: number) => {
    const v = video.current; if (binding && v) { const target = Math.max(0, Math.min(v.duration, value)); setPosition(target); void sharedPlayback(latestActivity.current.room?.timeline.playing ?? false, target, v.playbackRate); reveal(); return; } if (v && Number.isFinite(v.duration)) { v.currentTime = Math.max(0, Math.min(v.duration, value)); setPosition(v.currentTime); } reveal();
  }, [reveal, binding]);
  const enterFullscreen = useCallback(async () => {
    try {
      if (window.rooms) { await window.rooms.windowAction('fullscreen'); setFullscreen(value => !value); }
      else if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen();
    } catch { notify('Tam ekran açılamadı. Pencerenin tam ekran düğmesini deneyebilirsin.'); }
  }, [notify]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!active) return;
      if ((e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable="true"]') || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape' && fullscreen) { e.preventDefault(); void enterFullscreen(); }
      if (!media) return;
      if (e.code === 'Space') { e.preventDefault(); void toggle(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seek((video.current?.currentTime ?? 0) + (e.key === 'ArrowLeft' ? -10 : 10)); }
    };
    // Fullscreen may belong to the independent personal-media player. Only
    // claim this player's fullscreen state when this exact stage owns it.
    const fs = () => setFullscreen(document.fullscreenElement === stage.current);
    window.addEventListener('keydown', keys); document.addEventListener('fullscreenchange', fs);
    return () => { window.removeEventListener('keydown', keys); document.removeEventListener('fullscreenchange', fs); if (idle.current) clearTimeout(idle.current); };
  }, [active, media, fullscreen, enterFullscreen, seek, toggle]);
  const closeSettings = useCallback(() => setSettings(false), []);
  useEffect(() => {
    // Subscribe synchronously so an account transition invalidates an open picker too.
    return useCommunity.subscribe((next, previous) => {
      if (next.user?.id !== previous.user?.id || next.serverUrl !== previous.serverUrl) clearCinemaSession();
    });
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element || !media) return;
    playbackBlocked.current = false; setPlaybackNotice(''); setConfirmed(false); setError(''); setPosition(0); setDuration(0); setPlaying(false); setEnded(false); setBuffering(false);
    const entered = () => setPip(true), left = () => setPip(false);
    element.addEventListener('enterpictureinpicture', entered);
    element.addEventListener('leavepictureinpicture', left);
    setPip(false);
    element.src = media.url;
    element.volume = volume; element.playbackRate = speed;
    element.load();
    return () => {
      element.removeEventListener('enterpictureinpicture', entered);
      element.removeEventListener('leavepictureinpicture', left);
      expectedPlayback.current = false; element.pause();
      if (document.pictureInPictureElement === element) void document.exitPictureInPicture().catch(() => {});
      element.removeAttribute('src'); element.load();
    };
    // Volume and speed are independent settings, not source reload triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);
  useEffect(() => {
    if (!active) { setSettings(false); setVisible(true); }
  }, [active]);
  useEffect(() => {
    if ((!active || !media) && fullscreen) void enterFullscreen();
  }, [active, media, fullscreen, enterFullscreen]);
  useEffect(() => {
    if (!binding) return;
    const currentRoom = community.user ? (realtime.channelId ?? community.activeChannelId) : null;
    const state = activity.room;
    if (currentRoom !== binding.roomId || (state && (state.primary?.activity !== 'cinema' || state.timeline.itemId !== binding.itemId || state.timeline.epoch !== binding.timelineEpoch))) clearCinemaSession();
  }, [binding, community.user, community.activeChannelId, realtime.channelId, activity.room]);
  useEffect(() => {
    if (!binding || !media) return;
    const selected = media;
    const apply = () => {
      const element = video.current, current = latestActivity.current;
      if (!element || useCinemaSession.getState().media !== selected) return;
      const source = current.room?.cinema?.sources.find(value => value.userId === community.user?.id && value.sourceVersion === binding.sourceVersion);
      if (current.status !== 'connected' || !current.room || !source?.ready) { if (!element.paused) { expectedPlayback.current = false; element.pause(); } return; }
      const timeline = current.room.timeline;
      const target = Math.min(element.duration || 0, playbackPosition(timeline, Date.now() + current.serverOffsetMs));
      if (Number.isFinite(target) && Math.abs(element.currentTime - target) > .75) element.currentTime = target;
      element.playbackRate = timeline.rate; setSpeed(timeline.rate);
      if (timeline.playing && element.paused && !element.ended && !playbackBlocked.current) { expectedPlayback.current = true; void element.play().catch(() => { expectedPlayback.current = null; playbackBlocked.current = true; setPlaybackNotice('Tarayıcı otomatik oynatmayı engelledi. Videoya tıkla.'); }); }
      else if (!timeline.playing && !element.paused) { expectedPlayback.current = false; element.pause(); }
    };
    apply(); const timer = setInterval(apply, 500); return () => clearInterval(timer);
  }, [binding, media, community.user?.id]);
  useEffect(() => {
    if (!binding || !declaration || joining || activity.status !== 'connected') return;
    const matchesDuration = activity.room?.cinema?.durationSec !== null && Math.abs((activity.room?.cinema?.durationSec ?? 0) - duration) <= 2;
    const ready = confirmed && !buffering && !error && matchesDuration && !!video.current && video.current.readyState >= 2;
    if (ready === declaration.ready) return;
    void activity.send({ type: 'cinema.ready', itemId: binding.itemId, timelineEpoch: binding.timelineEpoch, sourceVersion: binding.sourceVersion, ready }).catch(() => {});
  }, [binding, declaration?.ready, !!declaration, confirmed, joining, buffering, error, duration, activity.room?.cinema?.durationSec, activity.status, activity.send]);
  useEffect(() => {
    if (!binding) return;
    const pulse = setInterval(() => {
      const current = latestActivity.current;
      const source = current.room?.cinema?.sources.find(value => value.userId === community.user?.id && value.sourceVersion === binding.sourceVersion);
      if (current.status === 'connected' && source?.ready && video.current && video.current.readyState >= 2) void current.send({type:'cinema.ready',itemId:binding.itemId,timelineEpoch:binding.timelineEpoch,sourceVersion:binding.sourceVersion,ready:true}).catch(()=>{});
    }, 10000);
    return () => {
      clearInterval(pulse);
      const current = latestActivity.current.room;
      if (!current || current.roomId !== binding.roomId) return;
      // Best effort withdrawal; the server's independent readiness lease also expires.
      void Promise.resolve().then(() => activityBridge().command(binding.roomId, {protocolVersion:1,commandId:crypto.randomUUID(),expectedRevision:current.revision,command:{type:'cinema.release',itemId:binding.itemId,timelineEpoch:binding.timelineEpoch,sourceVersion:binding.sourceVersion}})).catch(()=>{});
    };
  }, [binding, community.user?.id]);
  if (!media) return null;
  return <div aria-hidden={!active && miniHidden} inert={!active && miniHidden} className={`cinema-page reference-cinema-player cinema-persistent ${active ? '' : 'cinema-mini'} ${collapsed ? 'cinema-mini-collapsed' : ''} ${!active && miniHidden ? 'cinema-mini-hidden' : ''} ${binding ? 'cinema-bound' : ''}`}>
<div className="cinema-heading"><div><span className="eyebrow">{binding ? 'CINEMA' : 'KİŞİSEL SİNEMA'}</span><h2>{binding?.title ?? media.name}</h2><p>{binding ? 'Kendi kaynağın · oda zaman çizelgesi' : 'Kişisel oynatma'}</p></div>{binding && <button className="button secondary small" onClick={()=>navigate('/cinema?view=queue')}><ReferenceIcon name="queue" size={16}/>Ortak kuyruk</button>}<button className="button secondary small" onClick={clearCinemaSession}>Oynatmayı bitir</button><button className="button secondary small" disabled={!window.rooms} title={!window.rooms ? 'Masaüstü uygulaması gerekli' : 'Kendi dosyanı bu cihazda oynat'} onClick={() => void choose()}><FolderOpen size={16}/>Kaynak seç</button></div>
    {binding && active && hostNotice && <div className="reference-cinema-notice cinema-host-notice" role="status"><ReferenceIcon name="check" size={18}/>{hostNotice}</div>}
    {binding && active && (!declaration?.ready || playbackNotice) && !reconnecting && <div className="reference-cinema-notice cinema-source-readiness"><div><strong>{binding.title}</strong><p>{playbackNotice || (activity.status === 'error' ? 'Etkinlik bağlantısı kesildi. Kişisel kaynak bekletiliyor.' : declaration?.ready ? `Kaynağın hazır · ${activity.room?.cinema?.sources.filter(source=>source.ready).length ?? 0} katılımcı hazır` : activity.room?.cinema?.durationSec && duration > 0 && Math.abs(activity.room.cinema.durationSec - duration) > 2 ? 'Kaynak süreleri farklı. Aynı kurguya ait başka bir kaynak seç.' : 'Kaynağını kontrol edip hazır olduğunu bildir.')}</p>{!declaration?.ready && <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Seçtiğim dosya odadaki içerikle aynı; bu kaynağa erişimim var.</label>}<small>Süre benzerliği içeriğin aynı olduğunu kanıtlamaz. Dosyan paylaşılmaz.</small></div><button className="button primary" disabled={!!declaration?.ready || !cinemaSourceReadiness({duration,expectedDuration:activity.room?.cinema?.durationSec ?? null,mediaReady:(video.current?.readyState ?? 0)>=2,buffering,error,confirmed,connected:activity.status==='connected',busy:joining}).canJoin} onClick={()=>void joinSource()}>{joining ? 'Hazırlanıyor' : declaration?.ready ? 'Hazır' : 'Hazırım, katıl'}</button><button className="button secondary" onClick={()=>navigate('/cinema?view=queue')}>Ortak kuyruk</button></div>}
    <div className="cinema-main"><div ref={stage} data-fullscreen={fullscreen ? 'true' : 'false'} className={`cinema-stage ${visible || !playing ? 'controls-visible' : ''} ${fullscreen && window.rooms ? 'native-fullscreen' : ''} ${buffering || reconnecting || error ? 'cinema-state-suspended' : ''}`} onMouseMove={reveal} onFocusCapture={reveal} onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button,input')) void enterFullscreen(); }}>
      <video ref={video} preload="metadata" playsInline aria-label="Seçtiğin kişisel video" onLoadedMetadata={() => { setDuration(Number.isFinite(video.current?.duration) ? video.current!.duration : 0); if (video.current) { video.current.volume = volume; video.current.playbackRate = speed; } }} onTimeUpdate={() => setPosition(video.current?.currentTime ?? 0)} onPlay={() => { nativePlayback(true); setPlaying(true); setEnded(false); reveal(); }} onPause={() => { nativePlayback(false); setPlaying(false); setVisible(true); }} onWaiting={()=>setBuffering(true)} onCanPlay={()=>setBuffering(false)} onEnded={() => { if (binding && declaration?.ready && video.current) void sharedPlayback(false, Math.min(duration, activity.room?.cinema?.durationSec ?? duration), video.current.playbackRate); setPlaying(false); setVisible(true); setEnded(true); clearCaption(); }} onError={() => { if (!fixtureMedia || fixtureError) setError('Bu dosyanın medya biçimi oynatılamıyor. Başka bir dosya seç veya sistem oynatıcısını kullan.'); }} onClick={() => void toggle()}>{caption && <track ref={captionElement} kind="subtitles" src={caption.url} label={caption.name}/>}</video>
      {captionText && <div className="cinema-caption" data-controls={visible || !playing ? 'visible' : 'hidden'}>{captionText}</div>}
      {fullscreen&&<div className="reference-cinema-full-top"><button className="button secondary" onClick={()=>void enterFullscreen()}><ReferenceIcon name="arrow-left" size={17}/></button><div><strong>{media.name}</strong><small>{binding ? 'Kendi kaynağın · oda zaman çizelgesi' : 'Kişisel oynatma · yalnızca bu cihazda'}</small></div><button className="button secondary" onClick={()=>{void enterFullscreen().then(()=>navigate('/chat'));}}>Sohbet</button></div>}{fullscreen&&realtime.status==='connected'&&<div className="reference-cinema-full-voice"><ReferenceIcon name="headphones" size={15}/>{realtime.roomName} · ses bağlantısı açık<IconButton label={realtime.muted?'Mikrofonu aç':'Mikrofonu kapat'} onClick={()=>command(toggleMic())}><ReferenceIcon name={realtime.muted?'mic-off':'mic'} size={16}/></IconButton></div>}<div className="stage-top"><span className="stage-label"><Film size={14}/>{binding ? 'Cinema · kendi kaynağın' : 'Kişisel dosya'}</span><span className="pill">{binding ? `${readySources.length} kaynak hazır` : 'Yalnızca bu cihazda'}</span></div>
      {(buffering || reconnecting) && !error && <div className="reference-cinema-buffering" role="status"><span className="reference-cinema-spinner"/><h3>{reconnecting ? 'Odaya yeniden bağlanıyor' : 'Kaynağın hazırlanıyor'}</h3><p>{reconnecting ? 'Kişisel kaynağın korunuyor. Bağlantı geri geldiğinde oda zaman çizelgesi yeniden alınır.' : binding ? 'Kaynağın hazır olduğunda oda zaman çizelgesine dönebilirsin.' : 'Kişisel kaynağın yükleniyor.'}</p>{reconnecting && <button className="button secondary" onClick={()=>void activity.refresh()}>Bağlantıyı kontrol et</button>}</div>}{ended&&!error&&<div className="reference-cinema-ended" role="status">Oynatma sona erdi</div>}{!playing && !error && !buffering && !reconnecting && <button className="stage-play" disabled={!canControl} title={!canControl ? controlReason : undefined} aria-label="Videoyu oynat" onClick={() => void toggle()}><Play size={29} fill="currentColor"/></button>}
      {error && <div className="player-error" role="alert"><Film size={28}/><h3>{binding ? 'Kendi kaynağın kullanılamıyor' : 'Oynatma durdu'}</h3><p>{error}</p>{binding && <p>Diğer katılımcılar kendi kaynaklarıyla devam edebilir.</p>}<button className="button primary" disabled={!window.rooms} title={!window.rooms ? 'Masaüstü uygulaması gerekli.' : undefined} onClick={()=>void choose()}><FolderOpen size={16}/>Başka kaynak seç</button><button className="button primary" onClick={() => { setError(''); video.current?.load(); }}><RotateCcw size={16}/>Yeniden yükle</button><button className="button secondary" disabled={!window.rooms} title={!window.rooms ? 'Masaüstü uygulaması gerekli.' : undefined} onClick={() => void window.rooms?.openMediaExternal(media.url).then(ok => { if (!ok) notify('Sistem oynatıcısı açılamadı.'); }).catch(e => notify(uiError(e)))}>Sistem oynatıcısında aç</button></div>}
      <div className={`player-overlay ${buffering || reconnecting || error ? 'cinema-overlay-suspended' : ''}`}><div className="player-title"><span>{binding ? 'ODA ZAMAN ÇİZELGESİ' : 'KİŞİSEL OYNATMA'}</span><h3>{media.name}</h3><p>Dosyan diğer kişilere aktarılmaz.</p></div><div className="player-controls glass"><div className="scrubber-row"><span>{clock(position)}</span><input type="range" aria-label={tr('Playback position')} disabled={!canControl} title={!canControl ? controlReason : undefined} min={0} max={duration || 1} step={.1} value={position} onChange={e => seek(Number(e.target.value))} style={{ '--progress': `${duration ? position / duration * 100 : 0}%` } as React.CSSProperties}/><span>{clock(duration)}</span></div><div className="player-control-row"><div className="control-cluster"><IconButton label="10 saniye geri" disabled={!canControl} title={!canControl ? controlReason : undefined} onClick={() => seek(position - 10)}><SkipBack size={18}/></IconButton><IconButton label={playing ? 'Videoyu duraklat' : 'Videoyu oynat'} className="primary-play" disabled={!canControl} title={!canControl ? controlReason : undefined} onClick={() => void toggle()}>{playing ? <Pause size={20}/> : <Play size={20}/>}</IconButton><IconButton label="10 saniye ileri" disabled={!canControl} title={!canControl ? controlReason : undefined} onClick={() => seek(position + 10)}><SkipForward size={18}/></IconButton><div className="volume-control"><IconButton label={volume ? tr('Mute video') : tr('Unmute video')} onClick={() => { const next = volume ? 0 : .65; setVolume(next); if (video.current) video.current.volume = next; }}>{volume ? <Volume2 size={18}/> : <VolumeX size={18}/>}</IconButton><input aria-label={tr('Video volume')} type="range" min={0} max={1} step={.01} value={volume} onChange={e => { const next = Number(e.target.value); setVolume(next); if (video.current) video.current.volume = next; }}/></div></div><div className="control-cluster"><span className="source-note">{binding ? declaration?.ready && activity.status === 'connected' ? 'Oda zaman çizelgesi' : 'Kaynak bekleniyor' : `${speed}×`}</span><IconButton label={tr('Playback settings')} onClick={() => setSettings(true)}><Settings2 size={18}/></IconButton><IconButton label={pip ? 'Küçük pencereyi kapat' : tr('Picture in picture')} disabled={!document.pictureInPictureEnabled || duration <= 0} title={!document.pictureInPictureEnabled ? 'Bu ortam resim içinde resim desteklemiyor.' : duration <= 0 ? 'Videonun yüklenmesini bekle.' : undefined} onClick={async () => { try { if (document.pictureInPictureElement === video.current) await document.exitPictureInPicture(); else await video.current?.requestPictureInPicture(); } catch { notify('Resim içinde resim açılamadı. Videonun yüklenmesini bekleyip yeniden dene.'); } }}><PictureInPicture2 size={18}/></IconButton><IconButton label={fullscreen ? tr('Exit fullscreen') : tr('Fullscreen cinema')} onClick={() => void enterFullscreen()}>{fullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}</IconButton></div></div></div></div>
    </div>
    <div className="reference-cinema-personal-note"><ReferenceIcon name="lock" size={14}/>{binding ? 'Kendi kaynağın · oda zaman çizelgesi' : 'Kişisel oynatma · oda zaman çizelgesinden bağımsız.'}</div><div className="cinema-bottom"><div className="reference-cinema-avatar-stack">{realtime.participants.slice(0,6).map(person=><VoiceAvatar key={person.id} id={person.id} name={person.name}/>)}</div><div><strong>{binding ? `${readySources.length} kaynak hazır` : realtime.status === 'connected' ? realtime.roomName : 'Ses odası'}</strong><p>{realtime.status === 'connected' ? `${realtime.participants.length} kişi ses odasında` : realtime.status === 'reconnecting' ? 'Ses yeniden bağlanıyor' : 'Ses bağlantısı yok'}</p></div><button className="text-button" onClick={() => navigate('/voice')}><Headphones size={16}/>Salona dön</button><IconButton label="Sohbeti aç" onClick={() => navigate('/chat')}><MessageCircle size={17}/></IconButton></div></div>
    {!active && error && <p className="cinema-mini-error" role="alert">{error}</p>}
    {!active && !miniHidden && <MiniPlaybackChrome title={binding?.title ?? media.name} personal={!binding} playing={playing} time={`${clock(position)} / ${clock(duration)}`} compact={collapsed} voiceStatus={realtime.status} muted={realtime.muted} canControl={canControl} controlReason={controlReason} onToggle={() => void toggle()} onMute={() => command(toggleMic())} onReturn={() => navigate('/cinema?view=personal')} onCompact={() => setCollapsed(value => !value)} onHide={() => setMiniHidden(true)}/>}
    {active && binding && activity.room && !declaration?.ready && dismissedSourceCheck !== media && !reconnecting && <CinemaSourceCheck title={binding.title} sourceName={media.name} position={activity.room.timeline.positionSec} readiness={{duration,expectedDuration:activity.room.cinema?.durationSec ?? null,mediaReady:(video.current?.readyState ?? 0)>=2,buffering,error,confirmed,connected:activity.status==='connected',busy:joining}} nativeAvailable={!!window.rooms} onConfirm={setConfirmed} onChoose={()=>void choose()} onJoin={()=>void joinSource()} onClose={()=>setDismissedSourceCheck(media)}/>}
    {active && settings && <Modal title="Oynatma ayarları" onClose={closeSettings}><div className="cinema-caption-settings"><h3>Altyazı</h3>{caption ? <><label className="cinema-caption-toggle"><input type="checkbox" checked={captionEnabled} onChange={e => setCaptionEnabled(e.target.checked)}/>{caption.name}</label><button className="button secondary" onClick={clearCaption}>Altyazıyı kaldır</button></> : <p>Altyazı seçilmedi.</p>}<button className="button secondary" disabled={!window.rooms?.chooseCaption || captionBusy} title={!window.rooms?.chooseCaption ? 'Yerel altyazı seçimi masaüstü uygulamasında kullanılabilir.' : undefined} onClick={() => void chooseCaption()}>{captionBusy ? 'Dosya seçiliyor…' : 'WebVTT dosyası seç'}</button></div><label className="field-label">OYNATMA HIZI<select aria-label={tr('Playback speed')} disabled={!canControl} title={!canControl ? controlReason : undefined} value={speed} onChange={e => { const next = Number(e.target.value); if (binding && video.current) void sharedPlayback(latestActivity.current.room?.timeline.playing ?? false, video.current.currentTime, next); else { setSpeed(next); if (video.current) video.current.playbackRate = next; } }}>{[.5, .75, 1, 1.25, 1.5, 2].map(n => <option value={n} key={n}>{n}×</option>)}</select></label><button className="button secondary full" onClick={() => { seek(0); closeSettings(); }}><RotateCcw size={16}/>Baştan başlat</button></Modal>}
  </div>;
}
