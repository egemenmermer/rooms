import { HostOperations } from './HostOperations';
import { mediaProvider } from './runtime-sources';
import { NoiseComparison } from './NoiseComparison';
import { createNoiseSuppressionNode } from '@rooms/media';
import { tr, uiError } from './i18n';
import type { DesktopBridge } from '@rooms/contracts';
import { ChannelNotifications } from './ChannelNotifications';
import { DesktopWindowSettings } from './DesktopWindowSettings';
import { DesktopUpdates } from './Updates';
import { ChannelPermissionsSurface } from './ChannelPermissionsSurface';
import { CommunityManagementEntry } from './CommunityManagementEntry';
import { About } from './About';
import { ServerProfile } from './ServerProfile';
import { SettingsConnection } from './SettingsConnection';
import { AssistantManagement } from './AssistantManagement';
import { VoiceAvatar } from './VoiceAvatar';
import './reference-settings.css';
import { AgentReferenceSettingsContent, AgentSettings } from './Agent';
import { PersonalProviders } from './Providers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Menu,
  ArrowLeft,
  Bookmark,
  Bot,
  Clock3,
  Info,
  KeyRound,
  Sparkles,
  Users,
  ChevronDown,
  Bell,
  Eye,
  LogOut,
  Sun,
  Video,
  VideoOff,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  Fingerprint,
  Globe,
  Store,
  Keyboard,
  Link,
  Mic,
  Moon,
  Monitor,
  Palette,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  User,
  Volume2,
  X,
} from 'lucide-react';
import { Avatar, IconButton, Modal, Toggle } from '@rooms/design';
import { useRooms } from './store';
import { PushToTalkKeyField } from './PushToTalkKeyField';
import { ConnectionPane } from './ConnectionPane';
import { useCommunity } from './community';
import { useRealtime, setNoiseSuppression } from './realtime';
const tabs = [
  { id: 'profile', label: 'Hesap ve profil', icon: User },
  { id: 'audio', label: 'Ses ve video', icon: Mic },
  { id: 'appearance', label: 'Görünüm', icon: Sun },
  { id: 'desktop', label: 'Bildirimler', icon: Bell },
  { id: 'agent', label: 'Model bağlantılarım', icon: KeyRound },
  { id: 'connections', label: 'Uygulama bağlantıları', icon: Link },
  { id: 'room-memory', label: 'Oda hafızası', icon: Bookmark },
  { id: 'schedules', label: 'Tek seferlik görevler', icon: Clock3 },
  { id: 'services', label: 'ROOMS bağlantıları', icon: Globe },
  { id: 'server-profile', label: 'Sunucu profili', icon: Store },
  { id: 'hostops', label: 'Sunucu makinesi', icon: Monitor },
  { id: 'shortcuts', label: 'Klavye', icon: Keyboard },
  { id: 'diagnostics', label: 'Tanılama', icon: SlidersHorizontal },
  { id: 'community-management', label: 'Üyeler ve roller', icon: Users },
  { id: 'channel-permissions', label: 'Kanal izinleri', icon: ShieldCheck },
  { id: 'assistant-permissions', label: 'Asistan yetkileri', icon: Bot },
  { id: 'automation', label: 'Otomasyon modu', icon: Sparkles },
  { id: 'about', label: 'Güncelleme ve hakkında', icon: Info },
];
function Heading({ title }: { title: string }) {
  return (
    <div className="ref-settings-heading">
      <span>KULLANICI AYARLARI</span>
      <h1>{title}</h1>
    </div>
  );
}
function Unsupported({
  title,
  reason,
  value = false,
}: {
  title: string;
  reason: string;
  value?: boolean;
}) {
  return (
    <Row title={title} description={reason}>
      <Toggle label={`${title}: ${reason}`} disabled value={value} onChange={() => {}} />
    </Row>
  );
}
function ReferenceAccount({ notify, onClose }: { notify(message: string): void; onClose(): void }) {
  const c = useCommunity(),
    realtime = useRealtime();
  const [name, setName] = useState(c.user?.displayName ?? ''),
    [bio, setBio] = useState(''),
    [status, setStatus] = useState(''),
    [presence, setPresence] = useState<'online' | 'idle' | 'dnd' | 'invisible' | ''>(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [logout, setLogout] = useState(false);
  const reset = () => {
    setName(c.user?.displayName ?? '');
    setBio('');
    setStatus('');
    setSaved(false);
  };
  if (!c.user)
    return (
      <>
        <Heading title="Hesap ve profil" />
        <ConnectionPane />
      </>
    );
  return (
    <>
      <Heading title="Hesap ve profil" />
      {saved && (
        <div className="ref-settings-callout success" role="status">
          <Check size={17} />
          Profil değişikliklerin sunucuda kaydedildi.
        </div>
      )}
      <div className="ref-profile-columns">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setSaved(false);
            try {
              const user = await window.rooms!.social.updateProfile({
                displayName: name.trim(),
                ...(bio.trim() ? { bio: bio.trim() } : {}),
                ...(status.trim() ? { statusText: status.trim() } : {}),
              });
              useCommunity.setState({ user });
              setSaved(true);
            } catch (e) {
              setError(uiError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="ref-settings-grid">
            <label className="field-label">
              Görünen ad
              <input
                required
                maxLength={32}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="field-label">
              Kullanıcı adı
              <input readOnly value={c.user.username} />
            </label>
          </div>
          <label className="field-label">
            E-posta
            <input
              readOnly
              disabled
              value=""
              placeholder="Hesap bağlantısı e-postayı paylaşmıyor"
            />
          </label>
          <label className="field-label">
            Durum mesajı
            <input
              maxLength={128}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setSaved(false);
              }}
              placeholder="Yeni durum mesajı"
            />
          </label>
          <label className="field-label">
            Hakkında
            <textarea
              maxLength={2000}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Yeni profil açıklaması"
            />
          </label>
          <Row
            title="Görünürlük"
            description={
              presence === 'invisible'
                ? 'Diğer üyelere çevrimdışı görünüyorsun.'
                : 'Durumunu sunucuna bildir.'
            }
          >
            <select
              aria-label="Görünürlük"
              value={presence}
              disabled={busy || !window.rooms}
              onChange={async (e) => {
                const next = e.target.value as 'online' | 'idle' | 'dnd' | 'invisible';
                setBusy(true);
                setError('');
                try {
                  await c.setPresence(next);
                  setPresence(next);
                } catch (e) {
                  setError(uiError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <option value="" disabled>
                Durum seç
              </option>
              <option value="online">Çevrimiçi</option>
              <option value="idle">Uzakta</option>
              <option value="dnd">Rahatsız etmeyin</option>
              <option value="invisible">Görünmez</option>
            </select>
          </Row>
          {presence === 'invisible' && (
            <div className="ref-settings-callout">
              <Eye size={16} />
              Görünmezlik yalnızca sana gösterilir.
            </div>
          )}
          <div className="button-row">
            <button className="button primary" disabled={busy || !name.trim() || !window.rooms}>
              {busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={reset}>
              Vazgeç
            </button>
          </div>
        </form>
        <aside>
          <span className="ref-preview-label">PROFİL ÖNİZLEMESİ</span>
          <div className="ref-profile-preview">
            <div className="ref-profile-banner" />
            <div className="ref-profile-body">
              <div className="ref-profile-avatar">
                <VoiceAvatar id={c.user.id} name={name || c.user.displayName} large />
                <button
                  className="text-button"
                  disabled={busy || !window.rooms}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const user = await window.rooms!.social.chooseAvatar();
                      if (user) {
                        useCommunity.setState({ user });
                        notify('Avatar sunucuda güncellendi.');
                      }
                    } catch (e) {
                      setError(uiError(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Avatarı değiştir
                </button>
              </div>
              <h2>{name || c.user.displayName}</h2>
              <small>@{c.user.username}</small>
              {status && <p>{status}</p>}
              <div className="ref-settings-divider" />
              <div className="ref-settings-inline">
                <User size={14} />
                {presence === 'invisible'
                  ? 'Görünmez · yalnızca sen görürsün'
                  : presence === 'online'
                    ? 'Çevrimiçi'
                    : presence === 'idle'
                      ? 'Uzakta'
                      : presence === 'dnd'
                        ? 'Rahatsız etmeyin'
                        : 'Görünürlük durumu alınamadı'}
              </div>
            </div>
          </div>
        </aside>
      </div>
      <section className="ref-settings-section">
        <h2>Gizlilik</h2>
        <Unsupported
          title="Topluluk üyelerinden özel mesaj al"
          reason="Topluluk bağlantısı bu tercihi desteklemiyor."
        />
        <Unsupported
          title="Etkinliğimi arkadaşlarıma göster"
          reason="Etkinlik görünürlüğü bağlantısı henüz uygulanmadı."
        />
        <Unsupported
          title="Arkadaşlık isteklerine izin ver"
          reason="Topluluk bağlantısı bu tercihi desteklemiyor."
        />
      </section>
      <div className="ref-settings-bottom">
        <span>Bu cihaz · {window.rooms?.platform ?? 'Tarayıcı'}</span>
        <button className="text-button" onClick={() => setLogout(true)}>
          <LogOut size={16} />
          Oturumu kapat
        </button>
      </div>
      {error && (
        <div className="ref-settings-callout error" role="alert">
          {error}
        </div>
      )}
      {logout && (
        <Modal
          title="ROOMS’tan çıkış yap?"
          className="ref-settings-confirm"
          onClose={() => {
            if (!busy) setLogout(false);
          }}
        >
          <p>
            Bu cihazdaki oturumun kapanacak.
            {realtime.status === 'connected'
              ? ` ${realtime.roomName} ses görüşmesinden ayrılacaksın.`
              : ''}
          </p>
          <div className="ref-settings-inline">
            <Avatar name={c.user.displayName} />
            <strong>{c.user.displayName}</strong>
          </div>
          <div className="button-row">
            <button className="button secondary" disabled={busy} onClick={() => setLogout(false)}>
              Vazgeç
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await c.logout();
                  onClose();
                } catch (e) {
                  setError(uiError(e));
                  setLogout(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={16} />
              Çıkış yap
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div>
        <h4>{title}</h4>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export default function Settings({
  notify,
  onClose,
  onInvite,
}: {
  notify(message: string): void;
  onClose(): void;
  onInvite?(): void;
}) {
  const community = useCommunity();
  const realtime = useRealtime();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'appearance';
  const savedPreferences = useRooms((state) => state.preferences);
  const [p, setDraftPreferences] = useState(() => ({ ...savedPreferences }));
  const setPreference = <K extends keyof typeof p>(key: K, value: (typeof p)[K]) =>
    setDraftPreferences((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(p) !== JSON.stringify(savedPreferences);
  const [saving, setSaving] = useState(false),
    [confirmDiscard, setConfirmDiscard] = useState(false);
  const approvedClose = useRef(false);
  useEffect(() => {
    setDraftPreferences({ ...useRooms.getState().preferences });
    setConfirmDiscard(false);
    approvedClose.current = false;
  }, [community.user?.id, community.serverUrl]);
  useEffect(() => {
    const request = (event: Event) => {
      if (dirty && !approvedClose.current) {
        event.preventDefault();
        setConfirmDiscard(true);
      }
    };
    window.addEventListener('rooms:settings-close-request', request);
    return () => window.removeEventListener('rooms:settings-close-request', request);
  }, [dirty]);
  const savePreferences = async () => {
    if (saving) return false;
    const accountId = community.user?.id,
      serverUrl = community.serverUrl;
    setSaving(true);
    setError('');
    try {
      if (realtime.status === 'connected') {
        await setNoiseSuppression(p.noiseSuppression, p.noiseSuppressionMode);
        await mediaProvider().deviceSelection(p.inputId, p.outputId);
      }
      if (
        useCommunity.getState().user?.id !== accountId ||
        useCommunity.getState().serverUrl !== serverUrl
      )
        throw new Error('Oturum değişti. Ayarları yeniden aç.');
      useRooms.getState().setPreferences(p);
      notify('Ayarlar kaydedildi.');
      return true;
    } catch (failure) {
      try {
        useRooms.getState().setPreferences(savedPreferences);
      } catch {
        /* Preserve the error when device storage is unavailable. */
      }
      setError(uiError(failure));
      if (realtime.status === 'connected') {
        await setNoiseSuppression(
          savedPreferences.noiseSuppression,
          savedPreferences.noiseSuppressionMode,
        ).catch(() => {});
        await mediaProvider()
          .deviceSelection(savedPreferences.inputId, savedPreferences.outputId)
          .catch(() => {});
      }
    } finally {
      setSaving(false);
    }
    return false;
  };
  const [error, setError] = useState('');
  const [narrowSettings, setNarrowSettings] = useState(
    () => window.matchMedia('(max-width: 959px)').matches,
  );
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationRef = useRef<HTMLElement | null>(null),
    navigationButton = useRef<HTMLButtonElement | null>(null);
  const closeNavigation = () => {
    setNavigationOpen(false);
    requestAnimationFrame(() => navigationButton.current?.focus());
  };
  useEffect(() => {
    const media = window.matchMedia('(max-width: 959px)');
    const update = () => {
      setNarrowSettings(media.matches);
      setNavigationOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!navigationOpen) return;
    navigationRef.current?.querySelector<HTMLButtonElement>('button.selected')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setNavigationOpen(false);
        requestAnimationFrame(() => navigationButton.current?.focus());
      } else if (event.key === 'Tab') {
        const buttons = [
          ...(navigationRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ??
            []),
        ].filter((button) => button.getClientRects().length);
        const first = buttons[0],
          last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [navigationOpen]);
  const [extraSettings, setExtraSettings] = useState(false);
  const extraSettingsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!extraSettings) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !extraSettingsRef.current?.contains(event.target))
        setExtraSettings(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setExtraSettings(false);
        extraSettingsRef.current?.querySelector('button')?.focus();
      }
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', key, true);
    };
  }, [extraSettings]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const micEpoch = useRef(0);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const timer = requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>('.settings-reference-surface .settings-tabs button.selected')
        ?.focus(),
    );
    return () => {
      cancelAnimationFrame(timer);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const cameraEpoch = useRef(0);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [cameraId, setCameraId] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const cameraVideo = useRef<HTMLVideoElement | null>(null);
  const stopCamera = useCallback(() => {
    cameraEpoch.current++;
    cameraRef.current?.getTracks().forEach((t) => t.stop());
    cameraRef.current = null;
    setCameraStream(null);
  }, []);
  const toggleCamera = async () => {
    if (cameraRef.current) {
      stopCamera();
      return;
    }
    setError('');
    const epoch = ++cameraEpoch.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: cameraId ? { deviceId: { exact: cameraId } } : true,
      });
      if (!mounted.current || epoch !== cameraEpoch.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      cameraRef.current = stream;
      setCameraStream(stream);
      void refreshDevices();
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopCamera();
        setError('Kamera bağlantısı kesildi. Cihaz listesini yenile.');
      });
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Kamera izni kapalı. Sistem gizlilik ayarlarından ROOMS’a kamera izni ver.'
          : 'Kamera kullanılamıyor. Cihaz listesini yenile ve başka bir kamera seç.',
      );
    }
  };
  useEffect(() => {
    if (cameraVideo.current) cameraVideo.current.srcObject = cameraStream;
  }, [cameraStream]);
  const [micState, setMicState] = useState(tr('Not requested'));
  const [onTop, setOnTop] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [notifications, setNotifications] = useState<{
    enabled: boolean;
    sound: boolean;
    pauseDuringVoice: boolean;
    supported: boolean;
  } | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationFixture, setNotificationFixture] = useState<{
    notifications: DesktopBridge['notifications'];
    desktopWindow: DesktopBridge['desktopWindow'];
    variant: string;
  } | null>(null);
  const fixtureId = import.meta.env.DEV
    ? new URLSearchParams(location.search).get('fixture')
    : null;
  const [trayPreview, setTrayPreview] = useState(false);
  useEffect(() => {
    if (notificationFixture?.variant === 'tray') setTrayPreview(true);
  }, [notificationFixture?.variant]);
  const notificationApi =
    notificationFixture?.notifications ?? (!fixtureId ? window.rooms?.notifications : undefined);
  useEffect(() => {
    if (fixtureId !== 'S67') return;
    let current = true;
    void import('./dev/notification-fixture').then((module) => {
      const fixture = module.createNotificationFixture(
        new URLSearchParams(location.search).get('variant') || 'default',
      );
      if (current) setNotificationFixture(fixture);
    });
    return () => {
      current = false;
    };
  }, [fixtureId]);
  useEffect(() => {
    let current = true;
    void notificationApi
      ?.status()
      .then((value) => {
        if (current) setNotifications(value);
      })
      .catch((e) => {
        if (current) setError(uiError(e));
      });
    return () => {
      current = false;
    };
  }, [notificationApi]);
  useEffect(() => {
    void window.rooms
      ?.loginItemStatus()
      .then(setAutoStart)
      .catch((e) => setError(uiError(e)));
  }, []);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const denoiserRef = useRef<Awaited<ReturnType<typeof createNoiseSuppressionNode>> | null>(null);
  const frame = useRef(0);
  const mounted = useRef(true);
  const stopMic = useCallback(() => {
    micEpoch.current++;
    denoiserRef.current?.disconnect();
    denoiserRef.current?.destroy();
    denoiserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) void audioRef.current.close();
    audioRef.current = null;
    cancelAnimationFrame(frame.current);
    setTesting(false);
    setLevel(0);
  }, []);
  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
      setDevicesLoaded(true);
    } catch {
      setError(tr('Audio devices are unavailable. Open the desktop app and try again.'));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refreshDevices();
    const changed = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', changed);
    return () => {
      mounted.current = false;
      stopMic();
      stopCamera();
      navigator.mediaDevices?.removeEventListener('devicechange', changed);
    };
  }, [refreshDevices, stopMic, stopCamera]);
  useEffect(() => {
    if (tab !== 'audio') {
      stopMic();
      stopCamera();
    }
  }, [tab, stopMic, stopCamera]);
  const startMic = async () => {
    if (testing) {
      stopMic();
      return;
    }
    setError('');
    setMicState(tr('Requesting permission\u2026'));
    const epoch = ++micEpoch.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: p.inputId ? { exact: p.inputId } : undefined,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
        },
        video: false,
      });
      if (!mounted.current || epoch !== micEpoch.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const context = new AudioContext({ sampleRate: 48000 });
      audioRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(stream);
      if (p.noiseSuppression) {
        const denoiser = await createNoiseSuppressionNode(context, p.noiseSuppressionMode, {
          error: () => {
            if (epoch !== micEpoch.current) return;
            stopMic();
            setError('Gürültü filtresi durdu. Mikrofon denemesini yeniden başlat.');
          },
        });
        if (!mounted.current || epoch !== micEpoch.current) {
          denoiser.destroy();
          return;
        }
        denoiserRef.current = denoiser;
        source.connect(denoiser);
        denoiser.connect(analyser);
      } else source.connect(analyser);
      await context.resume();
      if (!mounted.current || epoch !== micEpoch.current) return;
      const values = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = (now: number) => {
        if (now - last > 100) {
          analyser.getByteFrequencyData(values);
          setLevel(Math.min(100, (values.reduce((a, b) => a + b, 0) / values.length) * 1.8));
          last = now;
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
      setTesting(true);
      setMicState(tr('Granted \u00B7 local meter only'));
      void refreshDevices();
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        stopMic();
        setError(tr('Microphone disconnected. Choose an available input device and retry.'));
      });
    } catch (err) {
      if (!mounted.current || epoch !== micEpoch.current) return;
      stopMic();
      setMicState(tr('Unavailable'));
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? tr(
              'Microphone access was denied. Allow ROOMS in macOS System Settings \u2192 Privacy & Security \u2192 Microphone, then retry.',
            )
          : tr('The selected microphone is unavailable. Refresh devices and choose another input.'),
      );
    }
  };
  const speakerTest = async () => {
    setError('');
    const context = new AudioContext() as AudioContext & {
      setSinkId?(id: string): Promise<void>;
    };
    try {
      if (p.outputId) {
        if (!context.setSinkId) throw new Error('Output selection unavailable');
        await context.setSinkId(p.outputId);
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, context.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.55);
      oscillator.frequency.value = 440;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.6);
      oscillator.onended = () => void context.close();
      notify('Ses \u00E7al\u0131n\u0131yor.');
    } catch {
      void context.close();
      setError(tr('The selected output could not be used. Choose System default and retry.'));
    }
  };
  const exportDiagnostics = async () => {
    if (window.rooms) {
      notify(
        (await window.rooms.exportDiagnostics())
          ? tr('Sanitized diagnostics exported.')
          : tr('Export cancelled.'),
      );
    } else {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              app: 'ROOMS',
              mode: 'browser-preview',
              spacebar: 'not-configured',
              sfu: 'not-configured',
              activityService: 'not-configured',
              mic: micState,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rooms-diagnostics.json';
      a.click();
      URL.revokeObjectURL(url);
      notify(tr('Sanitized diagnostics exported.'));
    }
  };
  return (
    <div className={`settings-page reference-settings page-enter ref-tab-${tab}`}>
      <div className="settings-dismiss">
        <IconButton label="Ayarları kapat" onClick={onClose}>
          <X size={22} />
        </IconButton>
        <kbd>ESC</kbd>
      </div>
      <div className="settings-layout">
        {narrowSettings && (
          <div className="settings-narrow-connection">
            <SettingsConnection notify={notify} />
          </div>
        )}
        <nav
          ref={navigationRef}
          id="settings-categories"
          className={`settings-tabs ${navigationOpen ? 'drawer-open' : ''}`}
          inert={narrowSettings && !navigationOpen}
          onClick={(event) => {
            if (
              narrowSettings &&
              (event.target as HTMLElement).closest('.ref-settings-nav-group button')
            )
              closeNavigation();
          }}
          aria-label={tr('Settings categories')}
        >
          <div className="ref-nav-title" ref={extraSettingsRef}>
            <button
              aria-expanded={extraSettings}
              aria-label="Diğer ayarlar"
              onClick={() => setExtraSettings((value) => !value)}
            >
              Ayarlar
              <ChevronDown size={17} />
            </button>
            {extraSettings && (
              <div className="ref-settings-extra" role="menu">
                {tabs
                  .filter((t) => ['shortcuts', 'diagnostics'].includes(t.id))
                  .map((t) => (
                    <button
                      role="menuitem"
                      key={t.id}
                      onClick={() => {
                        setParams({ tab: t.id });
                        setExtraSettings(false);
                        setError('');
                      }}
                    >
                      <t.icon size={17} />
                      {t.label}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div className="ref-settings-nav-scroll">
            {[
              {
                label: 'KULLANICI AYARLARI',
                ids: [
                  'profile',
                  'audio',
                  'appearance',
                  'desktop',
                  'agent',
                  'connections',
                  'room-memory',
                  'schedules',
                  'services',
                ],
              },
              {
                label:
                  community.spaces
                    .find((space) => space.id === community.activeSpaceId)
                    ?.name.toLocaleUpperCase('tr-TR') || 'TOPLULUK',
                ids: [
                  'server-profile',
                  'community-management',
                  'channel-permissions',
                  'assistant-permissions',
                  'automation',
                  // The machine behind the server is the owner's concern, not every member's.
                  ...(community.spaces.find((space) => space.id === community.activeSpaceId)
                    ?.ownerId === community.user?.id
                    ? ['hostops']
                    : []),
                ],
              },
              { label: 'ROOMS', ids: ['about'] },
            ].map((group) => (
              <div className="ref-settings-nav-group" key={group.label}>
                <span className="ref-nav-group">{group.label}</span>
                {group.ids.map((id) => {
                  const t = tabs.find((item) => item.id === id)!;
                  return (
                    <button
                      key={t.id}
                      className={tab === t.id ? 'selected' : ''}
                      aria-current={tab === t.id ? 'page' : undefined}
                      onClick={() => {
                        setParams({ tab: t.id });
                        setError('');
                      }}
                    >
                      <t.icon size={17} />
                      {t.label}
                    </button>
                  );
                })}
                {group.label === 'ROOMS' && (
                  <button onClick={onClose}>
                    <ArrowLeft size={17} />
                    Sohbete dön
                  </button>
                )}
              </div>
            ))}
          </div>
          <SettingsConnection notify={notify} />
        </nav>
        {narrowSettings && navigationOpen && (
          <button
            className="settings-navigation-scrim"
            tabIndex={-1}
            aria-label="Ayar menüsünü kapat"
            onClick={closeNavigation}
          />
        )}
        <main className="ref-settings-main" inert={narrowSettings && navigationOpen}>
          <header className="ref-settings-toolbar">
            <button
              ref={navigationButton}
              className="settings-navigation-toggle"
              aria-label="Ayar kategorileri"
              aria-expanded={navigationOpen}
              aria-controls="settings-categories"
              onClick={() => setNavigationOpen(true)}
            >
              <Menu size={20} />
            </button>
            <Settings2 size={22} />
            <strong>{tabs.find((t) => t.id === tab)?.label}</strong>
            {[
              'server-profile',
              'community-management',
              'channel-permissions',
              'assistant-permissions',
              'automation',
              'hostops',
            ].includes(tab) && (
              <span className="ref-settings-community-name">
                {community.spaces.find((space) => space.id === community.activeSpaceId)?.name ||
                  'Topluluk'}
              </span>
            )}
          </header>
          <div className="settings-content">
            {tab === 'appearance' && (
              <>
                <Heading title="Görünüm ve erişilebilirlik" />
                <div className="ref-settings-grid">
                  <section>
                    <h2>Yoğunluk</h2>
                    <p className="ref-settings-description">
                      Mesajlar ve kanallar arasındaki boşluğu seç.
                    </p>
                    <div className="ref-density-options">
                      {[false, true].map((compact) => (
                        <button
                          key={String(compact)}
                          aria-pressed={p.compact === compact}
                          className={`ref-density ${compact ? 'compact' : ''} ${p.compact === compact ? 'selected' : ''}`}
                          onClick={() => setPreference('compact', compact)}
                        >
                          <span>
                            {Array.from({ length: compact ? 5 : 3 }, (_, i) => (
                              <i key={i} />
                            ))}
                          </span>
                          {compact ? 'Kompakt' : 'Rahat'}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h2>Metin boyutu</h2>
                    <p className="ref-settings-description">Sohbet mesajlarının metin boyutu.</p>
                    <div className="ref-font-size-control">
                      <span>14</span>
                      <input
                        type="range"
                        aria-label="Sohbet metni boyutu"
                        aria-valuetext={`${p.chatFontSize} piksel`}
                        min={14}
                        max={18}
                        step={1}
                        value={p.chatFontSize}
                        onChange={(event) =>
                          setPreference('chatFontSize', Number(event.target.value))
                        }
                      />
                      <span>18</span>
                    </div>
                    <output className="ref-settings-note" aria-live="polite">
                      {p.chatFontSize} px
                    </output>
                  </section>
                </div>
                <div className="ref-settings-grid ref-appearance-surfaces">
                  <section>
                    <h2>Hareket ve yüzeyler</h2>
                    <Row
                      title="Hareketi azalt"
                      description="Animasyonlar ve geçiş hareketleri azaltılır."
                    >
                      <Toggle
                        label="Hareketi azalt"
                        value={p.reduceMotion}
                        onChange={(v) => setPreference('reduceMotion', v)}
                      />
                    </Row>
                    <Row
                      title="Şeffaflığı azalt"
                      description="Cam paneller ve açılır yüzeyler opak görünür."
                    >
                      <Toggle
                        label="Şeffaflığı azalt"
                        value={p.reduceTransparency}
                        onChange={(v) => setPreference('reduceTransparency', v)}
                      />
                    </Row>
                    <Row
                      title="Sistem tercihlerimi kullan"
                      description="Sistemin desteklediği hareket ve şeffaflık azaltma tercihlerini izler."
                    >
                      <Toggle
                        label="Sistem tercihlerimi kullan"
                        value={p.followSystemAccessibility}
                        onChange={(value) => setPreference('followSystemAccessibility', value)}
                      />
                    </Row>
                  </section>
                  <aside className="ref-chat-preview">
                    <span className="ref-preview-label">METİN ÖNİZLEMESİ</span>
                    <div className="ref-settings-inline">
                      <Avatar name={community.user?.displayName || 'ROOMS'} />
                      <div>
                        <strong>{community.user?.displayName || 'ROOMS'}</strong>
                        <p>Metin ve durum işaretleri.</p>
                      </div>
                    </div>
                  </aside>
                </div>
                <section className="ref-settings-section">
                  <h2>Klavye ve odak</h2>
                  <p className="ref-settings-description">
                    Tab ile ilerle, Shift + Tab ile geri dön. Escape açık paneli kapatır.
                  </p>
                  <div className="ref-settings-inline">
                    <button
                      className="button primary ref-focus-sample"
                      onClick={(e) => e.currentTarget.focus()}
                    >
                      Odaklı düğme
                    </button>
                    <kbd>Tab</kbd>
                    <span className="ref-settings-note">Odak çevre çizgisiyle gösterilir.</span>
                  </div>
                </section>
                <Row title="Vurgu" description="">
                  <div className="accent-options">
                    <button
                      aria-label="İnci vurgusu"
                      aria-pressed={p.accent === 'pearl'}
                      className={`accent pearl ${p.accent === 'pearl' ? 'chosen' : ''}`}
                      onClick={() => setPreference('accent', 'pearl')}
                    >
                      {p.accent === 'pearl' && <Check size={13} />}
                    </button>
                    <button
                      aria-label="Adaçayı vurgusu"
                      aria-pressed={p.accent === 'sage'}
                      className={`accent sage ${p.accent === 'sage' ? 'chosen' : ''}`}
                      onClick={() => setPreference('accent', 'sage')}
                    >
                      {p.accent === 'sage' && <Check size={13} />}
                    </button>
                  </div>
                </Row>
                <Row title="Arkadaşlar paneli" description="">
                  <Toggle
                    label="Arkadaşlar panelini göster"
                    value={p.showFriends}
                    onChange={(v) => setPreference('showFriends', v)}
                  />
                </Row>
                <div className="ref-settings-bottom">
                  <Eye size={14} />
                  Koyu tema
                </div>
              </>
            )}
            {tab === 'audio' && (
              <>
                <Heading title="Ses ve video" />
                {devicesLoaded &&
                  !devices.some((d) => d.kind === 'audioinput' || d.kind === 'videoinput') &&
                  !error && (
                    <div className="ref-settings-callout warning" role="status">
                      Mikrofon veya kamera bulunamadı. Cihaz bağladıktan sonra listeyi yenile.
                    </div>
                  )}
                {error && (
                  <div className="ref-settings-callout warning" role="alert">
                    {error}
                  </div>
                )}
                <div className="ref-settings-grid">
                  <section>
                    <h2>Ses girişi</h2>
                    <label className="field-label">
                      Mikrofon
                      <select
                        aria-label="Mikrofon"
                        value={p.inputId}
                        onChange={(e) => {
                          stopMic();
                          setPreference('inputId', e.target.value);
                        }}
                      >
                        <option value="">Sistem varsayılanı</option>
                        {p.inputId && !devices.some((d) => d.deviceId === p.inputId) && (
                          <option value={p.inputId}>Seçili mikrofon kullanılamıyor</option>
                        )}
                        {devices
                          .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')
                          .map((d, i) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Mikrofon ${i + 1}`}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Row
                      title="Giriş seviyesi"
                      description="Mikrofon denemesinde ölçülen yerel seviye."
                    >
                      <span>{Math.round(level)}%</span>
                    </Row>
                    <div
                      className="ref-level-meter"
                      role="meter"
                      aria-label="Mikrofon giriş seviyesi"
                      aria-valuenow={Math.round(level)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      {Array.from({ length: 30 }, (_, i) => (
                        <i key={i} className={testing && i < level * 0.3 ? 'on' : ''} />
                      ))}
                    </div>
                    <div className="ref-settings-inline spread">
                      <button className="button secondary" onClick={() => void startMic()}>
                        {testing ? <Square size={16} /> : <Mic size={16} />}{' '}
                        {testing ? 'Denemeyi bitir' : 'Mikrofonu dene'}
                      </button>
                      <span className="ref-settings-note">{micState}</span>
                    </div>
                  </section>
                  <section>
                    <h2>Ses çıkışı</h2>
                    <Row
                      title="Oda giriş ve çıkış sesleri"
                      description="Yalnızca bulunduğun odadaki hareketler."
                    >
                      <Toggle
                        label="Oda giriş ve çıkış sesleri"
                        value={p.roomEventSounds}
                        onChange={(value) => setPreference('roomEventSounds', value)}
                      />
                    </Row>
                    <label className="field-label">
                      Hoparlör veya kulaklık
                      <select
                        aria-label="Hoparlör veya kulaklık"
                        value={p.outputId}
                        onChange={(e) => setPreference('outputId', e.target.value)}
                      >
                        <option value="">Sistem varsayılanı</option>
                        {p.outputId && !devices.some((d) => d.deviceId === p.outputId) && (
                          <option value={p.outputId}>Seçili hoparlör kullanılamıyor</option>
                        )}
                        {devices
                          .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default')
                          .map((d, i) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Hoparlör ${i + 1}`}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Row title="Çıkış seviyesi" description="Sistem ses ayarlarından yönetilir.">
                      <Volume2 size={16} />
                    </Row>
                    <button className="button secondary" onClick={() => void speakerTest()}>
                      <Volume2 size={16} />
                      Test sesini çal
                    </button>
                    <p className="ref-settings-note">Test sesi yalnızca bu cihazda çalar.</p>
                  </section>
                </div>
                <div className="ref-settings-grid ref-audio-lower">
                  <section>
                    <h2>Konuşma davranışı</h2>
                    <Row title="Bas konuş" description="Uygulama odaktayken tuşları basılı tut.">
                      <Toggle
                        label="Bas konuş"
                        value={p.pushToTalk}
                        onChange={(v) => setPreference('pushToTalk', v)}
                      />
                    </Row>
                    <Row
                      title="Bas konuş tuşu"
                      description="Basılı tuttuğun sürece mikrofonun açık kalır."
                    >
                      <PushToTalkKeyField
                        value={p.pushToTalkKey}
                        onChange={(value) => setPreference('pushToTalkKey', value)}
                      />
                    </Row>
                    <Unsupported
                      title="Girişte mikrofonumu sessize al"
                      reason="Ses odalarına katılırken mikrofon her zaman kapalı başlar."
                      value
                    />
                    <Row
                      title="Gürültü azaltma"
                      description="Mikrofonundan gönderilen sesi bu cihazda temizler."
                    >
                      <Toggle
                        label="Gürültü azaltma"
                        value={p.noiseSuppression}
                        onChange={(value) => {
                          stopMic();
                          setPreference('noiseSuppression', value);
                        }}
                      />
                    </Row>
                    <Row
                      title="Filtre modu"
                      description="Güçlü mod, konuşma algılama ile ani arka plan seslerini de bastırır."
                    >
                      <select
                        aria-label="Gürültü filtresi modu"
                        disabled={!p.noiseSuppression}
                        value={p.noiseSuppressionMode}
                        onChange={(event) => {
                          stopMic();
                          setPreference(
                            'noiseSuppressionMode',
                            event.target.value === 'standard' ? 'standard' : 'strong',
                          );
                        }}
                      >
                        <option value="strong">Güçlü</option>
                        <option value="standard">Standart</option>
                      </select>
                    </Row>
                    <p className="ref-settings-note" role="status">
                      {realtime.noiseProcessing?.status === 'failed'
                        ? 'Filtre hatası · mikrofon kapatıldı'
                        : realtime.noiseProcessing?.status === 'starting'
                          ? 'Filtre hazırlanıyor…'
                          : realtime.noiseProcessing?.status === 'active' && !realtime.muted
                            ? `${realtime.noiseProcessing.mode === 'strong' ? 'Güçlü' : 'Standart'} filtre etkin${realtime.noiseProcessing.mode === 'strong' && realtime.noiseProcessing.stats?.speechGateOpen === false ? ' · konuşma bekleniyor' : ''}`
                            : 'Mikrofon yayını kapalı'}
                    </p>
                  </section>
                  <section>
                    <h2>Kamera</h2>
                    <label className="field-label">
                      Kamera
                      <select
                        aria-label="Kamera"
                        value={cameraId}
                        onChange={(e) => {
                          stopCamera();
                          setCameraId(e.target.value);
                        }}
                      >
                        <option value="">Sistem varsayılanı</option>
                        {devices
                          .filter((d) => d.kind === 'videoinput')
                          .map((d, i) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Kamera ${i + 1}`}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button className="button secondary" onClick={() => void toggleCamera()}>
                      <Video size={16} />
                      {cameraStream ? 'Önizlemeyi kapat' : 'Kamerayı dene'}
                    </button>
                    <p className="ref-settings-note">Kamera denemesi odaya yayınlanmaz.</p>
                    <div className="ref-camera-preview">
                      {cameraStream ? (
                        <video
                          ref={cameraVideo}
                          autoPlay
                          muted
                          playsInline
                          aria-label="Yerel kamera önizlemesi"
                        />
                      ) : (
                        <>
                          <VideoOff size={33} />
                          <span>Kamera kapalı</span>
                        </>
                      )}
                    </div>
                  </section>
                </div>
                <NoiseComparison
                  inputId={p.inputId}
                  mode={p.noiseSuppressionMode}
                  microphoneLive={!realtime.muted}
                />
                <Unsupported
                  title="Ekran paylaşımında sistem sesi"
                  reason="Bu sistem ve paylaşım yöntemi için destek doğrulanmadı."
                />
                <div className="ref-settings-bottom">
                  <button className="text-button" onClick={() => void refreshDevices()}>
                    <RefreshCw size={14} />
                    Cihaz listesini yenile
                  </button>
                  <span>
                    {realtime.status === 'connected'
                      ? `${realtime.roomName} · Ses bağlı`
                      : 'Ses odasına bağlı değil'}
                  </span>
                </div>
              </>
            )}
            {tab === 'server-profile' && <ServerProfile notify={notify} />}
            {tab === 'hostops' && <HostOperations />}
            {tab === 'connections' && <AgentReferenceSettingsContent view="connections" />}
            {tab === 'room-memory' && <AgentReferenceSettingsContent view="memory" />}
            {tab === 'schedules' && <AgentReferenceSettingsContent view="schedules" />}
            {tab === 'services' && (
              <>
                <h3>{'Ba\u011Flant\u0131lar'}</h3>
                <ConnectionPane />
                <PersonalProviders notify={notify} />
                {[
                  {
                    name: 'LiveKit',
                    description: tr('Voice, video & screen sharing'),
                    note:
                      realtime.status === 'connected'
                        ? `${realtime.roomName} odasına bağlı. Mikrofonu, kamerayı ve paylaşımı odandan yönet.`
                        : tr(
                            'Sign in, open a voice channel, and join with your mic off. Screen capture starts only after you select a source.',
                          ),
                  },
                ].map((c) => (
                  <section className="connection-card compact-connection" key={c.name}>
                    <div className="connection-card-heading">
                      <span className="connection-icon">
                        <Link size={20} />
                      </span>
                      <div>
                        <h4>{c.name}</h4>
                        <p>{c.description}</p>
                      </div>
                      <span className="connection-status">
                        {c.name === 'LiveKit'
                          ? realtime.status === 'connected'
                            ? tr('Connected')
                            : community.user
                              ? tr('Ready to join')
                              : tr('Sign in first')
                          : tr('Not configured')}
                      </span>
                    </div>
                    <p className="connection-disclosure">{c.note}</p>
                  </section>
                ))}
              </>
            )}
            {tab === 'agent' && <AgentReferenceSettingsContent view="models" />}
            {tab === 'automation' && <AgentSettings notify={notify} view="automation" />}
            {tab === 'profile' && <ReferenceAccount notify={notify} onClose={onClose} />}

            {tab === 'shortcuts' && (
              <>
                <h3>{'Klavye'}</h3>
                {[
                  [tr('Find a room or command'), '⌘ / Ctrl K'],
                  [tr('Home / Spaces / Chat / Voice / Cinema'), '⌘ / Ctrl 1–5'],
                  [tr('Open settings'), '⌘ / Ctrl ,'],
                  [tr('Mikrofonu aç / kapat'), '⌘ / Ctrl Shift M'],
                  [tr('Push to talk (when enabled)'), 'Ctrl Shift Space'],
                  [tr('Play / pause local media'), 'Space'],
                  [tr('Seek local media 5 seconds'), '← / →'],
                  [tr('Close topmost dialog'), 'Esc'],
                  [tr('Mesaj gönder'), 'Enter'],
                  [tr('New line'), 'Shift Enter'],
                ].map(([a, b]) => (
                  <div className="shortcut-row" key={a}>
                    <span>{a}</span>
                    <kbd>{b}</kbd>
                  </div>
                ))}
              </>
            )}
            {tab === 'desktop' && (
              <>
                <Heading title="Bildirimler ve masaüstü" />
                {notificationFixture?.variant === 'system_permission' && (
                  <div className="ref-settings-callout warning" role="status">
                    Geliştirme örneği · sistem bildirimleri kullanılamıyor.
                  </div>
                )}
                <div className="ref-notification-columns">
                  <section>
                    <h2>Bildirimler</h2>
                    <Row
                      title="Masaüstü bildirimleri"
                      description={
                        notifications?.supported
                          ? 'ROOMS arka plandayken yeni mesajı haber verir.'
                          : 'Sistem bildirimleri bu ortamda kullanılamıyor.'
                      }
                    >
                      <Toggle
                        label="Masaüstü bildirimleri"
                        value={notifications?.enabled ?? false}
                        disabled={!notifications?.supported || notificationBusy}
                        onChange={async (value) => {
                          setNotificationBusy(true);
                          try {
                            setNotifications(await notificationApi!.setOptIn(value));
                          } catch (e) {
                            setError(uiError(e));
                          } finally {
                            setNotificationBusy(false);
                          }
                        }}
                      />
                    </Row>
                    <Row title="Bildirim sesleri" description="Sistem bildirim sesini kullanır.">
                      <Toggle
                        label="Bildirim sesleri"
                        value={notifications?.sound ?? false}
                        disabled={
                          !notifications?.supported || !notifications.enabled || notificationBusy
                        }
                        onChange={async (value) => {
                          setNotificationBusy(true);
                          try {
                            setNotifications(await notificationApi!.setSound(value));
                          } catch (e) {
                            setError(uiError(e));
                          } finally {
                            setNotificationBusy(false);
                          }
                        }}
                      />
                    </Row>
                    <Unsupported
                      title="Mesaj önizlemesini göster"
                      reason="Mesaj içerikleri masaüstü bildirimlerine eklenmez."
                    />
                    <Row
                      title="Görüşmedeyken bildirimleri duraklat"
                      description="Ses bağlantısı sürerken masaüstü bildirimlerini göstermez."
                    >
                      <Toggle
                        label="Görüşmedeyken bildirimleri duraklat"
                        value={notifications?.pauseDuringVoice ?? false}
                        disabled={!notifications?.supported || notificationBusy}
                        onChange={async (value) => {
                          setNotificationBusy(true);
                          try {
                            setNotifications(await notificationApi!.setPauseDuringVoice(value));
                          } catch (e) {
                            setError(uiError(e));
                          } finally {
                            setNotificationBusy(false);
                          }
                        }}
                      />
                    </Row>
                    <ChannelNotifications bridge={notificationFixture?.notifications} />
                  </section>
                  <aside>
                    <span className="ref-preview-label">BİLDİRİM BİÇİMİ</span>
                    <div className="ref-notification-preview">
                      <Bell size={22} />
                      <div>
                        <strong>ROOMS</strong>
                        <p>Mesaj içeriği gizli.</p>
                      </div>
                    </div>
                    <div className="ref-settings-divider" />
                    <span className="ref-preview-label">MASAÜSTÜ</span>
                    <div className="ref-desktop-summary">
                      <strong>ROOMS</strong>
                      <p>
                        {realtime.status === 'connected'
                          ? `${realtime.roomName} · Ses bağlı`
                          : 'Ses odasına bağlı değil'}
                      </p>
                      <button
                        className="text-button"
                        aria-expanded={trayPreview}
                        onClick={() => setTrayPreview((value) => !value)}
                      >
                        Menü seçenekleri
                      </button>
                      {trayPreview && (
                        <Modal
                          title="Menü çubuğu"
                          className="ref-settings-confirm"
                          onClose={() => setTrayPreview(false)}
                        >
                          <p>Sistem menüsündeki komutlar.</p>
                          <div className="ref-tray-preview">
                            <strong>ROOMS</strong>
                            <ul>
                              <li>ROOMS’u aç</li>
                              <li>Çıkış</li>
                            </ul>
                            <small>Çıkış, ses bağlantısını da sonlandırır.</small>
                          </div>
                          <p>Mikrofon ve ses odası komutları sistem menüsünde henüz sunulmuyor.</p>
                          <div className="button-row">
                            <button
                              className="button secondary"
                              onClick={() => setTrayPreview(false)}
                            >
                              Tercihlere dön
                            </button>
                          </div>
                        </Modal>
                      )}
                    </div>
                  </aside>
                </div>
                <section className="ref-settings-section">
                  <h2>Masaüstü davranışı</h2>
                  <Row
                    title="Oturum açınca başlat"
                    description={
                      window.rooms
                        ? 'Paketlenmiş macOS uygulamasında kullanılabilir.'
                        : 'Bu tercih masaüstü uygulamasını gerektirir.'
                    }
                  >
                    <Toggle
                      label="Oturum açınca başlat"
                      value={autoStart}
                      disabled={!window.rooms}
                      onChange={async (v) => {
                        try {
                          const applied = await window.rooms!.setLoginItem(v);
                          setAutoStart(applied);
                          if (v && !applied)
                            notify('Geliştirme uygulamasında başlangıç kaydı kullanılamıyor.');
                        } catch (e) {
                          setError(uiError(e));
                        }
                      }}
                    />
                  </Row>
                  <DesktopWindowSettings bridge={notificationFixture?.desktopWindow} />
                  <Row
                    title="Pencereyi üstte tut"
                    description={window.rooms ? '' : 'Masaüstü uygulamasını gerektirir.'}
                  >
                    <Toggle
                      label="Pencereyi üstte tut"
                      value={onTop}
                      disabled={!window.rooms}
                      onChange={async (v) => {
                        try {
                          await window.rooms!.setAlwaysOnTop(v);
                          setOnTop(v);
                        } catch (e) {
                          setError(uiError(e));
                        }
                      }}
                    />
                  </Row>
                  <Row title="Tam ekran" description="">
                    <button
                      className="button secondary"
                      onClick={async () => {
                        try {
                          if (window.rooms) await window.rooms.windowAction('fullscreen');
                          else if (document.fullscreenElement) await document.exitFullscreen();
                          else await document.documentElement.requestFullscreen();
                        } catch (e) {
                          setError(uiError(e));
                        }
                      }}
                    >
                      Tam ekranı değiştir
                    </button>
                  </Row>
                </section>
                <DesktopUpdates />
              </>
            )}
            {tab === 'community-management' && (
              <CommunityManagementEntry
                onCreateInvite={onInvite}
                onBack={onClose}
                onChannelPermissions={() => setParams({ tab: 'channel-permissions' })}
              />
            )}
            {tab === 'channel-permissions' && (
              <ChannelPermissionsSurface
                channelId={params.get('channel') ?? community.activeChannelId}
              />
            )}
            {tab === 'about' && <About notify={notify} />}
            {tab === 'assistant-permissions' && <AssistantManagement />}
            {tab === 'diagnostics' && (
              <>
                <h3>{'Tan\u0131lama'}</h3>
                <div className="diagnostic-list">
                  {[
                    [tr('Application'), tr('ROOMS 0.1.14 / Desktop')],
                    [tr('Runtime'), window.rooms ? 'Electron 44.7.0' : tr('Browser preview')],
                    [tr('Platform'), window.rooms?.platform ?? tr('Browser')],
                    [tr('Social / gateway'), community.status],
                    ['WebRTC / SFU', realtime.status],
                    [
                      tr('Activity service'),
                      tr('Durum, seçili odanın etkinlik ekranında gösterilir'),
                    ],
                    [
                      tr('Provider connections'),
                      tr('Kişisel kaynaklar için Bağlantılar ekranını aç'),
                    ],
                    [tr('Microphone permission'), micState],
                    [
                      tr('Bitrate / packet loss / ping'),
                      realtime.status === 'connected'
                        ? `${realtime.diagnostics.bitrate === null ? '—' : Math.round(realtime.diagnostics.bitrate / 1000) + ' kbps'} / ${realtime.diagnostics.packetLoss === null ? '—' : (realtime.diagnostics.packetLoss * 100).toFixed(1) + '%'} / ${realtime.diagnostics.rtt === null ? '—' : Math.round(realtime.diagnostics.rtt) + ' ms'}`
                        : tr('Unavailable \u2014 no active transport'),
                    ],
                    [
                      'Video / codec',
                      realtime.diagnostics.video
                        ? `${realtime.diagnostics.video.width} × ${realtime.diagnostics.video.height} / ${realtime.diagnostics.video.framesPerSecond ?? '—'} fps / ${realtime.diagnostics.video.codec ?? '—'} / ${realtime.diagnostics.video.direction === 'sent' ? 'gönderilen' : 'alınan'}`
                        : '—',
                    ],
                    [
                      tr('Data mode'),
                      community.user ? tr('Gerçek topluluk hesabı') : tr('Giriş yapılmadı'),
                    ],
                  ].map(([a, b]) => (
                    <div key={a}>
                      <span>{a}</span>
                      <strong>{b}</strong>
                    </div>
                  ))}
                </div>
                <button className="button secondary" onClick={() => void exportDiagnostics()}>
                  <ArrowDownToLine size={16} />
                  {tr('Export sanitized diagnostics')}
                </button>
              </>
            )}
            {error && tab !== 'audio' && (
              <div className="error-pane" role="alert">
                <strong>{tr('Let\u2019s check that.')}</strong>
                <p>{error}</p>
              </div>
            )}
          </div>
          {dirty && (
            <div className="settings-save-bar" role="region" aria-label="Kaydedilmemiş ayarlar">
              <span>Kaydedilmemiş değişiklikler</span>
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => {
                  setDraftPreferences({ ...savedPreferences });
                  setError('');
                }}
              >
                Vazgeç
              </button>
              <button
                className="button primary"
                disabled={saving}
                onClick={() => void savePreferences()}
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          )}
        </main>
      </div>
      {confirmDiscard && (
        <Modal title="Değişiklikler kaydedilmedi" onClose={() => setConfirmDiscard(false)}>
          <p>Ayarları kaydetmeden çıkmak istiyor musun?</p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setConfirmDiscard(false)}>
              Düzenlemeye dön
            </button>
            <button
              className="button danger"
              disabled={saving}
              onClick={() => {
                approvedClose.current = true;
                onClose();
              }}
            >
              Kaydetmeden çık
            </button>
            <button
              className="button primary"
              disabled={saving}
              onClick={() =>
                void savePreferences().then((saved) => {
                  if (saved) setConfirmDiscard(false);
                })
              }
            >
              Kaydet
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
