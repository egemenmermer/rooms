// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectionState,
  LocalAudioTrack,
  RoomEvent,
  createLocalAudioTrack,
  type Room,
} from 'livekit-client';
import { LiveKitMediaProvider } from '../packages/media-providers/src/index';
import {
  captureMissesInput,
  inputDeviceLabel,
  selectedInputLabel,
  type InputDeviceEntry,
} from '../packages/media-providers/src/input-device';

// Capture and the DSP graph are isolated; only the device choice is under test.
vi.mock('livekit-client', async (original) => ({
  ...(await original<typeof import('livekit-client')>()),
  createLocalAudioTrack: vi.fn(),
}));
vi.mock('../packages/media-providers/src/soundboard', () => ({
  SoundboardMixer: vi.fn(
    class {
      processedTrack = { readyState: 'live' };
      setNoiseSuppression = vi.fn(async () => {});
      setInputLevel = vi.fn();
      destroy = vi.fn(async () => {});
      stop = vi.fn();
      play = vi.fn(async () => {});
    },
  ),
}));

const input = (deviceId: string, groupId: string, label: string): InputDeviceEntry => ({
  kind: 'audioinput',
  deviceId,
  groupId,
  label,
});
const laptop = input('laptop-mic', 'g-laptop', 'Mikrofon Dizisi (Realtek)');
const headset = input('hyperx-mic', 'g-hyperx', 'Mikrofon (HyperX Cloud Alpha Wireless)');
const headsetSpeaker: InputDeviceEntry = {
  kind: 'audiooutput',
  deviceId: 'hyperx-out',
  groupId: 'g-hyperx',
  label: 'Hoparlör (HyperX Cloud Alpha Wireless)',
};

describe('microphone device helpers', () => {
  it('notices when the OS points the default at another microphone', () => {
    const devices = [input('default', 'g-hyperx', 'Varsayılan - HyperX'), laptop, headset];
    expect(
      captureMissesInput(devices, 'default', { deviceId: 'default', groupId: 'g-laptop' }),
    ).toBe(true);
    expect(
      captureMissesInput(devices, 'default', { deviceId: 'default', groupId: 'g-hyperx' }),
    ).toBe(false);
    // Without groups (or without the entry) nothing is guessed.
    expect(captureMissesInput(devices, 'default', { deviceId: 'default' })).toBe(false);
    expect(captureMissesInput(devices, 'communications', { groupId: 'g-laptop' })).toBe(false);
  });

  it('notices a chosen headset that is back while the capture runs elsewhere', () => {
    const devices = [input('default', 'g-laptop', 'Varsayılan - Realtek'), laptop, headset];
    expect(captureMissesInput(devices, 'hyperx-mic', { groupId: 'g-laptop' })).toBe(true);
    expect(captureMissesInput(devices, 'hyperx-mic', { groupId: 'g-hyperx' })).toBe(false);
    // Still unplugged: the fallback stays.
    expect(captureMissesInput([laptop], 'hyperx-mic', { groupId: 'g-laptop' })).toBe(false);
  });

  it('names the physical microphone behind a capture, not the stand-in or a speaker', () => {
    const devices = [
      input('default', 'g-hyperx', 'Varsayılan - HyperX'),
      headsetSpeaker,
      laptop,
      headset,
    ];
    expect(inputDeviceLabel(devices, { deviceId: 'default', groupId: 'g-hyperx' })).toBe(
      headset.label,
    );
    expect(inputDeviceLabel(devices, { deviceId: 'laptop-mic', groupId: 'g-laptop' })).toBe(
      laptop.label,
    );
    expect(inputDeviceLabel(devices, { deviceId: 'default' })).toBeNull();
    expect(inputDeviceLabel([], { deviceId: 'default', groupId: 'g-hyperx' })).toBeNull();
  });
});

function capture(groupId: string) {
  const source = { deviceId: 'default', groupId };
  const processed = { readyState: 'live', stop: vi.fn(), addEventListener: vi.fn() };
  const track = Object.assign(Object.create(LocalAudioTrack.prototype), {
    stop: vi.fn(),
    setAudioContext: vi.fn(),
    setProcessor: vi.fn(async () => {}),
    applyConstraints: vi.fn(async () => {}),
    mute: vi.fn(async () => {}),
    unmute: vi.fn(async () => {}),
    getSourceTrackSettings: vi.fn(() => ({ ...source })),
    restartTrack: vi.fn(async () => {}),
  });
  Object.defineProperty(track, 'mediaStreamTrack', { value: processed, configurable: true });
  return { track: track as LocalAudioTrack, source };
}

function fixture(devices: { current: InputDeviceEntry[] }) {
  vi.stubGlobal(
    'AudioContext',
    class {
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
    },
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn(async () => devices.current) },
  });
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const emit = (event: string, ...args: unknown[]) =>
    listeners.get(event)?.forEach((cb) => cb(...args));
  const local = {
    identity: 'onur',
    name: 'Onur',
    isMicrophoneEnabled: false,
    isCameraEnabled: false,
    isScreenShareEnabled: false,
    isSpeaking: false,
    connectionQuality: 'excellent',
    trackPublications: new Map(),
    getTrackPublication: vi.fn(),
    setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
      local.isMicrophoneEnabled = enabled;
    }),
    publishData: vi.fn(async () => {}),
    publishTrack: vi.fn(async (track: LocalAudioTrack) => {
      local.isMicrophoneEnabled = true;
      local.getTrackPublication.mockReturnValue({ track });
      local.trackPublications.set('mic', { track });
    }),
  };
  const room = {
    localParticipant: local,
    remoteParticipants: new Map(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
    }),
    connect: vi.fn(async () => emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected)),
    disconnect: vi.fn(async () => {}),
    removeAllListeners: vi.fn(),
    switchActiveDevice: vi.fn(async () => true),
  };
  const provider = new LiveKitMediaProvider(() => room as unknown as Room);
  return { provider, room, local, emit };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('a call on the system default microphone', () => {
  it('moves to the headset the OS made default during the call and names it', async () => {
    const devices = {
      current: [input('default', 'g-laptop', 'Varsayılan - Realtek'), laptop],
    };
    const { provider, local, emit } = fixture(devices);
    const { track, source } = capture('g-laptop');
    vi.mocked(createLocalAudioTrack).mockReset().mockResolvedValueOnce(track);
    await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    await provider.publishMic();
    await vi.waitFor(() => expect(provider.snapshot().inputDevice).toBe(laptop.label));

    // The wireless headset turns on; Windows makes it the default input.
    devices.current = [input('default', 'g-hyperx', 'Varsayılan - HyperX'), laptop, headset];
    vi.mocked(track.restartTrack).mockImplementationOnce(async () => {
      source.groupId = 'g-hyperx';
    });
    emit(RoomEvent.MediaDevicesChanged);
    await vi.waitFor(() => expect(provider.snapshot().inputDevice).toBe(headset.label));
    expect(track.restartTrack).toHaveBeenCalledTimes(1);
    expect(track.restartTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: { exact: 'default' },
        echoCancellation: true,
        noiseSuppression: false,
        // Strong filtering is the default and runs without the browser's gain control.
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 48000,
      }),
    );
    // Following the device never changes whether the person is heard.
    expect(local.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(track.unmute).not.toHaveBeenCalled();
    expect(provider.snapshot().muted).toBe(false);

    // Another device event with the same default does not reopen the microphone.
    emit(RoomEvent.MediaDevicesChanged);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await vi.waitFor(() => expect(track.getSourceTrackSettings).toHaveBeenCalled());
    expect(track.restartTrack).toHaveBeenCalledTimes(1);
    await provider.disconnect();
    expect(provider.snapshot().inputDevice).toBeNull();
  });

  it('keeps a microphone the person chose even when the default changes', async () => {
    const devices = { current: [input('default', 'g-laptop', 'Varsayılan - Realtek'), laptop] };
    const { provider, emit } = fixture(devices);
    const { track } = capture('g-laptop');
    vi.mocked(createLocalAudioTrack).mockReset().mockResolvedValueOnce(track);
    await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    await provider.deviceSelection('laptop-mic', '');
    await provider.publishMic();
    devices.current = [input('default', 'g-hyperx', 'Varsayılan - HyperX'), laptop, headset];
    emit(RoomEvent.MediaDevicesChanged);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(track.restartTrack).not.toHaveBeenCalled();
    await provider.disconnect();
  });

  it('turns the microphone off with a reason when the new default cannot open', async () => {
    const devices = { current: [input('default', 'g-laptop', 'Varsayılan - Realtek'), laptop] };
    const { provider, local, emit } = fixture(devices);
    const { track } = capture('g-laptop');
    vi.mocked(createLocalAudioTrack).mockReset().mockResolvedValueOnce(track);
    await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    await provider.publishMic();
    devices.current = [input('default', 'g-hyperx', 'Varsayılan - HyperX'), laptop, headset];
    vi.mocked(track.restartTrack).mockRejectedValueOnce(
      new DOMException('Device in use', 'NotReadableError'),
    );
    emit(RoomEvent.MediaDevicesChanged);
    await vi.waitFor(() => expect(local.setMicrophoneEnabled).toHaveBeenCalledWith(false));
    await vi.waitFor(() => expect(provider.snapshot().error).toContain('Cihaz açılamadı'));
    expect(provider.snapshot().muted).toBe(true);
    await provider.disconnect();
  });
});

describe('a call on a microphone the person chose', () => {
  it('returns to the chosen headset when it comes back after an unplug', async () => {
    const devices = {
      current: [input('default', 'g-hyperx', 'Varsayılan - HyperX'), laptop, headset],
    };
    const { provider, local, emit } = fixture(devices);
    const { track, source } = capture('g-hyperx');
    vi.mocked(createLocalAudioTrack).mockReset().mockResolvedValueOnce(track);
    await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    await provider.deviceSelection('hyperx-mic', '');
    await provider.publishMic();
    // The headset drops out; the SDK reopens the system default (the laptop) on its own.
    source.groupId = 'g-laptop';
    devices.current = [input('default', 'g-laptop', 'Varsayılan - Realtek'), laptop];
    emit(RoomEvent.MediaDevicesChanged);
    await vi.waitFor(() => expect(provider.snapshot().inputDevice).toBe(laptop.label));
    expect(track.restartTrack).not.toHaveBeenCalled();
    // It is back: the room hears the headset again, still unmuted.
    devices.current = [input('default', 'g-laptop', 'Varsayılan - Realtek'), laptop, headset];
    vi.mocked(track.restartTrack).mockImplementationOnce(async () => {
      source.groupId = 'g-hyperx';
    });
    emit(RoomEvent.MediaDevicesChanged);
    await vi.waitFor(() => expect(provider.snapshot().inputDevice).toBe(headset.label));
    expect(track.restartTrack).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: { exact: 'hyperx-mic' } }),
    );
    expect(local.setMicrophoneEnabled).not.toHaveBeenCalled();
    await provider.disconnect();
  });
});

describe('naming the selected microphone before capture', () => {
  const headset = input('headset-mic', 'g-headset', 'HyperX Cloud II');
  const system = { ...input('default', 'g-headset', 'Varsayılan - HyperX Cloud II') };
  it('names a chosen device and resolves the system default to its physical device', () => {
    expect(selectedInputLabel([laptop, headset, system], 'laptop-mic')).toBe(laptop.label);
    expect(selectedInputLabel([laptop, headset, system], '')).toBe('HyperX Cloud II');
    expect(selectedInputLabel([laptop, headset, system], 'default')).toBe('HyperX Cloud II');
  });
  it('says nothing when the list cannot tell', () => {
    expect(selectedInputLabel([laptop], 'gone')).toBeNull();
    expect(selectedInputLabel([{ ...laptop, label: '' }], 'laptop-mic')).toBeNull();
  });
});
