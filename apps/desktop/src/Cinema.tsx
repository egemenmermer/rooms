import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, FolderOpen, Headphones, Maximize, MessageCircle, Minimize, Pause, PictureInPicture2, Play, RotateCcw, Settings2, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { EmptyState, IconButton, Modal } from '@rooms/design';
import { tr, uiError } from './i18n';
import { useRealtime } from './realtime';

const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
export default function Cinema({ notify }: { notify(message: string): void }) {
  const navigate = useNavigate(), realtime = useRealtime();
  const video = useRef<HTMLVideoElement>(null), stage = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [media, setMedia] = useState<{ url: string; name: string } | null>(null);
  const [playing, setPlaying] = useState(false), [position, setPosition] = useState(0), [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(.65), [visible, setVisible] = useState(true), [error, setError] = useState('');
  const [settings, setSettings] = useState(false), [speed, setSpeed] = useState(1), [fullscreen, setFullscreen] = useState(false);
  const choose = async () => {
    try {
      const selected = await window.rooms?.chooseMedia();
      if (selected) { video.current?.pause(); setMedia(selected); setError(''); setPosition(0); setDuration(0); setPlaying(false); }
    } catch (e) { notify(uiError(e)); }
  };
  const reveal = useCallback(() => {
    setVisible(true); if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { if (video.current && !video.current.paused && !stage.current?.contains(document.activeElement)) setVisible(false); }, 2800);
  }, []);
  const toggle = useCallback(async () => {
    const v = video.current; if (!v) return;
    if (v.paused) { try { await v.play(); setError(''); } catch { setError('Dosya oynatılamadı. Yeniden yükle veya başka bir dosya seç.'); } }
    else v.pause(); reveal();
  }, [reveal]);
  const seek = useCallback((value: number) => {
    const v = video.current; if (v && Number.isFinite(v.duration)) { v.currentTime = Math.max(0, Math.min(v.duration, value)); setPosition(v.currentTime); } reveal();
  }, [reveal]);
  const enterFullscreen = useCallback(async () => {
    try {
      if (window.rooms) { await window.rooms.windowAction('fullscreen'); setFullscreen(value => !value); }
      else if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen();
    } catch { notify('Tam ekran açılamadı. Pencerenin tam ekran düğmesini deneyebilirsin.'); }
  }, [notify]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable="true"]') || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape' && fullscreen) { e.preventDefault(); void enterFullscreen(); }
      if (!media) return;
      if (e.code === 'Space') { e.preventDefault(); void toggle(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seek((video.current?.currentTime ?? 0) + (e.key === 'ArrowLeft' ? -5 : 5)); }
    };
    const fs = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', keys); document.addEventListener('fullscreenchange', fs);
    return () => { window.removeEventListener('keydown', keys); document.removeEventListener('fullscreenchange', fs); if (idle.current) clearTimeout(idle.current); };
  }, [media, fullscreen, enterFullscreen, seek, toggle]);
  const closeSettings = useCallback(() => setSettings(false), []);
  return <div className="cinema-page page-enter"><div className="cinema-heading"><div><span className="eyebrow">KİŞİSEL SİNEMA</span><h2>{media?.name ?? 'Sinema'}</h2></div><button className="button secondary small" disabled={!window.rooms} title={!window.rooms ? 'Masaüstü uygulaması gerekli' : 'Kendi dosyanı bu cihazda oynat'} onClick={() => void choose()}><FolderOpen size={16}/>Dosya aç</button></div>
    <div className="cinema-main">{!media ? <div className="cinema-stage cinema-empty"><EmptyState icon={<Film size={38}/>} title="Dosya seçilmedi."><div className="button-row"><button className="button primary" disabled={!window.rooms} title={!window.rooms ? 'Masaüstü uygulaması gerekli' : ''} onClick={() => void choose()}><FolderOpen size={16}/>Dosya seç</button><button className="button secondary" onClick={() => navigate('/youtube')}>Birlikte YouTube</button></div></EmptyState></div> : <div ref={stage} data-fullscreen={fullscreen ? 'true' : 'false'} className={`cinema-stage ${visible || !playing ? 'controls-visible' : ''} ${fullscreen && window.rooms ? 'native-fullscreen' : ''}`} onMouseMove={reveal} onFocusCapture={reveal} onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button,input')) void enterFullscreen(); }}>
      <video ref={video} src={media.url} preload="metadata" playsInline aria-label="Seçtiğin kişisel video" onLoadedMetadata={() => { setDuration(video.current?.duration ?? 0); if (video.current) { video.current.volume = volume; video.current.playbackRate = speed; } }} onTimeUpdate={() => setPosition(video.current?.currentTime ?? 0)} onPlay={() => { setPlaying(true); reveal(); }} onPause={() => { setPlaying(false); setVisible(true); }} onEnded={() => { setPlaying(false); setVisible(true); }} onError={() => setError('Bu dosyanın medya biçimi oynatılamıyor. Başka bir dosya seç veya sistem oynatıcısını kullan.')} onClick={() => void toggle()}/>
      <div className="stage-top"><span className="stage-label"><Film size={14}/>KİŞİSEL DOSYA</span><span className="pill">YALNIZCA BU CİHAZDA</span></div>
      {!playing && !error && <button className="stage-play" aria-label="Videoyu oynat" onClick={() => void toggle()}><Play size={29} fill="currentColor"/></button>}
      {error && <div className="player-error" role="alert"><Film size={28}/><h3>Oynatma durdu.</h3><p>{error}</p><button className="button primary" onClick={() => { setError(''); video.current?.load(); }}><RotateCcw size={16}/>Yeniden yükle</button><button className="button secondary" onClick={() => void window.rooms?.openMediaExternal(media.url).then(ok => { if (!ok) notify('Sistem oynatıcısı açılamadı.'); }).catch(e => notify(uiError(e)))}>Sistem oynatıcısında aç</button></div>}
      <div className="player-overlay"><div className="player-title"><span>KİŞİSEL OYNATMA</span><h3>{media.name}</h3><p>Dosyan diğer kişilere aktarılmaz.</p></div><div className="player-controls glass"><div className="scrubber-row"><span>{clock(position)}</span><input type="range" aria-label={tr('Playback position')} min={0} max={duration || 1} step={.1} value={position} onChange={e => seek(Number(e.target.value))} style={{ '--progress': `${duration ? position / duration * 100 : 0}%` } as React.CSSProperties}/><span>{clock(duration)}</span></div><div className="player-control-row"><div className="control-cluster"><IconButton label={tr('Seek back 5 seconds')} onClick={() => seek(position - 5)}><SkipBack size={18}/></IconButton><IconButton label={playing ? 'Videoyu duraklat' : 'Videoyu oynat'} className="primary-play" onClick={() => void toggle()}>{playing ? <Pause size={20}/> : <Play size={20}/>}</IconButton><IconButton label={tr('Seek forward 5 seconds')} onClick={() => seek(position + 5)}><SkipForward size={18}/></IconButton><div className="volume-control"><IconButton label={volume ? tr('Mute video') : tr('Unmute video')} onClick={() => { const next = volume ? 0 : .65; setVolume(next); if (video.current) video.current.volume = next; }}>{volume ? <Volume2 size={18}/> : <VolumeX size={18}/>}</IconButton><input aria-label={tr('Video volume')} type="range" min={0} max={1} step={.01} value={volume} onChange={e => { const next = Number(e.target.value); setVolume(next); if (video.current) video.current.volume = next; }}/></div></div><div className="control-cluster"><span className="source-note">{speed}×</span><IconButton label={tr('Playback settings')} onClick={() => setSettings(true)}><Settings2 size={18}/></IconButton><IconButton label={tr('Picture in picture')} onClick={async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.current?.requestPictureInPicture(); } catch { notify('Resim içinde resim için videonun yüklenmesini bekle.'); } }}><PictureInPicture2 size={18}/></IconButton><IconButton label={fullscreen ? tr('Exit fullscreen') : tr('Fullscreen cinema')} onClick={() => void enterFullscreen()}>{fullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}</IconButton></div></div></div></div>
    </div>}
    <div className="cinema-bottom"><Headphones size={18}/><div><strong>{realtime.status === 'connected' ? realtime.roomName : 'Ses odası'}</strong><p>{realtime.status === 'connected' ? 'İzlerken ses odan bağlı kalır.' : ''}</p></div><button className="text-button" onClick={() => navigate('/voice')}>Ses odası</button><IconButton label="Sohbeti aç" onClick={() => navigate('/chat')}><MessageCircle size={17}/></IconButton></div></div>
    {settings && <Modal title="Oynatma ayarları" onClose={closeSettings}><label className="field-label">OYNATMA HIZI<select aria-label={tr('Playback speed')} value={speed} onChange={e => { const next = Number(e.target.value); setSpeed(next); if (video.current) video.current.playbackRate = next; }}>{[.5, .75, 1, 1.25, 1.5, 2].map(n => <option value={n} key={n}>{n}×</option>)}</select></label><button className="button secondary full" onClick={() => { seek(0); closeSettings(); }}><RotateCcw size={16}/>Baştan başlat</button></Modal>}
  </div>;
}
