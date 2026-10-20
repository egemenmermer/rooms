import { SpeakingMeter } from './speaking-meter';
import { captureMissesInput, inputDeviceLabel } from './input-device';
import type { NoiseSuppressionMode, NoiseProcessingState } from './noise-suppression';
import { SoundboardMixer } from './soundboard';
import {
  FLAT_EQUALIZER,
  equalizerNodes,
  isFlat,
  parseEqualizer,
  tuneEqualizer,
  type MusicEqualizer,
} from './music-equalizer';
export type { MusicEqualizer } from './music-equalizer';
import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
  createLocalAudioTrack,
  type Participant,
} from 'livekit-client';
import type { ConnectionStatus } from '@rooms/contracts';
import {
  PERSONAL_SOUND_ATTRIBUTES,
  PERSONAL_SOUND_EVENTS,
  isPersonalSoundId,
} from '../../shared-contracts/src/personal-sounds';

export interface MediaParticipant {
  id: string;
  name: string;
  local: boolean;
  muted: boolean;
  /** Not hearing the room; shared by the access service as the rooms.deafened attribute. */
  deafened?: boolean;
  speaking: boolean;
  camera: boolean;
  screen: boolean;
  volume: number;
  screenVolume?: number;
  quality: string;
  /** Screen share this person chose to watch, as they announced it; null when not watching. */
  watching?: string | null;
  /** Entrance and leave sounds the access service stamped on this person; absent means classic. */
  sounds?: { enter?: string; leave?: string };
}
export interface MediaTrack {
  id: string;
  participantId: string;
  source: string;
  kind: string;
  local: boolean;
  muted: boolean;
  /** False for a remote screen share that is only advertised until the listener watches it. */
  subscribed?: boolean;
}
export interface MediaDiagnostics {
  bitrate: number | null;
  packetLoss: number | null;
  rtt: number | null;
  video?: {
    width: number;
    height: number;
    framesPerSecond: number | null;
    codec: string | null;
    direction: 'sent' | 'received';
  };
}
export interface MediaSnapshot {
  status: ConnectionStatus;
  roomId: string | null;
  error: string | null;
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  sharing: boolean;
  audioBlocked: boolean;
  inputDeviceFallback?: boolean;
  /** OS name of the microphone the room hears; null or absent while unknown. */
  inputDevice?: string | null;
  participants: MediaParticipant[];
  tracks: MediaTrack[];
  diagnostics: MediaDiagnostics;
  noiseProcessing?: NoiseProcessingState;
}
export interface MediaGrant {
  roomId: string;
  url: string;
  token: string;
}
export type ScreenShareQuality = '720p30' | '1080p30' | '1080p60' | '1440p60' | '4k30';
export interface ScreenShareOptions {
  quality?: ScreenShareQuality;
  audio?: boolean;
  content?: 'motion' | 'detail';
}
export const screenProfiles = {
  '720p30': { width: 1280, height: 720, frameRate: 30, bitrate: 3_000_000 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30, bitrate: 6_000_000 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60, bitrate: 10_000_000 },
  '1440p60': { width: 2560, height: 1440, frameRate: 60, bitrate: 16_000_000 },
  '4k30': { width: 3840, height: 2160, frameRate: 30, bitrate: 24_000_000 },
} as const;
export interface RealtimeMediaProvider {
  publishControl?(payload: string, destination: string, reliable: boolean): Promise<void>;
  onControl?(listener: (payload: string, senderId: string) => void): () => void;
  /** Lossy, room-wide pointer positions for shared surfaces such as the whiteboard. */
  publishCursor?(payload: string): Promise<void>;
  onCursor?(listener: (payload: string, senderId: string) => void): () => void;
  /** A moderator asked this client to join another voice room (sent by the server only). */
  onMove?(listener: (channelId: string) => void): () => void;
  readonly status: ConnectionStatus;
  connectRoom(roomId: string, shortLivedMembershipToken: string, serverUrl: string): Promise<void>;
  publishMic(deviceId?: string): Promise<void>;
  setNoiseSuppression(value: boolean, mode?: NoiseSuppressionMode): Promise<void>;
  playSoundboard(buffer: AudioBuffer, volume: number): Promise<void>;
  stopSoundboard(): void;
  publishCamera(enabled: boolean, deviceId?: string): Promise<void>;
  publishScreen(options?: ScreenShareOptions): Promise<void>;
  stopScreen(): Promise<void>;
  subscribe(participantId: string): Promise<MediaStream>;
  attachTrack(trackId: string, element: HTMLMediaElement): () => void;
  deviceSelection(inputId: string, outputId: string): Promise<void>;
  participantState(): MediaParticipant[];
  diagnostics(): MediaDiagnostics;
  snapshot(): MediaSnapshot;
  subscribeState(listener: () => void): () => void;
  mute(value: boolean): Promise<void>;
  deafen(value: boolean): Promise<void>;
  setListenerScope?(scope: string): void;
  /** This listener's own DJ equalizer; it never changes what others hear. */
  musicEqualizer?(): MusicEqualizer;
  setMusicEqualizer?(value: MusicEqualizer): void;
  setParticipantVolume(participantId: string, volume: number): void;
  setScreenVolume?(participantId: string, volume: number): void;
  watchScreen?(participantId: string | null): void;
  startAudio(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
}
const WATCH_TOPIC = 'rooms-watch-v1';
const CURSOR_TOPIC = 'rooms-cursor-v1';
const MOVE_TOPIC = 'rooms-move-v1';
const isScreenSource = (source: Track.Source) =>
  source === Track.Source.ScreenShare || source === Track.Source.ScreenShareAudio;
/** `{ watching: identity | null }`; anything else is ignored. */
export function parseWatch(payload: Uint8Array): string | null | undefined {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
    const watching = value?.watching;
    if (watching === null) return null;
    if (typeof watching === 'string' && watching.length > 0 && watching.length <= 128)
      return watching;
  } catch {
    /* Malformed data is never input. */
  }
  return undefined;
}
/** Bot music needs finer attenuation than speech; the UI still stores a 0–1 level. */
function listenerGain(id: string, level: number) {
  return id.startsWith('rooms-music-') ? level * level : level;
}
/** Only well-formed ids survive, so a stray attribute can never become a fetch path. */
function personalSounds(attributes: Readonly<Record<string, string>> | undefined) {
  let sounds: MediaParticipant['sounds'];
  for (const event of PERSONAL_SOUND_EVENTS) {
    const value = attributes?.[PERSONAL_SOUND_ATTRIBUTES[event]];
    if (isPersonalSoundId(value)) sounds = { ...sounds, [event]: value };
  }
  return sounds;
}
const emptyDiagnostics = (): MediaDiagnostics => ({ bitrate: null, packetLoss: null, rtt: null });
/** No auth credentials other than the in-memory, short-lived room token enter this adapter. */
export class LiveKitMediaProvider implements RealtimeMediaProvider {
  private controlListeners = new Set<(payload: string, senderId: string) => void>();
  onControl(listener: (payload: string, senderId: string) => void) {
    this.controlListeners.add(listener);
    return () => {
      this.controlListeners.delete(listener);
    };
  }
  private cursorListeners = new Set<(payload: string, senderId: string) => void>();
  onCursor(listener: (payload: string, senderId: string) => void) {
    this.cursorListeners.add(listener);
    return () => {
      this.cursorListeners.delete(listener);
    };
  }
  private moveListeners = new Set<(channelId: string) => void>();
  onMove(listener: (channelId: string) => void) {
    this.moveListeners.add(listener);
    return () => {
      this.moveListeners.delete(listener);
    };
  }
  async publishCursor(payload: string) {
    if (new TextEncoder().encode(payload).length > 512) throw Error('Invalid cursor packet.');
    const room = this.room;
    if (!room || this.state.status !== 'connected') return;
    await room.localParticipant.publishData(new TextEncoder().encode(payload), {
      reliable: false,
      topic: CURSOR_TOPIC,
    });
  }
  async publishControl(payload: string, destination: string, reliable: boolean) {
    if (new TextEncoder().encode(payload).length > 4096 || !destination || destination.length > 128)
      throw Error('Invalid control packet.');
    const room = this.requireRoom();
    await room.localParticipant.publishData(new TextEncoder().encode(payload), {
      reliable,
      topic: 'rooms-control-v1',
      destinationIdentities: [destination],
    });
  }
  private room: Room | null = null;
  private grant: MediaGrant | null = null;
  private listeners = new Set<() => void>();
  private audio = new Map<string, HTMLMediaElement>();
  private volumes = new Map<string, number>();
  private watchedScreen: string | null = null;
  /** Announced screen choice of each remote participant, keyed by their LiveKit identity. */
  private watchers = new Map<string, string | null>();
  private screenAudio = new Set<string>();
  private listenerScope = '';
  private outputDeviceId = '';
  setListenerScope(scope: string) {
    if (scope === this.listenerScope) return;
    this.listenerScope = scope;
    this.volumes.clear();
    try {
      this.equalizer =
        (scope &&
          parseEqualizer(JSON.parse(localStorage.getItem(`rooms-dj-eq-v1:${scope}`) ?? 'null'))) ||
        FLAT_EQUALIZER;
    } catch {
      this.equalizer = FLAT_EQUALIZER;
    }
    this.applyEqualizer();
    try {
      const value = JSON.parse(localStorage.getItem(`rooms-listener-levels-v1:${scope}`) ?? '{}');
      if (scope && value && typeof value === 'object' && !Array.isArray(value))
        for (const [id, level] of Object.entries(value).slice(0, 512))
          if (
            id.length <= 256 &&
            typeof level === 'number' &&
            Number.isFinite(level) &&
            level >= 0 &&
            level <= 1
          )
            this.volumes.set(id, level);
    } catch {
      /* Missing or damaged settings do not prevent joining. */
    }
    for (const [id, person] of this.room?.remoteParticipants ?? []) {
      person.setVolume(listenerGain(id, this.volumes.get(id) ?? 1), Track.Source.Microphone);
      if (person.getTrackPublication?.(Track.Source.ScreenShareAudio))
        person.setVolume(this.volumes.get(`screen:${id}`) ?? 1, Track.Source.ScreenShareAudio);
    }
    if (this.room) this.sync();
  }
  private attachments = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private speakingMeter = new SpeakingMeter(() => this.sync());
  private state: MediaSnapshot = {
    status: 'not-configured',
    roomId: null,
    error: null,
    muted: true,
    deafened: false,
    camera: false,
    sharing: false,
    audioBlocked: false,
    participants: [],
    tracks: [],
    diagnostics: emptyDiagnostics(),
  };
  private soundboardSerial = 0;
  private soundboardWork: Promise<void> = Promise.resolve();
  private noiseSuppression = true;
  private noiseMode: NoiseSuppressionMode = 'strong';
  private inputDeviceId: string | undefined;
  private microphoneSerial = 0;
  private pendingMic: LocalAudioTrack | null = null;
  private pendingMixer: SoundboardMixer | null = null;
  private mixer: SoundboardMixer | null = null;
  private mixerTrack: LocalAudioTrack | null = null;
  private soundContext: AudioContext | null = null;
  private epoch = 0;
  private disconnecting: Promise<void> | null = null;
  private microphoneWork: Promise<void> = Promise.resolve();
  private microphoneTask<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.microphoneWork.then(operation);
    this.microphoneWork = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  setNoiseSuppression(value: boolean, mode: NoiseSuppressionMode = this.noiseMode) {
    return this.microphoneTask(async () => {
      const prior = this.noiseSuppression,
        previousMode = this.noiseMode;
      const track = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (track instanceof LocalAudioTrack && track.mediaStreamTrack.readyState === 'live') {
        await this.ensureMixer(track);
        this.patch({ noiseProcessing: { status: 'starting', mode } });
        try {
          await track.applyConstraints({
            noiseSuppression: false,
            echoCancellation: true,
            autoGainControl: !value || mode !== 'strong',
          });
          await this.mixer!.setNoiseSuppression(value, mode);
          this.patch({ noiseProcessing: { status: value ? 'active' : 'off', mode } });
        } catch (error) {
          try {
            await track.applyConstraints({
              noiseSuppression: false,
              echoCancellation: true,
              autoGainControl: !prior || previousMode !== 'strong',
            });
            await this.mixer?.setNoiseSuppression(prior, previousMode);
            this.patch({
              noiseProcessing: { status: prior ? 'active' : 'off', mode: previousMode },
            });
          } catch {
            await track.mute();
            track.stop();
            this.patch({ muted: true, noiseProcessing: { status: 'failed', mode: previousMode } });
          }
          throw error;
        }
      }
      this.noiseSuppression = value;
      this.noiseMode = mode;
    });
  }
  private async ensureMixer(track: LocalAudioTrack) {
    const epoch = this.epoch,
      serial = this.microphoneSerial;
    if (this.mixerTrack === track && this.mixer?.processedTrack?.readyState === 'live') return;
    await this.mixer?.destroy();
    await this.soundContext?.close();
    this.mixer = null;
    this.mixerTrack = null;
    const context = new AudioContext({ sampleRate: 48_000 });
    this.soundContext = context;
    track.setAudioContext(context);
    this.patch({
      noiseProcessing: { status: this.noiseSuppression ? 'starting' : 'off', mode: this.noiseMode },
    });
    const mixer = new SoundboardMixer(this.noiseSuppression, this.noiseMode, {
      error: () => {
        if (this.mixer !== mixer) return;
        this.stopSoundboard();
        this.patch({
          muted: true,
          error:
            'Gürültü filtresi durdu. Mikrofon kapatıldı. Filtre modunu değiştirip mikrofonu yeniden aç.',
          noiseProcessing: { status: 'failed', mode: this.noiseMode },
        });
        void track
          .mute()
          .catch(() => {})
          .finally(() => track.stop());
      },
      stats: (stats) => {
        if (this.mixer === mixer && this.state.noiseProcessing?.status === 'active')
          this.patch({ noiseProcessing: { status: 'active', mode: this.noiseMode, stats } });
      },
    });
    this.pendingMixer = mixer;
    try {
      await (context as AudioContext & { setSinkId?(id: string): Promise<void> }).setSinkId?.(
        this.outputDeviceId,
      );
      await track.setProcessor(mixer);
      await context.resume();
      if (epoch !== this.epoch || serial !== this.microphoneSerial)
        throw new DOMException('Cancelled', 'AbortError');
      this.mixer = mixer;
      this.mixerTrack = track;
      this.patch({
        noiseProcessing: { status: this.noiseSuppression ? 'active' : 'off', mode: this.noiseMode },
      });
    } catch (error) {
      await mixer.destroy();
      await context.close();
      if (this.soundContext === context) this.soundContext = null;
      if (epoch === this.epoch && serial === this.microphoneSerial)
        this.patch({ noiseProcessing: { status: 'failed', mode: this.noiseMode } });
      throw error;
    } finally {
      if (this.pendingMixer === mixer) this.pendingMixer = null;
    }
  }
  stopSoundboard() {
    ++this.soundboardSerial;
    this.mixer?.stop();
  }
  playSoundboard(buffer: AudioBuffer, volume: number) {
    const serial = ++this.soundboardSerial;
    const task = this.soundboardWork.then(() => this.playClip(buffer, volume, serial));
    this.soundboardWork = task.catch(() => {});
    return task;
  }
  private async playClip(buffer: AudioBuffer, volume: number, serial: number) {
    if (serial !== this.soundboardSerial) return;
    if (!Number.isFinite(volume) || volume < 0 || volume > 1 || buffer.duration > 8)
      throw new Error('En fazla 8 saniyelik bir ses seç.');
    const room = this.requireRoom();
    if (this.state.muted || this.state.deafened) throw new Error('Önce mikrofonu aç.');
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (!(track instanceof LocalAudioTrack)) throw new Error('Mikrofon kullanılamıyor.');
    await this.microphoneTask(() => this.ensureMixer(track));
    if (this.room !== room || !room.localParticipant.isMicrophoneEnabled || this.state.deafened)
      throw new Error('Mikrofon kapalı.');
    await this.mixer!.play(
      buffer,
      volume,
      () =>
        serial === this.soundboardSerial &&
        this.room === room &&
        room.localParticipant.isMicrophoneEnabled &&
        !this.state.deafened,
    );
    if (this.room !== room || !room.localParticipant.isMicrophoneEnabled || this.state.deafened)
      this.stopSoundboard();
  }
  private priorStats: { time: number; bytes: number } | null = null;
  constructor(
    private readonly createRoom: () => Room = () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      }),
  ) {}
  get status() {
    return this.state.status;
  }
  snapshot = () => this.state;
  subscribeState = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private patch(patch: Partial<MediaSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private requireRoom() {
    if (!this.room || this.status !== 'connected')
      throw new Error('Join a connected voice room first.');
    return this.room;
  }
  private fail(error: unknown) {
    // SDK exceptions may contain signaling URLs/JWTs: expose only an actionable category.
    const name =
      typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
    this.patch({
      error:
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Mikrofon veya kamera izni kapalı. Sistem Ayarları → Gizlilik ve Güvenlik bölümünden Tayfa iznini aç.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'Seçili cihaz bulunamadı. Ses ayarlarından sistem varsayılanını seç.'
            : name === 'NotReadableError'
              ? 'Cihaz açılamadı. Başka bir uygulamanın cihazı kullanıp kullanmadığını kontrol et.'
              : 'Ses işlemi tamamlanamadı. Cihaz ayarlarını ve oda bağlantısını kontrol et.',
    });
  }
  private sync() {
    const room = this.room;
    if (!room) return;
    if (!room.localParticipant.isMicrophoneEnabled) this.stopSoundboard();
    const people: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    const microphones = new Map<string, MediaStreamTrack>();
    if (this.status === 'connected')
      for (const person of people) {
        const track = person.getTrackPublication?.(Track.Source.Microphone)?.track
          ?.mediaStreamTrack;
        if (
          person.isMicrophoneEnabled &&
          track?.readyState === 'live' &&
          !person.identity.startsWith('rooms-music-')
        )
          microphones.set(person.identity, track);
      }
    this.speakingMeter.reconcile(microphones);
    this.patch({
      muted: !room.localParticipant.isMicrophoneEnabled,
      camera: room.localParticipant.isCameraEnabled,
      sharing: room.localParticipant.isScreenShareEnabled,
      participants: people
        .filter((p) => p.identity)
        .map((p) => ({
          id: p.identity,
          name: p.name || p.identity,
          local: p === room.localParticipant,
          muted: !p.isMicrophoneEnabled,
          deafened:
            p === room.localParticipant
              ? this.state.deafened
              : p.attributes?.['rooms.deafened'] === '1',
          speaking:
            this.status === 'connected' &&
            p.isMicrophoneEnabled &&
            (this.speakingMeter.speaking(p.identity) ?? p.isSpeaking),
          camera: p.isCameraEnabled,
          screen: p.isScreenShareEnabled,
          volume: this.volumes.get(p.identity) ?? 1,
          screenVolume: this.volumes.get(`screen:${p.identity}`) ?? 1,
          quality: p.connectionQuality,
          watching:
            p === room.localParticipant
              ? this.watchedScreen
              : (this.watchers.get(p.identity) ?? null),
          sounds: personalSounds(p.attributes),
        })),
      tracks: people.flatMap((p) =>
        [...p.trackPublications.values()]
          .filter(
            (pub) =>
              !!pub.track ||
              (p !== room.localParticipant && pub.source === Track.Source.ScreenShare),
          )
          .map((pub) => ({
            id: pub.trackSid,
            participantId: p.identity,
            source: pub.source,
            kind: pub.kind,
            local: p === room.localParticipant,
            muted: pub.isMuted,
            subscribed: !!pub.track,
          })),
      ),
    });
  }
  async connectRoom(roomId: string, token: string, serverUrl: string) {
    const parsed = new URL(serverUrl);
    if (
      !['wss:', 'ws:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error('A plain ws/wss media server URL is required.');
    if (parsed.protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
      throw new Error('Remote media servers require TLS.');
    if (!roomId || !token) throw new Error('A room membership grant is required.');
    await this.disconnect();
    const epoch = ++this.epoch;
    this.grant = { roomId, token, url: parsed.href };
    const room = this.createRoom();
    this.room = room;
    let controlSecond = 0,
      controlCount = 0,
      cursorSecond = 0,
      cursorCount = 0;
    room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (this.room !== room || this.state.status !== 'connected') return;
      if (!participant) {
        // Only the server sends without a participant; members cannot forge a move.
        if (topic !== MOVE_TOPIC || payload.length > 512) return;
        try {
          const channelId = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(payload),
          )?.channelId;
          if (typeof channelId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(channelId))
            for (const listener of this.moveListeners) listener(channelId);
        } catch {
          /* Malformed data is never a move. */
        }
        return;
      }
      if (topic === CURSOR_TOPIC) {
        // Cursors are frequent and disposable: their own budget, never mixed with control input.
        const second = Math.floor(Date.now() / 1000);
        if (second !== cursorSecond) {
          cursorSecond = second;
          cursorCount = 0;
        }
        if (payload.length > 512 || ++cursorCount > 600) return;
        try {
          const data = new TextDecoder('utf-8', { fatal: true }).decode(payload);
          for (const listener of this.cursorListeners) listener(data, participant.identity);
        } catch {
          /* Malformed data is never input. */
        }
        return;
      }
      if ((topic !== 'rooms-control-v1' && topic !== WATCH_TOPIC) || payload.length > 4096) return;
      const second = Math.floor(Date.now() / 1000);
      if (second !== controlSecond) {
        controlSecond = second;
        controlCount = 0;
      }
      if (++controlCount > 256) return;
      if (topic === WATCH_TOPIC) {
        // The viewer is the authenticated sender, never a name inside the payload.
        const watching = parseWatch(payload);
        if (watching !== undefined) {
          this.watchers.set(participant.identity, watching);
          this.sync();
        }
        return;
      }
      try {
        const data = new TextDecoder('utf-8', { fatal: true }).decode(payload);
        for (const listener of this.controlListeners) listener(data, participant.identity);
      } catch {
        /* Malformed data is never input. */
      }
    });
    this.patch({ status: 'connecting', roomId, error: null });
    const sync = () => {
      if (this.room === room) this.sync();
    };
    for (const event of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ConnectionQualityChanged,
      RoomEvent.ParticipantNameChanged,
      RoomEvent.ParticipantAttributesChanged,
      RoomEvent.MediaDevicesChanged,
      RoomEvent.ActiveDeviceChanged,
    ])
      room.on(event, sync);
    room.on(RoomEvent.TrackPublished, () => {
      if (this.room === room) this.applyScreenSubscriptions();
    });
    room.on(RoomEvent.MediaDevicesChanged, () => {
      if (this.room === room) void this.followInput(room).catch(() => {});
    });
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      if (this.room === room) this.announceWatch(participant.identity);
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (this.room !== room) return;
      this.watchers.delete(participant.identity);
      sync();
    });
    room.on(RoomEvent.ConnectionStateChanged, (value) => {
      if (this.room !== room) return;
      const status: ConnectionStatus =
        value === ConnectionState.Connected
          ? 'connected'
          : value === ConnectionState.Connecting
            ? 'connecting'
            : value === ConnectionState.Reconnecting || value === ConnectionState.SignalReconnecting
              ? 'reconnecting'
              : 'error';
      this.patch({ status });
      sync();
    });
    room.on(RoomEvent.Disconnected, (reason) => {
      if (this.room === room) {
        this.stopSoundboard();
        this.cleanupPlayback();
        this.patch({
          status: 'error',
          muted: true,
          sharing: false,
          camera: false,
          tracks: [],
          participants: [],
          error:
            reason === DisconnectReason.PARTICIPANT_REMOVED
              ? 'A moderator disconnected you from the voice room.'
              : 'Voice disconnected. Rejoin to obtain a fresh membership grant.',
        });
      }
    });
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (this.room !== room) return;
      if (isScreenSource(publication.source) && participant.identity !== this.watchedScreen) {
        // Auto-subscription delivered a screen nobody here chose to watch.
        publication.setSubscribed(false);
        return;
      }
      if (track.kind === Track.Kind.Audio && typeof document !== 'undefined') {
        const element = track.attach();
        element.hidden = true;
        document.body.append(element);
        this.audio.set(publication.trackSid, element);
        const screen = publication.source === Track.Source.ScreenShareAudio;
        if (screen) this.screenAudio.add(publication.trackSid);
        element.muted =
          this.state.deafened || (screen && this.watchedScreen !== participant.identity);
        participant.setVolume(
          screen
            ? (this.volumes.get(`screen:${participant.identity}`) ?? 1)
            : listenerGain(participant.identity, this.volumes.get(participant.identity) ?? 1),
          screen ? Track.Source.ScreenShareAudio : Track.Source.Microphone,
        );
        void element.play().catch(() => this.patch({ audioBlocked: true }));
        if (participant.identity.startsWith('rooms-music-')) this.applyEqualizer();
      }
      sync();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
      if (this.room !== room) return;
      const element = this.audio.get(publication.trackSid);
      if (element) {
        track.detach(element);
        element.remove();
      }
      this.audio.delete(publication.trackSid);
      this.screenAudio.delete(publication.trackSid);
      this.equalized.delete(publication.trackSid);
      sync();
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (this.room === room) this.patch({ audioBlocked: !room.canPlaybackAudio });
    });
    room.on(RoomEvent.MediaDevicesError, (error) => {
      if (this.room === room) this.fail(error);
    });
    try {
      await room.connect(parsed.href, token, { autoSubscribe: true });
      if (epoch !== this.epoch) {
        await room.disconnect(true);
        return;
      }
      this.patch({ status: 'connected' });
      this.applyScreenSubscriptions();
      sync();
      this.timer = setInterval(() => {
        void this.measure();
      }, 5000);
    } catch (error) {
      if (epoch === this.epoch) {
        this.fail(error);
        this.patch({ status: 'error' });
        await room.disconnect(true);
        this.cleanupPlayback();
      }
      throw new Error(
        'Unable to connect to the media server. Check the server URL and room membership.',
      );
    }
  }
  private captureOptions(deviceId: string | { exact: string } | undefined) {
    return {
      deviceId,
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: !this.noiseSuppression || this.noiseMode !== 'strong',
      channelCount: 1,
      sampleRate: 48_000,
    };
  }
  /**
   * The room keeps hearing the microphone the person selected. Chromium resolves "system
   * default" only when capture opens, and after an unplug LiveKit reopens the default, so a
   * headset switched on (or back) during a call would stay unused while another microphone
   * keeps sending, and the headset's own mute switch would silence nothing the room hears.
   */
  private followInput(room: Room) {
    return this.microphoneTask(async () => {
      const selected = this.inputDeviceId || 'default';
      const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (
        this.room !== room ||
        !(track instanceof LocalAudioTrack) ||
        track.mediaStreamTrack.readyState !== 'live' ||
        !navigator.mediaDevices?.enumerateDevices
      )
        return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (this.room !== room || (this.inputDeviceId || 'default') !== selected) return;
      if (captureMissesInput(devices, selected, track.getSourceTrackSettings())) {
        try {
          // Mute state survives the restart, and the noise filter restarts on the new input.
          await track.restartTrack(this.captureOptions({ exact: selected }));
        } catch (error) {
          if (this.room !== room) return;
          // The old capture is already closed: leave the microphone off and say why.
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          this.fail(error);
          this.sync();
          return;
        }
        if (this.room !== room) return;
        this.sync();
      }
      this.describeInput(room, devices);
    });
  }
  /** Names the microphone the room hears, so settings can show the device actually in use. */
  private describeInput(room: Room, devices: readonly MediaDeviceInfo[]) {
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (this.room !== room || !(track instanceof LocalAudioTrack)) return;
    try {
      this.patch({ inputDevice: inputDeviceLabel(devices, track.getSourceTrackSettings()) });
    } catch {
      /* The name is a convenience; capture itself is unaffected. */
    }
  }
  private async describeCurrentInput(room: Room) {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      this.describeInput(room, await navigator.mediaDevices.enumerateDevices());
    } catch {
      /* Device names may be unavailable; capture itself is unaffected. */
    }
  }
  private async captureMicrophone(room: Room, serial: number, deviceId?: string) {
    const options = this.captureOptions(deviceId ?? this.inputDeviceId);
    try {
      return await createLocalAudioTrack(options);
    } catch (error) {
      const failure = error as { name?: string; constraint?: string };
      if (
        failure?.name !== 'NotFoundError' &&
        !(
          failure?.name === 'OverconstrainedError' &&
          (!failure.constraint || failure.constraint === 'deviceId')
        )
      )
        throw error;
      if (this.room !== room || serial !== this.microphoneSerial || this.state.deafened)
        throw error;
      if (!(await room.switchActiveDevice('audioinput', 'default'))) throw error;
      if (this.room !== room || serial !== this.microphoneSerial || this.state.deafened)
        throw error;
      const track = await createLocalAudioTrack({ ...options, deviceId: 'default' });
      if (this.room === room && serial === this.microphoneSerial) {
        this.inputDeviceId = undefined;
        this.patch({ inputDeviceFallback: true });
      }
      return track;
    }
  }
  publishMic(deviceId?: string) {
    const serial = this.microphoneSerial;
    return this.microphoneTask(async () => {
      if (serial !== this.microphoneSerial) return;
      if (this.state.deafened) throw new Error('Undeafen before enabling your microphone.');
      const room = this.requireRoom();
      let created: LocalAudioTrack | undefined;
      try {
        const existing = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
        if (
          existing instanceof LocalAudioTrack &&
          existing.mediaStreamTrack.readyState === 'live'
        ) {
          await this.ensureMixer(existing);
          if (this.room !== room || this.state.deafened || serial !== this.microphoneSerial)
            throw new Error('Voice room changed while opening the microphone.');
          await existing.unmute();
        } else {
          if (existing instanceof LocalAudioTrack) {
            await room.localParticipant.unpublishTrack(existing);
            existing.stop();
          }
          if (this.room !== room || serial !== this.microphoneSerial) return;
          created = await this.captureMicrophone(room, serial, deviceId);
          this.pendingMic = created;
          if (this.room !== room || this.state.deafened || serial !== this.microphoneSerial) {
            created.stop();
            return;
          }
          await this.ensureMixer(created);
          if (this.room !== room || this.state.deafened || serial !== this.microphoneSerial)
            throw new Error('Voice room changed while opening the microphone.');
          // Attach processing before publishing: never transmit an initial raw segment.
          await room.localParticipant.publishTrack(created, { source: Track.Source.Microphone });
          if (this.room !== room || this.state.deafened || serial !== this.microphoneSerial) {
            await created.mute();
            throw new Error('Voice room changed while publishing the microphone.');
          }
        }
        this.patch({ error: null });
        this.sync();
        void this.describeCurrentInput(room);
      } catch (error) {
        if (created) {
          created.stop();
          await this.mixer?.destroy();
          this.mixer = null;
          this.mixerTrack = null;
          await this.soundContext?.close();
          this.soundContext = null;
        }
        if (serial !== this.microphoneSerial || this.room !== room) return;
        this.fail(error);
        throw new Error(this.state.error ?? 'Media operation failed.');
      } finally {
        if (this.pendingMic === created) this.pendingMic = null;
      }
    });
  }
  async mute(value: boolean) {
    if (!value) return this.publishMic();
    ++this.microphoneSerial;
    this.pendingMic?.stop();
    void this.pendingMixer?.destroy();
    this.stopSoundboard();
    return this.microphoneTask(async () => {
      try {
        await this.requireRoom().localParticipant.setMicrophoneEnabled(false);
        this.sync();
      } catch (error) {
        this.fail(error);
        throw new Error(this.state.error ?? 'Media operation failed.');
      }
    });
  }
  async publishCamera(enabled: boolean, deviceId?: string) {
    try {
      await this.requireRoom().localParticipant.setCameraEnabled(enabled, {
        deviceId,
        resolution: { width: 1280, height: 720, frameRate: 30 },
      });
      this.sync();
    } catch (error) {
      this.fail(error);
      throw new Error(this.state.error ?? 'Media operation failed.');
    }
  }
  async publishScreen(options: ScreenShareOptions = {}) {
    const room = this.requireRoom();
    const profile = screenProfiles[options.quality ?? '1080p60'];
    try {
      await room.localParticipant.setScreenShareEnabled(
        true,
        {
          audio: options.audio
            ? {
                channelCount: 2,
                noiseSuppression: false,
                autoGainControl: false,
                echoCancellation: false,
                restrictOwnAudio: true,
              }
            : false,
          resolution: {
            width: profile.width,
            height: profile.height,
            frameRate: profile.frameRate,
          },
        },
        {
          videoCodec: 'h264',
          screenShareEncoding: { maxBitrate: profile.bitrate, maxFramerate: profile.frameRate },
          audioPreset: { maxBitrate: 128000 },
          forceStereo: true,
        },
      );
      if (
        options.audio &&
        !room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.track
      ) {
        await this.stopScreen();
        throw new Error('System audio capture is unavailable.');
      }
      const screenTrack = room.localParticipant.getTrackPublication(
        Track.Source.ScreenShare,
      )?.track;
      if (screenTrack)
        screenTrack.mediaStreamTrack.contentHint =
          options.content === 'detail' ? 'detail' : 'motion';
      const capture = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track;
      capture?.mediaStreamTrack.addEventListener(
        'ended',
        () => {
          if (this.room === room)
            void room.localParticipant
              .setScreenShareEnabled(false)
              .then(() => this.sync())
              .catch((error) => this.fail(error));
        },
        { once: true },
      );
      this.sync();
    } catch (error) {
      this.fail(error);
      throw new Error(this.state.error ?? 'Media operation failed.');
    }
  }
  async stopScreen() {
    const room = this.room;
    if (!room) return;
    room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.stop();
    room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.track?.stop();
    this.patch({ sharing: false });
    try {
      await room.localParticipant.setScreenShareEnabled(false);
      this.sync();
    } catch (error) {
      this.fail(error);
      this.patch({ sharing: false });
      throw new Error(
        this.state.error ?? 'Screen publication could not be removed. Capture has stopped.',
      );
    }
  }
  async deafen(value: boolean) {
    const room = this.room;
    if (!room) throw new Error('Join a voice room first.');
    // Deafen mutes playback without changing subscriptions: no audio can leak during resubscription.
    this.patch({ deafened: value });
    this.refreshScreenPlayback();
    if (value) {
      ++this.microphoneSerial;
      this.pendingMic?.stop();
      void this.pendingMixer?.destroy();
      this.stopSoundboard();
      await room.localParticipant.setMicrophoneEnabled(false);
    }
    this.sync();
  }
  private equalizer: MusicEqualizer = FLAT_EQUALIZER;
  private equalizerContext: AudioContext | null = null;
  private equalizerChain: BiquadFilterNode[] = [];
  /** DJ audio tracks currently played through the equalizer instead of their element. */
  private equalized = new Set<string>();
  musicEqualizer() {
    return this.equalizer;
  }
  setMusicEqualizer(value: MusicEqualizer) {
    const eq = parseEqualizer(value);
    if (!eq) throw Error('Equalizer bands must be between -12 and 12 dB.');
    this.equalizer = eq;
    if (this.listenerScope)
      try {
        localStorage.setItem(`rooms-dj-eq-v1:${this.listenerScope}`, JSON.stringify(eq));
      } catch {
        /* The equalizer still applies for this session. */
      }
    this.applyEqualizer();
  }
  /**
   * A flat equalizer leaves the DJ on its ordinary element. Otherwise the DJ track plays through
   * Web Audio filters with its element silenced, still following volume, deafen and output device.
   */
  private applyEqualizer() {
    const room = this.room;
    if (!room) return;
    const flat = isFlat(this.equalizer);
    if (!flat && !this.equalizerContext && typeof AudioContext !== 'undefined') {
      this.equalizerContext = new AudioContext({ sampleRate: 48_000 });
      this.equalizerChain = equalizerNodes(this.equalizerContext);
      void (this.equalizerContext as AudioContext & { setSinkId?(id: string): Promise<void> })
        .setSinkId?.(this.outputDeviceId)
        ?.catch(() => {});
    }
    const context = this.equalizerContext;
    if (!flat && context) tuneEqualizer(this.equalizerChain, this.equalizer, context);
    for (const person of room.remoteParticipants.values()) {
      if (!person.identity.startsWith('rooms-music-')) continue;
      const gain = this.state.deafened
        ? 0
        : listenerGain(person.identity, this.volumes.get(person.identity) ?? 1);
      for (const pub of person.trackPublications.values()) {
        const track = pub.track as
          | (Track & {
              setAudioContext?(context: AudioContext | undefined): void;
              setWebAudioPlugins?(nodes: AudioNode[]): void;
              setVolume?(volume: number): void;
            })
          | undefined;
        const element = this.audio.get(pub.trackSid);
        if (!track?.setAudioContext || !track.setWebAudioPlugins || !element) continue;
        if (flat || !context) {
          if (!this.equalized.delete(pub.trackSid)) continue;
          track.setAudioContext(undefined);
          element.muted = this.state.deafened;
        } else if (!this.equalized.has(pub.trackSid)) {
          element.muted = true;
          track.setWebAudioPlugins(this.equalizerChain);
          track.setAudioContext(context);
          this.equalized.add(pub.trackSid);
          if (context.state !== 'running') void context.resume().catch(() => {});
        }
        track.setVolume?.(gain);
      }
    }
  }
  setParticipantVolume(id: string, volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      throw new Error('Volume must be between 0 and 1.');
    this.volumes.set(id, volume);
    if (this.listenerScope)
      try {
        localStorage.setItem(
          `rooms-listener-levels-v1:${this.listenerScope}`,
          JSON.stringify(Object.fromEntries([...this.volumes].slice(-512))),
        );
      } catch {
        /* Playback remains usable when local storage is unavailable. */
      }
    this.room?.remoteParticipants
      .get(id)
      ?.setVolume(listenerGain(id, volume), Track.Source.Microphone);
    if (id.startsWith('rooms-music-')) this.applyEqualizer();
    this.sync();
  }
  watchScreen(id: string | null) {
    const changed = id !== this.watchedScreen;
    this.watchedScreen = id;
    this.applyScreenSubscriptions();
    this.refreshScreenPlayback();
    if (changed) {
      this.announceWatch();
      this.sync();
    }
  }
  /** Remote screen shares stream only to people who chose to watch them. */
  private applyScreenSubscriptions() {
    for (const person of this.room?.remoteParticipants.values() ?? [])
      for (const pub of person.trackPublications.values()) {
        if (!isScreenSource(pub.source)) continue;
        const wanted = person.identity === this.watchedScreen;
        if (pub.isDesired !== wanted) pub.setSubscribed(wanted);
      }
  }
  /** Tells the room (or one newcomer) which screen this listener watches. */
  private announceWatch(destination?: string) {
    const room = this.room;
    if (!room || this.state.status !== 'connected') return;
    void room.localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify({ watching: this.watchedScreen })), {
        reliable: true,
        topic: WATCH_TOPIC,
        ...(destination ? { destinationIdentities: [destination] } : {}),
      })
      .catch(() => {});
  }
  private refreshScreenPlayback() {
    const allowed = new Set<string>();
    const person = this.watchedScreen
      ? this.room?.remoteParticipants.get(this.watchedScreen)
      : undefined;
    for (const pub of person?.trackPublications.values() ?? [])
      if (pub.source === Track.Source.ScreenShareAudio) allowed.add(pub.trackSid);
    for (const [id, element] of this.audio)
      element.muted =
        this.equalized.has(id) ||
        this.state.deafened ||
        (this.screenAudio.has(id) && !allowed.has(id));
    this.applyEqualizer();
  }
  setScreenVolume(id: string, volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      throw Error('Volume must be between 0 and 1.');
    this.volumes.set(`screen:${id}`, volume);
    if (this.listenerScope) {
      try {
        localStorage.setItem(
          `rooms-listener-levels-v1:${this.listenerScope}`,
          JSON.stringify(Object.fromEntries([...this.volumes].slice(-512))),
        );
      } catch {
        /* Storage is optional. */
      }
    }
    this.room?.remoteParticipants.get(id)?.setVolume(volume, Track.Source.ScreenShareAudio);
    this.sync();
  }
  async startAudio() {
    try {
      await this.requireRoom().startAudio();
      this.patch({ audioBlocked: false });
    } catch (error) {
      this.fail(error);
      throw new Error(this.state.error ?? 'Media operation failed.');
    }
  }
  async deviceSelection(inputId: string, outputId: string) {
    try {
      const room = this.requireRoom();
      if (!(await room.switchActiveDevice('audioinput', inputId || 'default')))
        throw new Error('Input unavailable.');
      if (!(await room.switchActiveDevice('audiooutput', outputId || 'default')))
        throw new Error('Output unavailable.');
      for (const context of [this.soundContext, this.equalizerContext])
        await (
          context as (AudioContext & { setSinkId?(id: string): Promise<void> }) | null
        )?.setSinkId?.(outputId || '');
      this.outputDeviceId = outputId || '';
      this.inputDeviceId = inputId || undefined;
      this.patch({ error: null, inputDeviceFallback: false });
      this.sync();
      void this.describeCurrentInput(room);
    } catch (error) {
      this.fail(error);
      throw new Error(this.state.error ?? 'Media operation failed.');
    }
  }
  participantState() {
    return this.state.participants;
  }
  diagnostics() {
    return this.state.diagnostics;
  }
  async subscribe(id: string) {
    const p = this.requireRoom().getParticipantByIdentity(id);
    if (!p) throw new Error('Participant is not in this room.');
    return new MediaStream(
      [...p.trackPublications.values()].flatMap((pub) =>
        pub.track ? [pub.track.mediaStreamTrack] : [],
      ),
    );
  }
  attachTrack(id: string, element: HTMLMediaElement) {
    const room = this.requireRoom();
    const people = [room.localParticipant, ...room.remoteParticipants.values()];
    const track = people
      .flatMap((p) => [...p.trackPublications.values()])
      .find((pub) => pub.trackSid === id)?.track;
    if (!track) throw new Error('This media track is no longer available.');
    track.attach(element);
    if (track.kind === Track.Kind.Video) {
      element.muted = true;
      element.autoplay = true;
    }
    let removed = false;
    const detach = () => {
      if (removed) return;
      removed = true;
      track.detach(element);
      this.attachments.delete(detach);
    };
    this.attachments.add(detach);
    return detach;
  }
  private async measure() {
    const room = this.room;
    if (!room || this.status !== 'connected') return;
    let bytes = 0,
      lost = 0,
      received = 0,
      rtt: number | null = null;
    let video: MediaDiagnostics['video'];
    const seen = new Set<string>();
    const tracks = [room.localParticipant, ...room.remoteParticipants.values()].flatMap((p) =>
      [...p.trackPublications.values()].flatMap((pub) => (pub.track ? [pub.track] : [])),
    );
    await Promise.allSettled(
      tracks.map(async (track) => {
        const report = await track.getRTCStatsReport();
        report?.forEach((stat) => {
          if (seen.has(stat.id)) return;
          seen.add(stat.id);
          if (
            (stat.type === 'inbound-rtp' || stat.type === 'outbound-rtp') &&
            stat.frameWidth > 0 &&
            stat.frameHeight > 0 &&
            (!video || stat.frameWidth * stat.frameHeight > video.width * video.height)
          ) {
            const codec = report?.get(stat.codecId);
            video = {
              width: stat.frameWidth,
              height: stat.frameHeight,
              framesPerSecond:
                typeof stat.framesPerSecond === 'number' ? stat.framesPerSecond : null,
              codec: codec?.mimeType ?? null,
              direction: stat.type === 'outbound-rtp' ? 'sent' : 'received',
            };
          }
          if (stat.type === 'inbound-rtp') {
            bytes += stat.bytesReceived ?? 0;
            received += stat.packetsReceived ?? 0;
            lost += Math.max(0, stat.packetsLost ?? 0);
          }
          if (
            stat.type === 'candidate-pair' &&
            stat.state === 'succeeded' &&
            stat.nominated &&
            typeof stat.currentRoundTripTime === 'number'
          )
            rtt = stat.currentRoundTripTime * 1000;
        });
      }),
    );
    if (this.room !== room) return;
    const time = performance.now();
    const prior = this.priorStats;
    this.priorStats = { time, bytes };
    this.patch({
      diagnostics: {
        bitrate:
          prior && bytes >= prior.bytes
            ? ((bytes - prior.bytes) * 8000) / (time - prior.time)
            : null,
        packetLoss: received + lost ? lost / (received + lost) : null,
        rtt,
        video,
      },
    });
  }
  private cleanupPlayback() {
    this.watchedScreen = null;
    this.watchers.clear();
    this.screenAudio.clear();
    this.speakingMeter.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.attachments.forEach((detach) => detach());
    this.audio.forEach((e) => {
      e.pause();
      e.srcObject = null;
      e.remove();
    });
    this.audio.clear();
    this.equalized.clear();
    this.priorStats = null;
  }
  disconnect(): Promise<void> {
    if (this.disconnecting) return this.disconnecting;
    ++this.epoch;
    ++this.microphoneSerial;
    const room = this.room;
    this.room = null;
    this.grant = null;
    this.pendingMic?.stop();
    this.mixerTrack?.stop();
    void this.pendingMixer?.destroy();
    void this.mixer?.destroy();
    this.stopSoundboard();
    // Stop capture and playback synchronously; network/mixer cleanup must not hold them open.
    for (const publication of room?.localParticipant.trackPublications.values() ?? [])
      publication.track?.stop();
    this.cleanupPlayback();
    this.patch({
      noiseProcessing: { status: 'off', mode: this.noiseMode },
      status: 'not-configured',
      roomId: null,
      error: null,
      muted: true,
      deafened: false,
      camera: false,
      sharing: false,
      audioBlocked: false,
      inputDeviceFallback: false,
      inputDevice: null,
      participants: [],
      tracks: [],
      diagnostics: emptyDiagnostics(),
    });
    const transport = room
      ? room.disconnect(true).finally(() => room.removeAllListeners())
      : Promise.resolve();
    const cleanup = (async () => {
      await this.soundboardWork;
      await this.microphoneWork;
      await this.mixer?.destroy();
      this.mixer = null;
      this.mixerTrack = null;
      await this.soundContext?.close();
      this.soundContext = null;
    })();
    this.disconnecting = Promise.allSettled([transport, cleanup])
      .then((results) => {
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      })
      .finally(() => {
        this.disconnecting = null;
      });
    return this.disconnecting;
  }
  async reconnect() {
    throw new Error(
      'Obtain a fresh membership grant, then call connectRoom. Automatic transient reconnect is managed by LiveKit.',
    );
  }
}
export const liveKitMediaProvider = new LiveKitMediaProvider();
export const mediaTransportStatus: ConnectionStatus = 'not-configured';

export { createRnnoiseNode } from './rnnoise';

export { createNoiseSuppressionNode } from './noise-suppression';
export type { NoiseSuppressionMode, NoiseProcessingState } from './noise-suppression';
