import { tr, uiError } from './i18n';
import { DesktopUpdates } from './Updates';
import { AccountProfile } from './People';
import { AgentSettings } from './Agent';
import { PersonalProviders } from './Providers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Fingerprint, Globe, Keyboard, Link, Mic, Moon, Monitor, Palette, Play, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal, Square, Trash2, User, Volume2, X } from 'lucide-react';
import { Avatar, IconButton, Modal, Toggle } from '@rooms/design';
import { useRooms } from './store';
import { ConnectionPane } from './ConnectionPane';
import { useCommunity } from './community';
import { useRealtime } from './realtime';
const tabs = [{ id: 'appearance', label: tr("Appearance"), icon: Palette }, { id: 'audio', label: tr("Voice & audio"), icon: AudioLines }, { id: 'connections', label: tr("Connections"), icon: Link }, { id: 'agent', label: 'Agent', icon: Fingerprint }, { id: 'profile', label: tr("Your profile"), icon: User }, { id: 'shortcuts', label: tr("Keyboard"), icon: Keyboard }, { id: 'desktop', label: tr("Desktop"), icon: Monitor }, { id: 'diagnostics', label: tr("Diagnostics"), icon: SlidersHorizontal }];
function Row({ title, description, children }: {
    title: string;
    description: string;
    children: React.ReactNode;
}) { return <div className="settings-row"><div><h4>{title}</h4>{description && <p>{description}</p>}</div>{children}</div>; }
export default function Settings({ notify, onClose }: {
    notify(message: string): void;
    onClose(): void;
}) {
    const community = useCommunity();
    const realtime = useRealtime();
    const [params, setParams] = useSearchParams();
    const tab = tabs.some(t => t.id === params.get('tab')) ? params.get('tab')! : 'appearance';
    const { preferences: p, setPreference } = useRooms();
    const [server, setServer] = useState(p.serverUrl);
    const [error, setError] = useState('');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [testing, setTesting] = useState(false);
    const [level, setLevel] = useState(0);
    const [micState, setMicState] = useState(tr("Not requested"));
    const [onTop, setOnTop] = useState(false);
    const [autoStart, setAutoStart] = useState(false);
    const [notifications, setNotifications] = useState<{
        enabled: boolean;
        supported: boolean;
    } | null>(null);
    const [notificationBusy, setNotificationBusy] = useState(false);
    useEffect(() => { void window.rooms?.notifications.status().then(setNotifications).catch(e => setError(uiError(e))); void window.rooms?.loginItemStatus().then(setAutoStart).catch(e => setError(uiError(e))); }, []);
    const streamRef = useRef<MediaStream | null>(null);
    const audioRef = useRef<AudioContext | null>(null);
    const frame = useRef(0);
    const mounted = useRef(true);
    const stopMic = useCallback(() => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (audioRef.current)
            void audioRef.current.close();
        audioRef.current = null;
        cancelAnimationFrame(frame.current);
        setTesting(false);
        setLevel(0);
    }, []);
    const refreshDevices = useCallback(async () => {
        try {
            setDevices(await navigator.mediaDevices.enumerateDevices());
        }
        catch {
            setError(tr("Audio devices are unavailable. Open the desktop app and try again."));
        }
    }, []);
    useEffect(() => { mounted.current = true; void refreshDevices(); const changed = () => void refreshDevices(); navigator.mediaDevices?.addEventListener('devicechange', changed); return () => { mounted.current = false; stopMic(); navigator.mediaDevices?.removeEventListener('devicechange', changed); }; }, [refreshDevices, stopMic]);
    useEffect(() => {
        if (tab !== 'audio')
            stopMic();
    }, [tab, stopMic]);
    const startMic = async () => {
        if (testing) {
            stopMic();
            return;
        }
        setError('');
        setMicState(tr("Requesting permission\u2026"));
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: p.inputId ? { exact: p.inputId } : undefined, echoCancellation: true, noiseSuppression: true }, video: false });
            if (!mounted.current) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            streamRef.current = stream;
            const context = new AudioContext();
            audioRef.current = context;
            const analyser = context.createAnalyser();
            analyser.fftSize = 256;
            context.createMediaStreamSource(stream).connect(analyser);
            const values = new Uint8Array(analyser.frequencyBinCount);
            let last = 0;
            const tick = (now: number) => {
                if (now - last > 100) {
                    analyser.getByteFrequencyData(values);
                    setLevel(Math.min(100, values.reduce((a, b) => a + b, 0) / values.length * 1.8));
                    last = now;
                }
                frame.current = requestAnimationFrame(tick);
            };
            frame.current = requestAnimationFrame(tick);
            setTesting(true);
            setMicState(tr("Granted \u00B7 local meter only"));
            void refreshDevices();
            stream.getAudioTracks()[0]?.addEventListener('ended', () => { stopMic(); setError(tr("Microphone disconnected. Choose an available input device and retry.")); });
        }
        catch (err) {
            setMicState(tr("Unavailable"));
            setError(err instanceof DOMException && err.name === 'NotAllowedError' ? tr("Microphone access was denied. Allow ROOMS in macOS System Settings \u2192 Privacy & Security \u2192 Microphone, then retry.") : tr("The selected microphone is unavailable. Refresh devices and choose another input."));
        }
    };
    const speakerTest = async () => {
        setError('');
        const context = new AudioContext() as AudioContext & {
            setSinkId?(id: string): Promise<void>;
        };
        try {
            if (p.outputId && context.setSinkId)
                await context.setSinkId(p.outputId);
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            gain.gain.setValueAtTime(0, context.currentTime);
            gain.gain.linearRampToValueAtTime(.08, context.currentTime + .05);
            gain.gain.linearRampToValueAtTime(0, context.currentTime + .55);
            oscillator.frequency.value = 440;
            oscillator.connect(gain).connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + .6);
            oscillator.onended = () => void context.close();
            notify("Ses \u00E7al\u0131n\u0131yor.");
        }
        catch {
            void context.close();
            setError(tr("The selected output could not be used. Choose System default and retry."));
        }
    };
    const exportDiagnostics = async () => {
        if (window.rooms) {
            notify(await window.rooms.exportDiagnostics() ? tr("Sanitized diagnostics exported.") : tr("Export cancelled."));
        }
        else {
            const blob = new Blob([JSON.stringify({ app: 'ROOMS', mode: 'browser-preview', spacebar: 'not-configured', sfu: 'not-configured', activityService: 'not-configured', mic: micState }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'rooms-diagnostics.json';
            a.click();
            URL.revokeObjectURL(url);
            notify(tr("Sanitized diagnostics exported."));
        }
    };
    return <div className="settings-page page-enter"><div className="settings-dismiss"><IconButton label="Ayarları kapat" onClick={onClose}><X size={22}/></IconButton><kbd>ESC</kbd></div><div className="settings-layout"><nav className="settings-tabs" aria-label={tr("Settings categories")}>{tabs.map(t => <button key={t.id} className={tab === t.id ? 'selected' : ''} onClick={() => { setParams({ tab: t.id }); setError(''); }}><t.icon size={17}/>{t.label}<ChevronRight size={13}/></button>)}<span className="settings-version">{tr("ROOMS 0.1.11")}<br />{""}</span></nav><div className="settings-content">
  {tab === 'appearance' && <><h3>{"G\u00F6r\u00FCn\u00FCm"}</h3><Row title={tr("Appearance")} description={tr("Dark first. System and light themes are planned.")}><div className="segmented small"><button disabled title={tr("System appearance is planned")}>{tr("System")}</button><button className="selected" aria-pressed="true" onClick={() => notify(tr("Dark appearance is selected."))}>{tr("Dark")}</button><button disabled title={tr("Light appearance is planned")}>{tr("Light")}</button></div></Row><Row title={tr("Accent")} description={""}><div className="accent-options"><button aria-label={tr("Pearl accent")} aria-pressed={p.accent === 'pearl'} className={`accent pearl ${p.accent === 'pearl' ? 'chosen' : ''}`} onClick={() => setPreference('accent', 'pearl')}>{p.accent === 'pearl' && <Check size={13}/>}</button><button aria-label={tr("Sage accent")} aria-pressed={p.accent === 'sage'} className={`accent sage ${p.accent === 'sage' ? 'chosen' : ''}`} onClick={() => setPreference('accent', 'sage')}>{p.accent === 'sage' && <Check size={13}/>}</button></div></Row><Row title={tr("Reduce transparency")} description={""}><Toggle label={tr("Reduce transparency")} value={p.reduceTransparency} onChange={v => setPreference('reduceTransparency', v)}/></Row><Row title={tr("Reduce motion")} description={""}><Toggle label={tr("Reduce motion")} value={p.reduceMotion} onChange={v => setPreference('reduceMotion', v)}/></Row><Row title={tr("Compact conversations")} description={""}><Toggle label={tr("Compact conversations")} value={p.compact} onChange={v => setPreference('compact', v)}/></Row><Row title={tr("Friends panel")} description={""}><Toggle label={tr("Show friends panel")} value={p.showFriends} onChange={v => setPreference('showFriends', v)}/></Row></>}
  {tab === 'audio' && <><h3>{"Ses"}</h3><div className="connection-info"><span className={`status-dot ${realtime.status === 'connected' ? '' : 'unavailable'}`}/>{realtime.status === 'connected' ? `${realtime.roomName} odasına bağlı` : "Ses odas\u0131na ba\u011Fl\u0131 de\u011Fil"}</div><label className="field-label">{tr("INPUT DEVICE")}<select aria-label={tr("Input device")} value={p.inputId} onChange={e => { stopMic(); setPreference('inputId', e.target.value); }}><option value="">{tr("System default microphone")}</option>{devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default').map((d, i) => <option value={d.deviceId} key={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}</select></label><label className="field-label">{tr("OUTPUT DEVICE")}<select aria-label={tr("Output device")} value={p.outputId} onChange={e => setPreference('outputId', e.target.value)}><option value="">{tr("System default speakers")}</option>{devices.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default').map((d, i) => <option value={d.deviceId} key={d.deviceId}>{d.label || `Hoparlör ${i + 1}`}</option>)}</select></label><div className="mic-test"><div><Mic size={19}/><h4>{tr("Try your microphone")}</h4><span>{micState}</span></div><div className="mic-meter" role="meter" aria-label={tr("Microphone input level")} aria-valuenow={Math.round(level)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${level}%` }}/></div><div className="button-row"><button className="button secondary" onClick={() => void startMic()}>{testing ? <Square size={15}/> : <Mic size={15}/>}{testing ? tr("Stop test") : tr("Test microphone")}</button><button className="button secondary" onClick={() => void speakerTest()}><Volume2 size={16}/>{tr("Test speaker")}</button></div></div><button className="text-button" onClick={() => void refreshDevices()}><RefreshCw size={14}/>{tr("Refresh devices")}</button></>}
  {tab === 'connections' && <><h3>{"Ba\u011Flant\u0131lar"}</h3><ConnectionPane /><PersonalProviders notify={notify}/>{[{ name: 'LiveKit', description: tr("Voice, video & screen sharing"), note: realtime.status === 'connected' ? `${realtime.roomName} odasına bağlı. Mikrofonu, kamerayı ve paylaşımı odandan yönet.` : tr("Sign in, open a voice channel, and join with your mic off. Screen capture starts only after you select a source.") }].map(c => <section className="connection-card compact-connection" key={c.name}><div className="connection-card-heading"><span className="connection-icon"><Link size={20}/></span><div><h4>{c.name}</h4><p>{c.description}</p></div><span className="connection-status">{c.name === 'LiveKit' ? (realtime.status === 'connected' ? tr("Connected") : community.user ? tr("Ready to join") : tr("Sign in first")) : tr("Not configured")}</span></div><p className="connection-disclosure">{c.note}</p></section>)}</>}
  {tab === 'agent' && <AgentSettings notify={notify}/>}
  {tab === 'profile' && (community.user ? <AccountProfile notify={notify}/> : <ConnectionPane />)}

  {tab === 'shortcuts' && <><h3>{"Klavye"}</h3>{[[tr("Find a room or command"), '⌘ / Ctrl K'], [tr("Home / Spaces / Chat / Voice / Cinema"), '⌘ / Ctrl 1–5'], [tr("Open settings"), '⌘ / Ctrl ,'], [tr("Mikrofonu aç / kapat"), '⌘ / Ctrl Shift M'], [tr("Push to talk (when enabled)"), 'Ctrl Shift Space'], [tr("Play / pause local media"), 'Space'], [tr("Seek local media 5 seconds"), '← / →'], [tr("Close topmost dialog"), 'Esc'], [tr("Mesaj gönder"), 'Enter'], [tr("New line"), 'Shift Enter']].map(([a, b]) => <div className="shortcut-row" key={a}><span>{a}</span><kbd>{b}</kbd></div>)}</>}
  {tab === 'desktop' && <><h3>{"Masa\u00FCst\u00FC"}</h3><Row title={tr("Push to talk")} description={tr("Hold Ctrl + Shift + Space to speak while ROOMS is focused. Typing fields are excluded; releasing the keys or switching apps mutes you.")}><Toggle label={tr("Push to talk")} value={p.pushToTalk ?? false} onChange={v => setPreference('pushToTalk', v)}/></Row><Row title={tr('Mesaj bildirimleri')} description={notifications?.supported ? tr('ROOMS arka plandayken yeni mesajı haber verir. Mesaj içeriği bildirime eklenmez.') : tr('Sistem bildirimleri bu ortamda kullanılamıyor.')}><Toggle label={tr('Mesaj bildirimlerini etkinleştir')} value={notifications?.enabled ?? false} disabled={!notifications?.supported || notificationBusy} onChange={async (value) => {
                setNotificationBusy(true);
                try {
                    setNotifications(await window.rooms!.notifications.setOptIn(value));
                }
                catch (e) {
                    setError(uiError(e));
                }
                finally {
                    setNotificationBusy(false);
                }
            }}/></Row><Row title={tr("Keep window on top")} description={""}><Toggle label={tr("Always on top")} value={onTop} onChange={async (v) => {
                if (!window.rooms) {
                    notify(tr("Always on top is available in the Electron app."));
                    return;
                }
                await window.rooms.setAlwaysOnTop(v);
                setOnTop(v);
            }}/></Row><Row title={tr("Open at login")} description={tr("Opt-in. Available in the packaged macOS application.")}><Toggle label={tr("Open at login")} value={autoStart} onChange={async (v) => {
                if (!window.rooms) {
                    notify(tr("Login behavior requires the packaged desktop app."));
                    return;
                }
                const applied = await window.rooms.setLoginItem(v);
                setAutoStart(applied);
                if (v && !applied)
                    notify(tr("Login launch is unavailable in development. Use the packaged app."));
            }}/></Row><Row title={tr("Native fullscreen")} description={tr("Give your room the whole screen.")}><button className="button secondary small" onClick={() => {
                if (window.rooms)
                    void window.rooms.windowAction('fullscreen');
                else if (document.fullscreenElement)
                    void document.exitFullscreen();
                else
                    void document.documentElement.requestFullscreen();
            }}>{tr("Toggle fullscreen")}</button></Row><DesktopUpdates /></>}
  {tab === 'diagnostics' && <><h3>{"Tan\u0131lama"}</h3><div className="diagnostic-list">{[[tr("Application"), tr("ROOMS 0.1.11 / Desktop")], [tr("Runtime"), window.rooms ? 'Electron 44.7.0' : tr("Browser preview")], [tr("Platform"), window.rooms?.platform ?? tr("Browser")], [tr("Social / gateway"), community.status], ['WebRTC / SFU', realtime.status], [tr("Activity service"), tr("Durum, seçili odanın etkinlik ekranında gösterilir")], [tr("Provider connections"), tr("Kişisel kaynaklar için Bağlantılar ekranını aç")], [tr("Microphone permission"), micState], [tr("Bitrate / packet loss / ping"), realtime.status === 'connected' ? `${realtime.diagnostics.bitrate === null ? '—' : Math.round(realtime.diagnostics.bitrate / 1000) + ' kbps'} / ${realtime.diagnostics.packetLoss === null ? '—' : (realtime.diagnostics.packetLoss * 100).toFixed(1) + '%'} / ${realtime.diagnostics.rtt === null ? '—' : Math.round(realtime.diagnostics.rtt) + ' ms'}` : tr("Unavailable \u2014 no active transport")], [tr("Data mode"), community.user ? tr('Gerçek topluluk hesabı') : tr('Giriş yapılmadı')]].map(([a, b]) => <div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div><button className="button secondary" onClick={() => void exportDiagnostics()}><ArrowDownToLine size={16}/>{tr("Export sanitized diagnostics")}</button></>}
  {error && <div className="error-pane" role="alert"><strong>{tr("Let\u2019s check that.")}</strong><p>{error}</p></div>}
  </div></div></div>;
}
