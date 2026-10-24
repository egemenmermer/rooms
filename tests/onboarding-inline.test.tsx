// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionPane } from '../apps/desktop/src/ConnectionPane';
import {
  ReferenceOnboarding,
  platformName,
  type ReferenceOnboardingMode,
} from '../apps/desktop/src/ReferenceOnboarding';
import { useCommunity } from '../apps/desktop/src/community';
import { useRooms } from '../apps/desktop/src/store';

const previousCommunity = useCommunity.getState(),
  previousPreferences = useRooms.getState().preferences;
const user = {
  id: 'u1',
  username: 'ada',
  displayName: 'Ada',
  avatar: null,
} as unknown as NonNullable<ReturnType<typeof useCommunity.getState>['user']>;

const bridge = (extra: Record<string, unknown> = {}, platform?: string) => {
  const social = {
    signupAvailable: vi.fn(async () => true),
    avatar: vi.fn(async () => null),
    ...extra,
  };
  const media = {
    captureStatus: vi.fn(async () => ({
      microphone: 'not-determined',
      camera: 'not-determined',
      screen: 'not-determined',
      systemAudio: false,
    })),
  };
  (window as any).rooms = { social, media, ...(platform ? { platform } : {}) };
  return { social, media };
};
const onboarding = (mode: ReferenceOnboardingMode, onNavigate = vi.fn()) =>
  render(
    <MemoryRouter>
      <ReferenceOnboarding mode={mode} onNavigate={onNavigate} onComplete={() => {}} />
    </MemoryRouter>,
  );

// Minimal Web Audio + getUserMedia fakes; the analyser reports a steady loud signal.
let frames: FrameRequestCallback[] = [];
let clock = 0;
const flushFrames = () =>
  act(() => {
    const due = frames;
    frames = [];
    clock += 200;
    due.forEach((cb) => cb(clock));
  });
function fakeMedia(getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const close = vi.fn(async () => {});
  class FakeAudioContext {
    close = close;
    createAnalyser() {
      return {
        fftSize: 0,
        frequencyBinCount: 4,
        getByteFrequencyData(values: Uint8Array) {
          values.fill(40);
        },
      };
    }
    createMediaStreamSource() {
      return { connect: vi.fn() };
    }
  }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const mediaDevices = {
    getUserMedia: vi.fn(getUserMedia ?? (async () => stream)),
    enumerateDevices: vi.fn(async () => [
      { kind: 'audioinput', deviceId: 'default', label: 'Default' },
      { kind: 'audioinput', deviceId: 'usb-mic', label: 'USB Mic' },
      { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
    ]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  return { track, close, stream, mediaDevices };
}

beforeEach(() => {
  frames = [];
  useCommunity.setState({ user, busy: false, error: null });
  useRooms.setState({ preferences: { ...previousPreferences, inputId: '' } });
});
afterEach(() => {
  cleanup();
  delete (window as any).rooms;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  vi.unstubAllGlobals();
  useCommunity.setState(previousCommunity);
  useRooms.setState({ preferences: previousPreferences });
});

describe('sign-in "remember me"', () => {
  it('shows a note instead of a checkbox that cannot be changed', () => {
    bridge();
    useCommunity.setState({ user: null });
    render(
      <MemoryRouter>
        <ConnectionPane referenceMode="signin" onAuthenticated={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('Beni hatırla')).toBeNull();
    expect(screen.getByText('Oturumun bu cihazda güvenle saklanır.')).toBeTruthy();
    // The recovery link on the same row still works.
    expect(screen.getByRole('button', { name: 'Şifreni mi unuttun?' })).toBeTruthy();
  });
});

describe('profile step', () => {
  it('picks the avatar in place and stays on the step', async () => {
    const picked = { ...user, avatar: { id: 'a1' } } as unknown as typeof user;
    const chooseAvatar = vi.fn(async () => picked);
    bridge({ chooseAvatar });
    const onNavigate = vi.fn();
    onboarding('profile', onNavigate);
    expect(screen.getByText('1/2 · Profil')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Avatar seç' }));
    await waitFor(() => expect(useCommunity.getState().user).toBe(picked));
    expect(chooseAvatar).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the profile when the picker is cancelled and shows a failure', async () => {
    const chooseAvatar = vi.fn(async () => null);
    bridge({ chooseAvatar });
    onboarding('profile');
    fireEvent.click(screen.getByRole('button', { name: 'Avatar seç' }));
    await waitFor(() => expect(chooseAvatar).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Avatar seç' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(useCommunity.getState().user).toBe(user);
    chooseAvatar.mockRejectedValueOnce(new Error('Avatar is too large'));
    fireEvent.click(screen.getByRole('button', { name: 'Avatar seç' }));
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
  });

  it('hides "Avatar seç" when the desktop bridge cannot pick one', () => {
    bridge();
    onboarding('profile');
    expect(screen.queryByRole('button', { name: 'Avatar seç' })).toBeNull();
  });
});

describe('devices step', () => {
  it('tests the microphone in place with a live meter and releases it', async () => {
    const { media } = bridge({}, 'darwin');
    const { track, close, mediaDevices } = fakeMedia();
    const view = onboarding('devices');
    expect(screen.getByText('2/2 · Cihazlar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ayarlar' })).toBeNull();
    // Device names appear in the picker; the "default" alias is not listed twice.
    await screen.findByRole('option', { name: 'USB Mic' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sistem varsayılanı',
      'USB Mic',
    ]);
    fireEvent.change(screen.getByLabelText('Mikrofon'), { target: { value: 'usb-mic' } });
    expect(useRooms.getState().preferences.inputId).toBe('usb-mic');

    fireEvent.click(screen.getByRole('button', { name: 'Mikrofonu dene' }));
    await screen.findByRole('button', { name: 'Denemeyi bitir' });
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'usb-mic' } },
      video: false,
    });
    flushFrames();
    const meter = screen.getByRole('meter', { name: 'Mikrofon giriş seviyesi' });
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    // Permission state is read again so the row can say it was granted.
    expect(media.captureStatus).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Denemeyi bitir' }));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(meter.getAttribute('aria-valuenow')).toBe('0');

    // Leaving the step (e.g. "Topluluğuma gir") must not leave the microphone open.
    fireEvent.click(screen.getByRole('button', { name: 'Mikrofonu dene' }));
    await screen.findByRole('button', { name: 'Denemeyi bitir' });
    view.unmount();
    expect(track.stop).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('stops a stream that arrives after the step closed', async () => {
    bridge();
    let resolve!: (stream: MediaStream) => void;
    const { track, stream } = fakeMedia(() => new Promise<MediaStream>((done) => (resolve = done)));
    const view = onboarding('devices');
    fireEvent.click(await screen.findByRole('button', { name: 'Mikrofonu dene' }));
    view.unmount();
    await act(async () => resolve(stream as unknown as MediaStream));
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('explains a denied microphone without sending people to Settings', async () => {
    bridge();
    fakeMedia(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    onboarding('devices');
    fireEvent.click(await screen.findByRole('button', { name: 'Mikrofonu dene' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Mikrofon izni kapalı.');
    expect(screen.getByRole('button', { name: 'Mikrofonu dene' })).toBeTruthy();
  });

  it('names the running OS and drops the line when it is unknown', () => {
    bridge({}, 'win32');
    onboarding('devices');
    expect(screen.getByText('Sistem izinleri Windows tarafından gösterilir.')).toBeTruthy();
    cleanup();
    bridge();
    onboarding('devices');
    expect(screen.queryByText(/Sistem izinleri/)).toBeNull();
    expect(platformName('linux')).toBe('Linux');
    // Without media devices the test card is hidden rather than broken.
    expect(screen.queryByRole('button', { name: 'Mikrofonu dene' })).toBeNull();
    // Camera and screen sharing use the same chip.
    expect(screen.getAllByText('İsteğe bağlı')).toHaveLength(2);
  });
});
