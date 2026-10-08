import { ConnectionState, Room, RoomEvent, Track, type Participant } from 'livekit-client';
import type { ConnectionStatus } from '@rooms/contracts';

export interface MediaParticipant {
  id: string; name: string; local: boolean; muted: boolean; speaking: boolean;
  camera: boolean; screen: boolean; volume: number; quality: string;
}
export interface MediaTrack { id: string; participantId: string; source: string; kind: string; local: boolean; muted: boolean }
export interface MediaDiagnostics { bitrate: number | null; packetLoss: number | null; rtt: number | null }
export interface MediaSnapshot {
  status: ConnectionStatus; roomId: string | null; error: string | null; muted: boolean;
  deafened: boolean; camera: boolean; sharing: boolean; audioBlocked: boolean;
  participants: MediaParticipant[]; tracks: MediaTrack[]; diagnostics: MediaDiagnostics;
}
export interface MediaGrant { roomId: string; url: string; token: string }
export interface RealtimeMediaProvider {
  readonly status: ConnectionStatus;
  connectRoom(roomId: string, shortLivedMembershipToken: string, serverUrl: string): Promise<void>;
  publishMic(deviceId?: string): Promise<void>;
  publishCamera(enabled: boolean, deviceId?: string): Promise<void>;
  publishScreen(): Promise<void>; stopScreen(): Promise<void>;
  subscribe(participantId: string): Promise<MediaStream>;
  attachTrack(trackId: string, element: HTMLMediaElement): () => void;
  deviceSelection(inputId: string, outputId: string): Promise<void>;
  participantState(): MediaParticipant[]; diagnostics(): MediaDiagnostics;
  snapshot(): MediaSnapshot; subscribeState(listener: () => void): () => void;
  mute(value: boolean): Promise<void>; deafen(value: boolean): Promise<void>;
  setParticipantVolume(participantId: string, volume: number): void;
  startAudio(): Promise<void>; disconnect(): Promise<void>; reconnect(): Promise<void>;
}
const emptyDiagnostics = (): MediaDiagnostics => ({ bitrate: null, packetLoss: null, rtt: null });
/** No auth credentials other than the in-memory, short-lived room token enter this adapter. */
export class LiveKitMediaProvider implements RealtimeMediaProvider {
  private room: Room | null = null;
  private grant: MediaGrant | null = null;
  private listeners = new Set<() => void>();
  private audio = new Map<string, HTMLMediaElement>();
  private volumes = new Map<string, number>();
  private attachments = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private state: MediaSnapshot = { status: 'not-configured', roomId: null, error: null, muted: true, deafened: false, camera: false, sharing: false, audioBlocked: false, participants: [], tracks: [], diagnostics: emptyDiagnostics() };
  private epoch = 0;
  private priorStats: { time: number; bytes: number } | null = null;
  constructor(private readonly createRoom: () => Room = () => new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })) {}
  get status() { return this.state.status; }
  snapshot = () => this.state;
  subscribeState = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(patch: Partial<MediaSnapshot>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private requireRoom() { if (!this.room || this.status !== 'connected') throw new Error('Join a connected voice room first.'); return this.room; }
  private fail(error: unknown) {
    // SDK exceptions may contain signaling URLs/JWTs: expose only an actionable category.
    const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
    this.patch({ error: name === 'NotAllowedError' ? 'Device or screen permission denied. Allow access in system settings and retry.' : name === 'NotFoundError' ? 'The selected media device is unavailable. Select another device.' : 'Media operation failed. Check permissions, devices, and the media server connection.' });
  }
  private sync() {
    const room = this.room; if (!room) return;
    const people: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    this.patch({
      muted: !room.localParticipant.isMicrophoneEnabled, camera: room.localParticipant.isCameraEnabled, sharing: room.localParticipant.isScreenShareEnabled,
      participants: people.filter(p => p.identity).map(p => ({ id: p.identity, name: p.name || p.identity, local: p === room.localParticipant, muted: !p.isMicrophoneEnabled, speaking: p.isSpeaking, camera: p.isCameraEnabled, screen: p.isScreenShareEnabled, volume: this.volumes.get(p.identity) ?? 1, quality: p.connectionQuality })),
      tracks: people.flatMap(p => [...p.trackPublications.values()].filter(pub => !!pub.track).map(pub => ({ id: pub.trackSid, participantId: p.identity, source: pub.source, kind: pub.kind, local: p === room.localParticipant, muted: pub.isMuted }))),
    });
  }
  async connectRoom(roomId: string, token: string, serverUrl: string) {
    const parsed = new URL(serverUrl);
    if (!['wss:', 'ws:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('A plain ws/wss media server URL is required.');
    if (parsed.protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Remote media servers require TLS.');
    if (!roomId || !token) throw new Error('A room membership grant is required.');
    await this.disconnect();
    const epoch = ++this.epoch;
    this.grant = { roomId, token, url: parsed.href }; const room = this.createRoom(); this.room = room;
    this.patch({ status: 'connecting', roomId, error: null });
    const sync = () => { if (this.room === room) this.sync(); };
    for (const event of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged, RoomEvent.ConnectionQualityChanged, RoomEvent.ParticipantNameChanged, RoomEvent.MediaDevicesChanged, RoomEvent.ActiveDeviceChanged]) room.on(event, sync);
    room.on(RoomEvent.ConnectionStateChanged, value => {
      if (this.room !== room) return;
      const status: ConnectionStatus = value === ConnectionState.Connected ? 'connected' : value === ConnectionState.Connecting ? 'connecting' : value === ConnectionState.Reconnecting || value === ConnectionState.SignalReconnecting ? 'reconnecting' : 'error';
      this.patch({ status }); sync();
    });
    room.on(RoomEvent.Disconnected, () => { if (this.room === room) { this.cleanupPlayback(); this.patch({ status: 'error', muted: true, sharing: false, camera: false, tracks: [], participants: [], error: 'Voice disconnected. Rejoin to obtain a fresh membership grant.' }); } });
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio && typeof document !== 'undefined') {
        const element = track.attach(); element.hidden = true; document.body.append(element); this.audio.set(publication.trackSid, element);
        element.muted = this.state.deafened; participant.setVolume(this.volumes.get(participant.identity) ?? 1);
        void element.play().catch(() => this.patch({ audioBlocked: true }));
      }
      sync();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, publication) => { const element = this.audio.get(publication.trackSid); if (element) { track.detach(element); element.remove(); } this.audio.delete(publication.trackSid); sync(); });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => this.patch({ audioBlocked: !room.canPlaybackAudio }));
    room.on(RoomEvent.MediaDevicesError, error => this.fail(error));
    try {
      await room.connect(parsed.href, token, { autoSubscribe: true });
      if (epoch !== this.epoch) { await room.disconnect(true); return; }
      this.patch({ status: 'connected' }); sync();
      this.timer = setInterval(() => { void this.measure(); }, 5000);
    } catch (error) {
      if (epoch === this.epoch) { this.fail(error); this.patch({ status: 'error' }); await room.disconnect(true); this.cleanupPlayback(); }
      throw new Error('Unable to connect to the media server. Check the server URL and room membership.');
    }
  }
  async publishMic(deviceId?: string) { if (this.state.deafened) throw new Error('Undeafen before enabling your microphone.'); try { await this.requireRoom().localParticipant.setMicrophoneEnabled(true, { deviceId, echoCancellation: true, noiseSuppression: true }); this.patch({ error: null }); this.sync(); } catch (error) { this.fail(error); throw new Error(this.state.error ?? 'Media operation failed.'); } }
  async mute(value: boolean) { if (!value && this.state.deafened) throw new Error('Undeafen before enabling your microphone.'); try { await this.requireRoom().localParticipant.setMicrophoneEnabled(!value); this.sync(); } catch (error) { this.fail(error); throw new Error(this.state.error ?? 'Media operation failed.'); } }
  async publishCamera(enabled: boolean, deviceId?: string) { try { await this.requireRoom().localParticipant.setCameraEnabled(enabled, { deviceId, resolution: { width: 640, height: 360, frameRate: 24 } }); this.sync(); } catch (error) { this.fail(error); throw new Error(this.state.error ?? 'Media operation failed.'); } }
  async publishScreen() {
    const room = this.requireRoom();
    if ([...room.remoteParticipants.values()].some(p => p.isScreenShareEnabled)) throw new Error('Another participant is presenting. Ask them to stop before presenting.');
    try { await room.localParticipant.setScreenShareEnabled(true, { audio: false, resolution: { width: 1280, height: 720, frameRate: 30 } }, { screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 30 } }); const capture = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track; capture?.mediaStreamTrack.addEventListener('ended', () => { if (this.room === room) void room.localParticipant.setScreenShareEnabled(false).then(() => this.sync()).catch(error => this.fail(error)); }, { once: true }); this.sync(); } catch (error) { this.fail(error); throw new Error(this.state.error ?? 'Media operation failed.'); }
  }
  async stopScreen() { const room = this.room; if (!room) return; room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.stop(); room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.track?.stop(); this.patch({ sharing: false }); try { await room.localParticipant.setScreenShareEnabled(false); this.sync(); } catch (error) { this.fail(error); this.patch({ sharing: false }); throw new Error(this.state.error ?? 'Screen publication could not be removed. Capture has stopped.'); } }
  async deafen(value: boolean) {
    const room = this.room; if (!room) throw new Error('Join a voice room first.');
    // Deafen mutes playback without changing subscriptions: no audio can leak during resubscription.
    this.patch({ deafened: value }); this.audio.forEach(e => { e.muted = value; });
    if (value) await room.localParticipant.setMicrophoneEnabled(false);
    this.sync();
  }
  setParticipantVolume(id: string, volume: number) { if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Volume must be between 0 and 1.'); this.volumes.set(id, volume); this.room?.remoteParticipants.get(id)?.setVolume(volume); this.sync(); }
  async startAudio() { try { await this.requireRoom().startAudio(); this.patch({ audioBlocked: false }); } catch (error) { this.fail(error); throw new Error(this.state.error ?? 'Media operation failed.'); } }
  async deviceSelection(inputId: string, outputId: string) { try { const room = this.requireRoom(); if (inputId && !await room.switchActiveDevice('audioinput', inputId)) throw new Error('Input unavailable.'); if (outputId && !await room.switchActiveDevice('audiooutput', outputId)) throw new Error('Output unavailable.'); this.sync(); } catch (error) { this.fail(error); throw new Error(this.state.error ?? 'Media operation failed.'); } }
  participantState() { return this.state.participants; }
  diagnostics() { return this.state.diagnostics; }
  async subscribe(id: string) { const p = this.requireRoom().getParticipantByIdentity(id); if (!p) throw new Error('Participant is not in this room.'); return new MediaStream([...p.trackPublications.values()].flatMap(pub => pub.track ? [pub.track.mediaStreamTrack] : [])); }
  attachTrack(id: string, element: HTMLMediaElement) {
    const room = this.requireRoom(); const people = [room.localParticipant, ...room.remoteParticipants.values()];
    const track = people.flatMap(p => [...p.trackPublications.values()]).find(pub => pub.trackSid === id)?.track;
    if (!track) throw new Error('This media track is no longer available.');
    track.attach(element); if (track.kind === Track.Kind.Video) { element.muted = true; element.autoplay = true; }
    let removed = false; const detach = () => { if (removed) return; removed = true; track.detach(element); this.attachments.delete(detach); }; this.attachments.add(detach); return detach;
  }
  private async measure() {
    const room = this.room; if (!room || this.status !== 'connected') return;
    let bytes = 0, lost = 0, received = 0, rtt: number | null = null; const seen = new Set<string>();
    const tracks = [room.localParticipant, ...room.remoteParticipants.values()].flatMap(p => [...p.trackPublications.values()].flatMap(pub => pub.track ? [pub.track] : []));
    await Promise.allSettled(tracks.map(async track => { const report = await track.getRTCStatsReport(); report?.forEach(stat => { if (seen.has(stat.id)) return; seen.add(stat.id); if (stat.type === 'inbound-rtp') { bytes += stat.bytesReceived ?? 0; received += stat.packetsReceived ?? 0; lost += Math.max(0, stat.packetsLost ?? 0); } if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated && typeof stat.currentRoundTripTime === 'number') rtt = stat.currentRoundTripTime * 1000; }); }));
    if (this.room !== room) return;
    const time = performance.now(); const prior = this.priorStats; this.priorStats = { time, bytes };
    this.patch({ diagnostics: { bitrate: prior && bytes >= prior.bytes ? (bytes - prior.bytes) * 8000 / (time - prior.time) : null, packetLoss: received + lost ? lost / (received + lost) : null, rtt } });
  }
  private cleanupPlayback() { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.attachments.forEach(detach => detach()); this.audio.forEach(e => { e.pause(); e.srcObject = null; e.remove(); }); this.audio.clear(); this.priorStats = null; }
  async disconnect() { ++this.epoch; const room = this.room; this.room = null; this.grant = null; this.cleanupPlayback(); if (room) { await room.disconnect(true); room.removeAllListeners(); } this.patch({ status: 'not-configured', roomId: null, error: null, muted: true, deafened: false, camera: false, sharing: false, audioBlocked: false, participants: [], tracks: [], diagnostics: emptyDiagnostics() }); }
  async reconnect() { throw new Error('Obtain a fresh membership grant, then call connectRoom. Automatic transient reconnect is managed by LiveKit.'); }
}
export const liveKitMediaProvider = new LiveKitMediaProvider();
export const mediaTransportStatus: ConnectionStatus = 'not-configured';
