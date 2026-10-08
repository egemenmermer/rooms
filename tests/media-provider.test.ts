// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ConnectionState, RoomEvent, type Room } from 'livekit-client';
import { LiveKitMediaProvider } from '../packages/media-providers/src/index';

function fixture() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const emit = (event: string, ...args: unknown[]) => listeners.get(event)?.forEach(cb => cb(...args));
  const local = { identity: 'alice', name: 'Alice', isMicrophoneEnabled: false, isCameraEnabled: false, isScreenShareEnabled: false, isSpeaking: false, connectionQuality: 'excellent', trackPublications: new Map(), getTrackPublication: vi.fn(), setMicrophoneEnabled: vi.fn(async (enabled: boolean) => { local.isMicrophoneEnabled = enabled; }), setCameraEnabled: vi.fn(), setScreenShareEnabled: vi.fn(async (enabled: boolean) => { local.isScreenShareEnabled = enabled; }) };
  const room = { localParticipant: local, remoteParticipants: new Map(), on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { listeners.set(event, [...(listeners.get(event) ?? []), cb]); }), connect: vi.fn(async () => { emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected); }), disconnect: vi.fn(async () => { emit(RoomEvent.Disconnected); }), removeAllListeners: vi.fn(), switchActiveDevice: vi.fn(async () => true), startAudio: vi.fn(async () => {}) };
  const provider = new LiveKitMediaProvider(() => room as unknown as Room);
  return { provider, room, local, emit };
}
describe('LiveKit adapter lifecycle', () => {
  it('requires TLS for remote media and rejects credential-bearing URLs before constructing a room', async () => {
    const factory = vi.fn(); const provider = new LiveKitMediaProvider(factory);
    await expect(provider.connectRoom('room', 'ephemeral', 'ws://example.com')).rejects.toThrow('TLS');
    await expect(provider.connectRoom('room', 'ephemeral', 'wss://example.com/?token=secret')).rejects.toThrow('plain');
    expect(factory).not.toHaveBeenCalled();
  });
  it('uses the granted URL/token, publishes only on explicit action, and resets tracks on leave', async () => {
    const { provider, room, local } = fixture();
    await provider.connectRoom('voice-1', 'ephemeral', 'ws://127.0.0.1:7880');
    expect(room.connect).toHaveBeenCalledWith('ws://127.0.0.1:7880/', 'ephemeral', { autoSubscribe: true });
    expect(local.setMicrophoneEnabled).not.toHaveBeenCalled();
    await provider.publishMic('mic-1'); expect(provider.snapshot().muted).toBe(false);
    await provider.mute(true); expect(provider.snapshot().muted).toBe(true);
    await provider.disconnect(); expect(room.disconnect).toHaveBeenCalledWith(true);
    expect(provider.snapshot()).toMatchObject({ status: 'not-configured', roomId: null, tracks: [], participants: [] });
  });
  it('deafen mutes the actual microphone and does not unmute it when hearing resumes', async () => {
    const { provider, local } = fixture(); await provider.connectRoom('room', 'ephemeral', 'ws://localhost:7880');
    await provider.publishMic(); await provider.deafen(true); expect(local.isMicrophoneEnabled).toBe(false);
    await provider.deafen(false); expect(local.isMicrophoneEnabled).toBe(false); expect(provider.snapshot().deafened).toBe(false);
    await provider.disconnect();
  });
  it('deafen silences remote playback including a later subscription', async () => {
    const { provider, room, emit } = fixture(); await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    const element = document.createElement('audio'); element.play = vi.fn(async () => {}); element.pause = vi.fn();
    const participant = { setVolume: vi.fn(), identity: 'bob' };
    const track = { kind: 'audio', attach: () => element };
    await provider.deafen(true); emit(RoomEvent.TrackSubscribed, track, { trackSid: 'TR_audio' }, participant);
    expect(element.muted).toBe(true); await provider.deafen(false); expect(element.muted).toBe(false);
    await provider.deafen(true); await expect(provider.mute(false)).rejects.toThrow('Undeafen');
    await provider.disconnect(); expect(document.body.contains(element)).toBe(false); expect(element.pause).toHaveBeenCalled();
  });
  it('records denial without false capture success', async () => {
    const { provider, local } = fixture(); await provider.connectRoom('room', 'ephemeral', 'ws://localhost:7880');
    local.setScreenShareEnabled.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await expect(provider.publishScreen()).rejects.toThrow();
    expect(provider.snapshot()).toMatchObject({ sharing: false }); expect(provider.snapshot().error).toContain('permission denied');
    await provider.disconnect();
  });
  it('connection failure never reports connected or exposes token/error URL', async () => {
    const { provider, room } = fixture(); room.connect.mockRejectedValueOnce(new Error('JWT TOP_SECRET at ws://server'));
    await expect(provider.connectRoom('room', 'TOP_SECRET', 'ws://localhost:7880')).rejects.toThrow('Unable');
    expect(provider.status).toBe('error'); expect(JSON.stringify(provider.snapshot())).not.toContain('TOP_SECRET');
    await provider.disconnect();
  });
  it('rejects a second known presenter before requesting capture', async () => {
    const { provider, room, local } = fixture(); await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    room.remoteParticipants.set('bob', { isScreenShareEnabled: true });
    await expect(provider.publishScreen()).rejects.toThrow('Another participant'); expect(local.setScreenShareEnabled).not.toHaveBeenCalled();
    await provider.disconnect();
  });
  it('stops screen capture immediately even when reconnecting and unpublication fails', async () => {
    const { provider, local, emit } = fixture(); await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    const stop = vi.fn(); local.getTrackPublication.mockReturnValue({ track: { stop } });
    local.setScreenShareEnabled.mockRejectedValueOnce(new Error('Network unavailable'));
    emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting);
    await expect(provider.stopScreen()).rejects.toThrow('Media operation'); expect(stop).toHaveBeenCalled(); expect(provider.snapshot().sharing).toBe(false);
    await provider.disconnect();
  });
  it('tracks reconnect state without reacquiring microphone or screen', async () => {
    const { provider, emit, local } = fixture(); await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting); expect(provider.status).toBe('reconnecting');
    expect(local.setMicrophoneEnabled).not.toHaveBeenCalled(); emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected); expect(provider.status).toBe('connected');
    await provider.disconnect();
  });
});
