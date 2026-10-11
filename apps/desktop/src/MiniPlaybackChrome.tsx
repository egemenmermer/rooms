import { Film, Headphones, LockKeyhole, Maximize, Mic, MicOff, Minimize, Pause, Play, Tv, X } from 'lucide-react';
import './reference-mini-playback.css';

export interface MiniPlaybackChromeProps {
  title: string; personal: boolean; live?: boolean; playing: boolean; time: string; compact: boolean;
  voiceStatus: string; muted: boolean; canControl?: boolean; controlReason?: string;
  onToggle(): void; onMute(): void; onReturn(): void; onCompact(): void; onHide(): void;
}

/** Controls overlay the existing persistent media element; closing never owns the source. */
export function MiniPlaybackChrome({ title, personal, live, playing, time, compact, voiceStatus, muted, canControl = true, controlReason, onToggle, onMute, onReturn, onCompact, onHide }: MiniPlaybackChromeProps) {
  const connected = voiceStatus === 'connected';
  return <div className={`mini-playback-chrome ${compact ? 'compact' : ''}`} role="region" aria-label={live ? 'Canlı yayın küçük oynatıcı' : 'Küçük oynatıcı'}>
    {!compact && <header className="mini-playback-header"><button className="mini-playback-title" onClick={onReturn}>{personal ? <LockKeyhole size={15}/> : live ? <Tv size={15}/> : <Film size={15}/>}<strong>{title}</strong></button><button aria-label="Oynatıcıya dön" onClick={onReturn}><Maximize size={17}/></button><button aria-label="Küçük oynatıcıyı gizle" onClick={onHide}><X size={18}/></button></header>}
    <footer className="mini-playback-footer"><button aria-label={playing ? 'Videoyu duraklat' : 'Videoyu oynat'} disabled={!canControl} title={!canControl ? controlReason : undefined} onClick={onToggle}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><button aria-label={muted ? 'Mikrofonu aç' : 'Mikrofonu kapat'} disabled={!connected} title={!connected ? 'Önce ses odasına bağlan.' : undefined} onClick={onMute}>{muted ? <MicOff size={18}/> : <Mic size={18}/>}</button><span className="mini-playback-time">{time}</span>{personal ? <span className="mini-playback-badge private"><LockKeyhole size={12}/>Yalnızca sen</span> : <span className={`mini-playback-badge ${connected ? 'connected' : ''}`}><Headphones size={12}/>{connected ? 'Ses açık' : voiceStatus === 'reconnecting' ? 'Bağlanıyor' : 'Ses kapalı'}</span>}{compact && <button aria-label="Küçük oynatıcıyı gizle" onClick={onHide}><X size={18}/></button>}</footer>
    {!compact && <button className="mini-playback-compact" aria-label="Kompakt oynatıcıya geç" onClick={onCompact}><Minimize size={13}/></button>}
    {compact && <button className="mini-playback-expand" aria-label="Küçük oynatıcıyı büyüt" onClick={onCompact}/>}
  </div>;
}
