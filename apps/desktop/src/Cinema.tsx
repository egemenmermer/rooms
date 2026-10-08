import { tr } from './i18n';
import { useActivityRoom } from './activity';
import { useCurrentRoom } from './Agent';
import { SharedCinema } from './SharedCinema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FolderOpen, AudioLines, Check, ChevronDown, Film, Headphones, ListVideo, Maximize, MessageCircle, MicOff, Minimize, Pause, PictureInPicture2, Play, Plus, RotateCcw, Send, Settings2, SkipBack, SkipForward, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { Avatar, AvatarStack, IconButton, Modal } from '@rooms/design';
import { useRooms } from './store';
import { useCommunity } from './community';
import { useNavigate } from 'react-router-dom';
import { useRealtime } from './realtime';
const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
export default function Cinema({ notify }: {
    notify(message: string): void;
}) {
    const video = useRef<HTMLVideoElement>(null), stage = useRef<HTMLDivElement>(null), idle = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { preferences: p, queue, addQueue, removeQueue, moveQueue, joinPreview, voiceRoom, messages, activeSpace, sendMessage } = useRooms();
    const navigate = useNavigate();
    const community = useCommunity();
    const realtime = useRealtime();
    const demo = community.mode === 'demo';
    const [personalMedia, setPersonalMedia] = useState<{
        url: string;
        name: string;
    } | null>(null);
    const roomId = useCurrentRoom(), activity = useActivityRoom(roomId), liveActivity = useRef(activity);
    liveActivity.current = activity;
    const shared = activity.room?.primary?.activity === 'cinema' && !personalMedia;
    const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (seekTimer.current)
        clearTimeout(seekTimer.current); }, []);
    const broadcast = useCallback((playing: boolean, positionSec: number, rate: number) => { const current = liveActivity.current; if (!personalMedia && current.room?.primary?.activity === 'cinema')
        void current.send({ type: 'playback', playing, positionSec, rate }).catch(() => { }); }, [personalMedia]);
    const displayName = demo ? p.displayName : community.user?.displayName ?? tr("You");
    const [playing, setPlaying] = useState(false), [position, setPosition] = useState(0), [duration, setDuration] = useState(0), [volume, setVolume] = useState(.65), [visible, setVisible] = useState(true), [error, setError] = useState(''), [tab, setTab] = useState<'queue' | 'chat' | 'voice' | null>('queue'), [settings, setSettings] = useState(false), [speed, setSpeed] = useState(1), [fullscreen, setFullscreen] = useState(false), [draft, setDraft] = useState('');
    const reveal = useCallback(() => {
        setVisible(true);
        if (idle.current)
            clearTimeout(idle.current);
        idle.current = setTimeout(() => {
            if (video.current && !video.current.paused && !stage.current?.contains(document.activeElement))
                setVisible(false);
        }, 2800);
    }, []);
    const toggle = useCallback(async () => {
        const v = video.current;
        if (!v)
            return;
        if (v.paused) {
            try {
                await v.play();
                setError('');
            }
            catch {
                setError(tr("The local video could not start. Try loading the demo again."));
            }
        }
        else
            v.pause();
        broadcast(!v.paused, v.currentTime, v.playbackRate);
        reveal();
    }, [reveal, broadcast]);
    const seek = useCallback((value: number) => {
        if (video.current && Number.isFinite(video.current.duration)) {
            video.current.currentTime = Math.max(0, Math.min(video.current.duration, value));
            setPosition(video.current.currentTime);
            if (seekTimer.current)
                clearTimeout(seekTimer.current);
            seekTimer.current = setTimeout(() => { const v = video.current; if (v)
                broadcast(!v.paused, v.currentTime, v.playbackRate); }, 180);
        }
        reveal();
    }, [reveal, broadcast]);
    const enterFullscreen = useCallback(async () => {
        try {
            if (window.rooms) {
                await window.rooms.windowAction('fullscreen');
                setFullscreen(value => !value);
            }
            else if (document.fullscreenElement)
                await document.exitFullscreen();
            else
                await stage.current?.requestFullscreen();
        }
        catch {
            notify(tr("Fullscreen could not open. Try the native window fullscreen control."));
        }
    }, [notify]);
    useEffect(() => {
        const listener = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && fullscreen && window.rooms && !document.querySelector('[role="dialog"]')) {
                e.preventDefault();
                void enterFullscreen();
                return;
            }
            if ((e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable="true"]') || document.querySelector('[role="dialog"]'))
                return;
            if (e.code === 'Space') {
                e.preventDefault();
                void toggle();
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                seek((video.current?.currentTime ?? 0) - 5);
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                seek((video.current?.currentTime ?? 0) + 5);
            }
        };
        const fs = () => setFullscreen(Boolean(document.fullscreenElement));
        window.addEventListener('keydown', listener);
        document.addEventListener('fullscreenchange', fs);
        return () => {
            window.removeEventListener('keydown', listener);
            document.removeEventListener('fullscreenchange', fs);
            if (idle.current)
                clearTimeout(idle.current);
        };
    }, [toggle, seek, fullscreen, enterFullscreen]);
    useEffect(() => { const v = video.current, timeline = activity.room?.timeline; if (!v || !shared || !timeline || !duration)
        return; const item = activity.room?.queue.find(i => i.id === timeline.itemId); if (item?.media.kind !== 'independent-source' || item.media.referenceId !== 'rooms-blue-hour-v1') {
        v.pause();
        setError(tr("Bu cihazda se\u00E7ili medya i\u00E7in e\u015Fle\u015Fen yetkili kaynak yok. Ortak s\u0131radan Mavi saat demosunu se\u00E7."));
        return;
    } setError(''); const expected = Math.min(duration, timeline.positionSec + (timeline.playing ? Math.max(0, Date.now() + activity.serverOffsetMs - timeline.effectiveServerTimeMs) / 1000 * timeline.rate : 0)); if (Math.abs(v.currentTime - expected) > 1.1)
        v.currentTime = expected; v.playbackRate = timeline.rate; setSpeed(timeline.rate); if (timeline.playing && v.paused)
        void v.play().catch(() => setError(tr("Otomatik oynatma engellendi. Devam etmek i\u00E7in oynat d\u00FC\u011Fmesine bas.")));
    else if (!timeline.playing && !v.paused)
        v.pause(); }, [activity.room?.timeline.effectiveServerTimeMs, activity.room?.timeline.epoch, shared, duration, activity.serverOffsetMs]);
    const closeSettings = useCallback(() => setSettings(false), []);
    return <div className="cinema-page page-enter"><div className="cinema-heading"><div><span className="eyebrow">{tr("THE CLUBHOUSE / LOCAL THEATER")}</span><h2>{tr("A seat for you.")}</h2></div><div className="cinema-company"><AvatarStack names={(demo && p.demoFixtures) ? ['Maya', 'Sofia', 'Oliver'] : []}/><span>{(demo && p.demoFixtures) ? tr("Sample company") : tr("Your private theater")}<small>{tr("Local playback \u00B7 no broadcast")}</small></span></div></div><div className={`cinema-layout ${tab ? 'has-dock' : ''}`}><div className="cinema-main"><div ref={stage} data-fullscreen={fullscreen ? 'true' : 'false'} className={`cinema-stage ${visible || !playing ? 'controls-visible' : ''} ${fullscreen && window.rooms ? 'native-fullscreen' : ''}`} onMouseMove={reveal} onFocusCapture={reveal} onDoubleClick={e => {
            if (!(e.target as HTMLElement).closest('button,input'))
                void enterFullscreen();
        }}><video ref={video} src={personalMedia?.url ?? "./blue-hour.mp4"} poster={personalMedia ? undefined : "./artwork/blue-hour.jpg"} preload="metadata" playsInline onLoadedMetadata={() => { setDuration(video.current?.duration ?? 0); if (video.current)
        video.current.volume = volume; }} onTimeUpdate={() => setPosition(video.current?.currentTime ?? 0)} onPlay={() => { setPlaying(true); reveal(); }} onPause={() => { setPlaying(false); setVisible(true); }} onEnded={() => { setPlaying(false); if (shared) {
        const current = liveActivity.current, items = current.room?.queue ?? [], index = items.findIndex(i => i.id === current.room?.timeline.itemId), next = items[index + 1];
        broadcast(false, video.current?.duration ?? 0, speed);
        if (next)
            void current.send({ type: 'queue.select', itemId: next.id }).then(() => current.send({ type: 'playback', playing: true, positionSec: 0, rate: speed })).catch(() => { });
    } notify(tr("Blue hour has ended. Replay it or choose your next activity.")); }} onError={() => setError(personalMedia ? tr("Bu dosyan\u0131n medya bi\u00E7imi oynat\u0131lam\u0131yor. Ba\u015Fka bir dosya se\u00E7 veya sistem oynat\u0131c\u0131s\u0131n\u0131 kullan.") : tr("The bundled demonstration video is unavailable. Reload it to try again."))} onClick={() => void toggle()} aria-label={tr("Blue hour original local demo video")}/>
        <div className="stage-top"><span className="stage-label"><Film size={14}/>{personalMedia ? tr("K\u0130\u015E\u0130SEL DOSYA") : tr("ROOMS ORIGINAL DEMO")}</span><span className="pill">{shared ? 'ORTAK OYNATMA' : tr("PERSONAL PLAYBACK")}</span></div>
        {!playing && !error && <button className="stage-play" aria-label={position > 0 ? tr("Resume Blue hour") : tr("Play Blue hour")} onClick={() => void toggle()}><Play size={29} fill="currentColor"/></button>}
        {error && <div className="player-error" role="alert"><Film size={28}/><h3>{tr("A pause in the evening.")}</h3><p>{error}</p><button className="button primary" onClick={() => { setError(''); video.current?.load(); }}><RotateCcw size={16}/>{personalMedia ? tr("Yeniden y\u00FCkle") : tr("Reload demo")}</button>{personalMedia && <button className="button secondary" onClick={() => void window.rooms?.openMediaExternal(personalMedia.url).then(ok => { if (!ok)
        notify(tr("Sistem oynat\u0131c\u0131s\u0131 a\u00E7\u0131lamad\u0131.")); }).catch(e => notify(e.message))}>{tr("Sistem oynat\u0131c\u0131s\u0131nda a\u00E7")}</button>}</div>}
        <div className="player-overlay"><div className="player-title"><span>{personalMedia ? tr("K\u0130\u015E\u0130SEL OYNATMA") : tr("AN ORIGINAL VISUAL STUDY")}</span><h3>{personalMedia?.name ?? tr("Blue hour")}<span>.</span></h3><p>{personalMedia ? tr("Yaln\u0131zca bu cihazda oynat\u0131l\u0131r.") : tr("A moment between the mountains and the night.")}</p></div><div className="player-controls glass"><div className="scrubber-row"><span>{clock(position)}</span><input type="range" aria-label={tr("Playback position")} min={0} max={duration || 1} step={.1} value={position} onChange={e => seek(Number(e.target.value))} style={{ '--progress': `${duration ? position / duration * 100 : 0}%` } as React.CSSProperties}/><span>{clock(duration)}</span></div><div className="player-control-row"><div className="control-cluster"><IconButton label={tr("Seek back 5 seconds")} onClick={() => seek(position - 5)}><SkipBack size={18}/></IconButton><IconButton label={playing ? tr("Pause local video") : tr("Play local video")} className="primary-play" onClick={() => void toggle()}>{playing ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</IconButton><IconButton label={tr("Seek forward 5 seconds")} onClick={() => seek(position + 5)}><SkipForward size={18}/></IconButton><div className="volume-control"><IconButton label={volume ? tr("Mute video") : tr("Unmute video")} onClick={() => {
            const value = volume ? 0 : .65;
            setVolume(value);
            if (video.current)
                video.current.volume = value;
        }}>{volume ? <Volume2 size={18}/> : <VolumeX size={18}/>}</IconButton><input aria-label={tr("Video volume")} type="range" min={0} max={1} step={.01} value={volume} onChange={e => {
            setVolume(Number(e.target.value));
            if (video.current)
                video.current.volume = Number(e.target.value);
        }}/></div></div><div className="control-cluster"><span className="source-note">{tr("LOCAL \u00B7") + " "}{speed}×</span><IconButton label={tr("Playback settings")} onClick={() => setSettings(true)}><Settings2 size={18}/></IconButton><IconButton label={tr("Picture in picture")} onClick={async () => {
            try {
                if (document.pictureInPictureElement)
                    await document.exitPictureInPicture();
                else
                    await video.current?.requestPictureInPicture();
            }
            catch {
                notify(tr("Picture in picture is unavailable until the local video is loaded."));
            }
        }}><PictureInPicture2 size={18}/></IconButton><IconButton label={fullscreen ? tr("Exit fullscreen") : tr("Fullscreen cinema")} onClick={() => void enterFullscreen()}>{fullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}</IconButton></div></div></div></div>
      </div><div className="cinema-meta"><div><span className="meta-mark"><Film size={20}/></span><div><h3>{personalMedia?.name ?? tr("Blue hour")}</h3><p>{personalMedia ? tr("Se\u00E7ti\u011Fin dosya \u00B7 ki\u015Fisel oynatma") : tr("Original artwork & local motion study \u00B7 30 seconds")}</p></div></div><div className="button-row"><button className="button secondary small" disabled={shared || !window.rooms} title={shared ? tr("Ki\u015Fisel dosya a\u00E7mak i\u00E7in ortak etkinli\u011Fi bitir") : !window.rooms ? tr("Masa\u00FCst\u00FC uygulamas\u0131 gerekli") : tr("Yaln\u0131zca bu cihazda oynat\u0131lacak dosyay\u0131 se\u00E7")} onClick={() => void window.rooms?.chooseMedia().then(media => { if (media) {
        setPersonalMedia(media);
        setError('');
        setPosition(0);
    } }).catch(e => notify(e.message))}><FolderOpen size={15}/>{tr("Dosya a\u00E7")}</button>{personalMedia && <button className="text-button" onClick={() => { setPersonalMedia(null); setError(''); }}>{tr("Demoya d\u00F6n")}</button>}<button className="button secondary small" onClick={() => setTab(tab ? null : 'queue')}><ListVideo size={16}/>{tab ? tr("Hide room dock") : tr("Open room dock")}</button></div></div>{!personalMedia && <SharedCinema activity={activity} roomId={roomId}/>}<div className="cinema-context"><span className="host-context"><Avatar name={displayName} size="small"/><span>{shared ? 'Kumanda hepinizin' : tr("You have the remote")}<small>{shared ? tr("Odadaki her \u00FCye y\u00F6netebilir") : tr("Local controls, just for you")}</small></span><Check size={13}/></span><span className="playback-disclosure">{tr("Each viewer needs their own permitted source.")}<br />{shared ? tr("Ortak zaman \u00E7izelgesi ba\u011Fl\u0131.") : tr("Shared synchronization is not connected.")}</span></div><div className="cinema-bottom"><Headphones size={18}/><div><strong>{tr("The movie is only half the night.")}</strong><p>{demo ? (voiceRoom ? tr("Your local room preview stays with you while you watch.") : tr("Keep your people nearby. Open a room preview while you watch.")) : realtime.status === 'connected' ? tr("Your voice room stays connected while you watch.") : tr("Open a voice room to keep your people nearby.")}</p></div>{demo && !voiceRoom && <button className="text-button" onClick={() => joinPreview(tr("Movie night"))}>{tr("Room preview")}<Plus size={15}/></button>}</div></div>
      {tab && <aside className="cinema-dock"><div className="cinema-dock-heading"><h3>{tr("The room")}</h3><IconButton label={tr("Close room dock")} onClick={() => setTab(null)}><X size={16}/></IconButton></div><div className="dock-tabs" role="tablist" aria-label={tr("Cinema room panels")}>{(['queue', 'chat', 'voice'] as const).map(t => <button role="tab" aria-selected={tab === t} className={tab === t ? 'selected' : ''} key={t} onClick={() => setTab(t)}>{t === 'queue' ? <ListVideo size={15}/> : t === 'chat' ? <MessageCircle size={15}/> : <AudioLines size={15}/>}<span>{{ queue: tr("S\u0131ra"), chat: 'Sohbet', voice: 'Ses' }[t]}</span></button>)}</div>
      {tab === 'queue' && <div className="queue-panel"><span className="eyebrow">{tr("UP NEXT / LOCAL QUEUE")}</span>{queue.length ? queue.map((item, i) => <div className="queue-item" key={item.id}><div className="queue-thumbnail"><img src="./artwork/blue-hour.jpg" alt=""/><span>{String(i + 1).padStart(2, '0')}</span></div><div className="queue-item-copy"><strong>{item.title}</strong><small>{tr("Original demo \u00B7 0:30")}</small></div><div className="queue-actions"><IconButton label={`${item.title} öğesini yukarı taşı`} disabled={i === 0} onClick={() => moveQueue(item.id, -1)}><ArrowUp size={13}/></IconButton><IconButton label={`${item.title} öğesini aşağı taşı`} disabled={i === queue.length - 1} onClick={() => moveQueue(item.id, 1)}><ArrowDown size={13}/></IconButton><IconButton label={`${item.title} öğesini kaldır`} onClick={() => removeQueue(item.id)}><Trash2 size={13}/></IconButton></div></div>) : <div className="queue-empty"><ListVideo size={28}/><h4>{tr("An open evening.")}</h4><p>{tr("Add the local demo to your queue.")}</p></div>}<button className="queue-add" onClick={() => { addQueue(tr("Blue hour \u2014 original local demo")); notify(tr("Original local demo added to the queue.")); }}><Plus size={16}/>{tr("Add demo to queue")}</button><p className="dock-footnote">{tr("A local planning list. Automatic playback and shared requests arrive with the activity service.")}</p></div>}
      {tab === 'voice' && demo && <div className="cinema-voice-panel"><span className="eyebrow">{tr("LOCAL ROSTER PREVIEW")}</span>{((demo && p.demoFixtures) ? ['Maya', 'Oliver', 'Sofia'] : []).map(n => <div className="cinema-member" key={n}><Avatar name={n}/><span><strong>{n}</strong><small>{tr("Demo member")}</small></span><MicOff size={15}/></div>)}<div className="cinema-member"><Avatar name={displayName}/><span><strong>{displayName}</strong><small>{tr("You \u00B7 local only")}</small></span><Headphones size={15}/></div><p className="dock-footnote">{tr("No microphone is transmitted. Configure the media service to talk together.")}</p></div>}
      {tab === 'voice' && !demo && <div className="cinema-voice-panel"><span className="eyebrow">{realtime.roomName ?? tr("NO VOICE ROOM JOINED")}</span>{realtime.participants.map(person => <div className="cinema-member" key={person.id}><Avatar name={person.name}/><span><strong>{person.name}</strong><small>{person.muted ? tr("Mic off") : person.speaking ? tr("Speaking") : tr("Listening")}</small></span><Headphones size={15}/></div>)}<p className="dock-footnote">{realtime.status === 'connected' ? tr("Your voice room stays connected while you watch.") : tr("Join a voice room from the Voice lounge.")}</p></div>}
      {tab === 'chat' && demo && <div className="cinema-chat"><div className="cinema-chat-messages">{(messages[`${activeSpace}:general`] ?? []).filter(m => p.demoFixtures || m.own).map(m => <div className="cinema-chat-message" key={m.id}><Avatar name={m.author} size="small"/><div><strong>{m.author}</strong><p>{m.text}</p></div></div>)}</div><form onSubmit={e => {
                    e.preventDefault();
                    if (draft.trim()) {
                        const previous = useRooms.getState().channel;
                        useRooms.getState().setChannel('general');
                        sendMessage(draft);
                        useRooms.getState().setChannel(previous);
                        setDraft('');
                    }
                }}><input aria-label={tr("Cinema local message")} placeholder={tr("A quiet comment\u2026")} value={draft} onChange={e => setDraft(e.target.value)} maxLength={4000}/><IconButton label={tr("Send cinema local message")} type="submit" disabled={!draft.trim()}><Send size={16}/></IconButton></form><p className="dock-footnote">{tr("General conversation \u00B7 stored on this device")}</p></div>}
      {tab === 'chat' && !demo && <div className="queue-empty"><MessageCircle size={28}/><h4>{tr("Stay in the conversation.")}</h4><p>{tr("Open Messages to chat with your community. Voice stays connected while you move.")}</p><button className="button secondary small" onClick={() => navigate('/chat')}>{tr("Open Messages")}<MessageCircle size={14}/></button><p className="dock-footnote">{tr("Cinema playback is local. Shared media synchronization is not connected.")}</p></div>}
      </aside>}
    </div>{settings && <Modal title={tr("Your kind of cinema.")} onClose={closeSettings}><label className="field-label">{tr("PLAYBACK SPEED")}<select aria-label={tr("Playback speed")} value={speed} onChange={e => {
                setSpeed(Number(e.target.value));
                if (video.current)
                    video.current.playbackRate = Number(e.target.value);
                if (video.current)
                    broadcast(!video.current.paused, video.current.currentTime, Number(e.target.value));
            }}>{[.5, .75, 1, 1.25, 1.5, 2].map(n => <option value={n} key={n}>{n}×{n === 1 ? tr(" \u00B7 Normal") : ''}</option>)}</select></label><div className="settings-note"><Film size={21}/><p>{tr("Blue hour is a bundled original visual study with no audio or subtitle tracks. Volume controls apply to the player; this silent source has nothing to mute.")}</p></div><button className="button secondary full" onClick={() => { seek(0); closeSettings(); }}>{tr("Start again")}<RotateCcw size={16}/></button></Modal>}</div>;
}
