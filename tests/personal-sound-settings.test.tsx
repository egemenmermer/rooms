// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  encodePersonalSoundWav,
  fromBase64,
  parsePersonalSoundWav,
  personalSoundWindow,
  processPersonalSound,
  toBase64,
} from '../packages/shared-contracts/src/personal-sound-audio';
import {
  PERSONAL_SOUND_POLICY,
  personalSoundUploadSchema,
  type PersonalSoundProfile,
  type PersonalSoundUpload,
} from '../packages/shared-contracts/src/personal-sounds';
vi.mock('../apps/desktop/src/room-event-sounds', () => ({
  roomCueSource: (kind: string) => `blob:classic-${kind}`,
}));
vi.mock('../apps/desktop/src/realtime', async () => {
  const { create } = await import('zustand');
  return {
    useRealtime: create(() => ({
      status: 'idle',
      muted: true,
      noiseProcessing: null,
      roomName: '',
    })),
    setNoiseSuppression: vi.fn(),
  };
});
vi.mock('../apps/desktop/src/runtime-sources', () => ({ mediaProvider: () => ({}) }));
vi.mock('@rooms/media', () => ({ createNoiseSuppressionNode: vi.fn() }));
vi.mock('../apps/desktop/src/NoiseComparison', () => ({ NoiseComparison: () => null }));
import { PersonalSoundSettings } from '../apps/desktop/src/PersonalSoundSettings';
import Settings from '../apps/desktop/src/Settings';
import { useCommunity } from '../apps/desktop/src/community';
import { useRooms } from '../apps/desktop/src/store';

const RATE = 48000,
  OWN = '3f8e2a6c-1b4d-4c5e-9f0a-2b3c4d5e6f70',
  NEW = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const presets = [
  { id: 'p.fanfar', name: 'Fanfar', durationSec: 1.2 },
  { id: 'p.kapi', name: 'Kapı zili', durationSec: 0.9 },
];
const profile = (change: Partial<PersonalSoundProfile> = {}): PersonalSoundProfile => ({
  assign: { enter: 'p.fanfar', leave: null },
  sounds: [{ id: OWN, name: 'Kahkaha', durationSec: 2.1 }],
  presets,
  uploads: true,
  ...change,
});
const players: FakeAudio[] = [];
class FakeAudio {
  volume = 1;
  paused = true;
  onended: (() => void) | null = null;
  setSinkId = vi.fn(async (_id: string) => {});
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  constructor(public src: string) {
    players.push(this);
  }
}
let decoded: Float32Array[] | Error = [];
const contexts: { options: unknown; close: ReturnType<typeof vi.fn> }[] = [];
class FakeContext {
  close = vi.fn(async () => {});
  constructor(public options: unknown) {
    contexts.push(this);
  }
  async decodeAudioData() {
    if (decoded instanceof Error) throw decoded;
    const channels = decoded;
    return {
      sampleRate: RATE,
      numberOfChannels: channels.length,
      length: channels[0].length,
      duration: channels[0].length / RATE,
      getChannelData: (i: number) => channels[i],
    };
  }
}
let blobs = 0;
const revoked: string[] = [];
const original = { community: useCommunity.getState(), prefs: useRooms.getState().preferences };
beforeEach(() => {
  players.length = 0;
  contexts.length = 0;
  revoked.length = 0;
  blobs = 0;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('AudioContext', FakeContext);
  Object.assign(URL, {
    createObjectURL: () => `blob:preview-${++blobs}`,
    revokeObjectURL: (url: string) => revoked.push(url),
  });
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.matchMedia = ((media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  useCommunity.setState({
    user: { id: 'self', username: 'self', displayName: 'Self', avatar: null } as never,
    serverUrl: 'https://rooms.test',
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.rooms;
  useCommunity.setState(original.community);
  useRooms.setState({ preferences: original.prefs });
});
function bridge(initial = profile()) {
  let state = initial;
  const api = {
    profile: vi.fn(async () => state),
    upload: vi.fn(async (input: PersonalSoundUpload) => {
      const sound = { id: NEW, name: input.name, durationSec: 3 };
      state = { ...state, sounds: [...state.sounds, sound] };
      return sound;
    }),
    remove: vi.fn(async (id: string) => {
      state = { ...state, sounds: state.sounds.filter((sound) => sound.id !== id) };
      return state;
    }),
    assign: vi.fn(async (value: PersonalSoundProfile['assign']) => {
      state = { ...state, assign: value };
      return state;
    }),
    preview: vi.fn(async () => toBase64(encodePersonalSoundWav(new Float32Array(4800)))),
    read: vi.fn(),
  };
  window.rooms = { personalSounds: api } as unknown as NonNullable<Window['rooms']>;
  return api;
}
const remoteError = (message: string) =>
  new Error(`Error invoking remote method 'rooms:personal-sounds': Error: ${message}`);
async function show(level = 1) {
  render(<PersonalSoundSettings outputId="headphones" level={level} />);
  await screen.findByText('Odaya girince');
}
const row = (title: string) => screen.getByText(title).closest('.settings-row') as HTMLElement;
/** The choose button of an option, not its preview or delete action. */
const option = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole('button', { name: new RegExp(`^${name}(?! sesini)`) });
function openPicker(label = 'Giriş sesini değiştir') {
  fireEvent.click(screen.getByRole('button', { name: label }));
  return screen.getByRole('dialog');
}
/** Stereo tone that stays silent until `quietUntil` seconds. */
function tone(seconds: number, quietUntil = 0) {
  const length = Math.round(seconds * RATE),
    left = new Float32Array(length),
    right = new Float32Array(length);
  for (let i = Math.round(quietUntil * RATE); i < length; i++) {
    left[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / RATE);
    right[i] = 0.2 * Math.sin((2 * Math.PI * 660 * i) / RATE);
  }
  return [left, right];
}
function audioFile(name: string, size?: number) {
  const file = Object.assign(new File([new Uint8Array([1, 2, 3])], name, { type: 'audio/mpeg' }), {
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}
async function choose(dialog: HTMLElement, file: File) {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe('Giriş sesi settings', () => {
  it('shows the chosen names and explains when the bridge or account is missing', async () => {
    const api = bridge();
    await show();
    expect(within(row('Odaya girince')).getByText('Fanfar')).toBeTruthy();
    expect(within(row('Odadan çıkınca')).getByText('Varsayılan')).toBeTruthy();
    expect(screen.getByText(/En fazla 4 saniye\./)).toBeTruthy();
    expect(api.profile).toHaveBeenCalledTimes(1);
    cleanup();
    delete window.rooms;
    render(<PersonalSoundSettings outputId="" level={1} />);
    expect(
      screen.getByText(
        'Giriş sesleri masaüstü uygulamasında ve bir sunucuya bağlıyken kullanılabilir.',
      ),
    ).toBeTruthy();
    cleanup();
    bridge();
    useCommunity.setState({ user: null });
    render(<PersonalSoundSettings outputId="" level={1} />);
    expect(screen.getByText(/önce bir sunucuya giriş yap/)).toBeTruthy();
  });

  it('shows a server error inline and retries', async () => {
    const api = bridge();
    api.profile.mockRejectedValueOnce(remoteError('Bu sunucuda giriş sesleri henüz açılmadı.'));
    render(<PersonalSoundSettings outputId="" level={1} />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Bu sunucuda giriş sesleri henüz açılmadı.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    await screen.findByText('Odaya girince');
    expect(api.profile).toHaveBeenCalledTimes(2);
  });

  it('drops a profile that arrives after the account changed', async () => {
    const api = bridge();
    let late!: (value: PersonalSoundProfile) => void;
    api.profile.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)));
    render(<PersonalSoundSettings outputId="" level={1} />);
    api.profile.mockResolvedValueOnce(profile({ assign: { enter: 'p.kapi', leave: null } }));
    act(() =>
      useCommunity.setState({
        user: { id: 'other', username: 'other', displayName: 'Other', avatar: null } as never,
      }),
    );
    await screen.findByText('Kapı zili');
    await act(async () => late(profile()));
    expect(within(row('Odaya girince')).getByText('Kapı zili')).toBeTruthy();
    expect(screen.queryByText('Fanfar')).toBeNull();
  });

  it('picks a preset immediately and can return to the classic cue', async () => {
    const api = bridge();
    await show();
    const dialog = openPicker();
    expect(within(dialog).getByRole('heading', { name: 'Giriş sesi seç' })).toBeTruthy();
    const pick = (name: string) => option(dialog, name);
    expect(pick('Fanfar').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pick('Kapı zili'));
    expect(pick('Kapı zili').getAttribute('aria-pressed')).toBe('true');
    await waitFor(() =>
      expect(api.assign).toHaveBeenLastCalledWith({ enter: 'p.kapi', leave: null }),
    );
    fireEvent.click(pick('Varsayılan'));
    await waitFor(() => expect(api.assign).toHaveBeenLastCalledWith({ enter: null, leave: null }));
    expect(pick('Varsayılan').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pencereyi kapat' }));
    expect(within(row('Odaya girince')).getByText('Varsayılan')).toBeTruthy();
    openPicker('Çıkış sesini değiştir');
    fireEvent.click(option(screen.getByRole('dialog'), 'Kahkaha'));
    await waitFor(() => expect(api.assign).toHaveBeenLastCalledWith({ enter: null, leave: OWN }));
  });

  it('rolls an assignment back and explains when the server refuses it', async () => {
    const api = bridge();
    let reject!: (error: Error) => void;
    api.assign.mockImplementationOnce(() => new Promise((_, no) => (reject = no)));
    await show();
    const dialog = openPicker();
    const pick = (name: string) => option(dialog, name);
    fireEvent.click(pick('Kapı zili'));
    expect(pick('Kapı zili').getAttribute('aria-pressed')).toBe('true');
    await act(async () => reject(remoteError('Bu ses artık yok.')));
    expect(within(dialog).getByRole('alert').textContent).toBe('Bu ses artık yok.');
    expect(pick('Fanfar').getAttribute('aria-pressed')).toBe('true');
    expect(pick('Kapı zili').getAttribute('aria-pressed')).toBe('false');
  });

  it('deletes an upload only after the inline confirmation', async () => {
    const api = bridge(profile({ assign: { enter: OWN, leave: null } }));
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await show();
    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kahkaha sesini sil' }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Kahkaha silinsin mi?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    expect(option(dialog, 'Kahkaha')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kahkaha sesini sil' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
    await within(dialog).findByText('Henüz ses yüklemedin.');
    expect(api.remove).toHaveBeenCalledWith(OWN);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('previews on the chosen output at the level others hear, caches and stops', async () => {
    const api = bridge();
    await show(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Fanfar sesini dinle' }));
    await screen.findByRole('button', { name: 'Fanfar sesini durdur' });
    const [first] = players;
    expect(api.preview).toHaveBeenCalledWith('p.fanfar');
    expect(first.setSinkId).toHaveBeenCalledWith('headphones');
    expect(first.volume).toBeCloseTo(PERSONAL_SOUND_POLICY.personalGain * 0.5);
    expect(first.play).toHaveBeenCalled();
    await waitFor(() => expect(row('Odaya girince').querySelector('.personal-sound-progress')));
    fireEvent.click(screen.getByRole('button', { name: 'Fanfar sesini durdur' }));
    expect(first.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fanfar sesini dinle' }));
    await screen.findByRole('button', { name: 'Fanfar sesini durdur' });
    expect(api.preview).toHaveBeenCalledTimes(1);
    expect(players[1].src).toBe(first.src);
    act(() => players[1].onended?.());
    expect(screen.getByRole('button', { name: 'Fanfar sesini dinle' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Varsayılan sesini dinle' }));
    await screen.findByRole('button', { name: 'Varsayılan sesini durdur' });
    expect(players[2].src).toBe('blob:classic-leave');
    expect(players[2].volume).toBeCloseTo(PERSONAL_SOUND_POLICY.classicGain * 0.5);
    cleanup();
    expect(revoked).toContain(first.src);
  });

  it('trims, normalizes and uploads the exact previewed clip, then selects it', async () => {
    const api = bridge(profile({ assign: { enter: 'p.fanfar', leave: 'p.kapi' } }));
    const channels = tone(6, 4.5);
    decoded = channels;
    await show();
    const dialog = openPicker();
    await choose(dialog, audioFile('Benim sesim.mp3'));
    expect(contexts[0].options).toEqual({ sampleRate: RATE });
    expect(contexts[0].close).toHaveBeenCalled();
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Seçtiğin kesit neredeyse sessiz. Başka bir bölüm seç.',
    );
    const save = within(dialog).getByRole('button', { name: 'Kaydet ve seç' });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Başlangıç' }), {
      target: { value: '2' },
    });
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect((within(dialog).getByRole('textbox', { name: 'Ad' }) as HTMLInputElement).value).toBe(
      'Benim sesim',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kesiti dinle' }));
    await within(dialog).findByRole('button', { name: 'Durdur' });
    expect(players[0].volume).toBeCloseTo(PERSONAL_SOUND_POLICY.personalGain);
    expect(players[0].setSinkId).toHaveBeenCalledWith('headphones');
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Bu sesi kullanma hakkım var/ }));
    expect(save.hasAttribute('disabled')).toBe(false);
    await act(async () => {
      fireEvent.click(save);
    });
    expect(revoked).toContain(players[0].src);
    const upload = api.upload.mock.calls[0][0];
    expect(personalSoundUploadSchema.safeParse(upload).success).toBe(true);
    expect(upload.name).toBe('Benim sesim');
    const samples = parsePersonalSoundWav(fromBase64(upload.audio));
    expect(samples.length / RATE).toBeCloseTo(3, 1);
    const expected = processPersonalSound(personalSoundWindow(channels, RATE, 2));
    expect(upload.audio).toBe(toBase64(encodePersonalSoundWav(expected.samples)));
    await waitFor(() =>
      expect(api.assign).toHaveBeenLastCalledWith({ enter: NEW, leave: 'p.kapi' }),
    );
    expect(within(dialog).getByRole('status').textContent).toBe('Giriş sesin kaydedildi');
    expect(option(dialog, 'Benim sesim').getAttribute('aria-pressed')).toBe('true');
  });

  it('rejects large or unreadable files before upload', async () => {
    const api = bridge();
    await show();
    const dialog = openPicker();
    await choose(dialog, audioFile('uzun.wav', 20_000_001));
    expect(within(dialog).getByRole('alert').textContent).toContain('20 MB');
    expect(contexts).toHaveLength(0);
    decoded = new DOMException('bad', 'EncodingError') as unknown as Error;
    await choose(dialog, audioFile('bozuk.mp3'));
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Bu dosya okunamadı. MP3, WAV, M4A, OGG veya FLAC dene.',
    );
    expect(within(dialog).queryByRole('button', { name: 'Kaydet ve seç' })).toBeNull();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('hides uploads the admin turned off and blocks a full library', async () => {
    bridge(profile({ uploads: false }));
    await show();
    let dialog = openPicker();
    expect(within(dialog).queryByRole('button', { name: 'Bilgisayardan ses seç' })).toBeNull();
    expect(within(dialog).getByText(/yöneticisi ses yüklemeyi kapattı/)).toBeTruthy();
    expect(option(dialog, 'Fanfar')).toBeTruthy();
    cleanup();
    bridge(
      profile({
        sounds: Array.from({ length: 6 }, (_, i) => ({
          id: `3f8e2a6c-1b4d-4c5e-9f0a-2b3c4d5e6f7${i}`,
          name: `Ses ${i + 1}`,
          durationSec: 1,
        })),
      }),
    );
    await show();
    dialog = openPicker();
    expect(
      within(dialog)
        .getByRole('button', { name: 'Bilgisayardan ses seç' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(within(dialog).getByText(/En fazla 6 ses saklayabilirsin/)).toBeTruthy();
  });
});

describe('listener sound preferences', () => {
  function showSettings() {
    render(
      <MemoryRouter initialEntries={['/settings?tab=audio']}>
        <Settings notify={() => {}} onClose={() => {}} />
      </MemoryRouter>,
    );
  }
  it('disables personal sounds while room sounds are off and saves the effect level', async () => {
    useRooms.setState({
      preferences: { ...original.prefs, roomEventSounds: false, soundEffectsLevel: 1 },
    });
    showSettings();
    const personal = screen.getByRole('switch', { name: 'Kişisel giriş sesleri' });
    expect(personal.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Önce oda giriş ve çıkış seslerini aç.')).toBeTruthy();
    expect(
      screen.getByText(
        'Giriş sesleri masaüstü uygulamasında ve bir sunucuya bağlıyken kullanılabilir.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Oda giriş ve çıkış sesleri' }));
    expect(personal.hasAttribute('disabled')).toBe(false);
    fireEvent.click(personal);
    expect(personal.getAttribute('aria-checked')).toBe('false');
    fireEvent.change(screen.getByRole('slider', { name: 'Efekt ses düzeyi' }), {
      target: { value: '0.4' },
    });
    expect(screen.getByText('40%')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    });
    const saved = useRooms.getState().preferences;
    expect(saved.soundEffectsLevel).toBe(0.4);
    expect(saved.personalSounds).toBe(false);
    expect(saved.roomEventSounds).toBe(true);
  });
});
