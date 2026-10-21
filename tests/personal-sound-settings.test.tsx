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
const media = vi.hoisted(() => ({ inputName: null as string | null }));
vi.mock('@rooms/media', () => ({
  createNoiseSuppressionNode: vi.fn(),
  selectedInputLabel: () => media.inputName,
}));
vi.mock('../apps/desktop/src/NoiseComparison', () => ({ NoiseComparison: () => null }));
import { PersonalSoundSettings, monoOf } from '../apps/desktop/src/PersonalSoundSettings';
import Settings from '../apps/desktop/src/Settings';
import { useCommunity } from '../apps/desktop/src/community';
import { useRooms } from '../apps/desktop/src/store';

const RATE = 48000,
  OWN = '3f8e2a6c-1b4d-4c5e-9f0a-2b3c4d5e6f70',
  NEW = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const presets = [
  { id: 'p.fanfar', name: 'Fanfar', durationSec: 1.2 },
  { id: 'p.kapi', name: 'Kapı zili', durationSec: 0.9 },
  { id: 'p.portal', name: 'Portal', durationSec: 0.8 },
];
const profile = (change: Partial<PersonalSoundProfile> = {}): PersonalSoundProfile => ({
  assign: { enter: 'p.fanfar', leave: null },
  sounds: [{ id: OWN, name: 'Kahkaha', durationSec: 2.1 }],
  presets,
  uploads: true,
  ...change,
});
const players: FakeAudio[] = [],
  probes: FakeAudio[] = [];
/** What the source's metadata says; `NaN` makes the probe fail. */
let metadataSeconds = 6;
class FakeAudio {
  volume = 1;
  paused = true;
  preload = 'auto';
  duration = NaN;
  onended: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  setSinkId = vi.fn(async (_id: string) => {});
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  removeAttribute = vi.fn();
  load = vi.fn();
  #src = '';
  /** Players get their source up front; the duration probe sets it later. */
  constructor(src?: string) {
    if (src === undefined) probes.push(this);
    else {
      this.#src = src;
      players.push(this);
    }
  }
  get src() {
    return this.#src;
  }
  set src(url: string) {
    this.#src = url;
    queueMicrotask(() => {
      if (Number.isNaN(metadataSeconds)) return this.onerror?.();
      this.duration = metadataSeconds;
      this.onloadedmetadata?.();
    });
  }
}
let decoded: Float32Array[] | Error = [],
  decodedSeconds: number | undefined;
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
      duration: decodedSeconds ?? channels[0].length / RATE,
      getChannelData: (i: number) => channels[i],
    };
  }
}
let blobs = 0;
const revoked: string[] = [];
const original = { community: useCommunity.getState(), prefs: useRooms.getState().preferences };
beforeEach(() => {
  players.length = 0;
  probes.length = 0;
  metadataSeconds = 6;
  decodedSeconds = undefined;
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
async function upload(dialog: HTMLElement) {
  decoded = tone(2);
  await choose(dialog, audioFile('Benim sesim.mp3'));
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /Bu sesi kullanma hakkım var/ }));
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve seç' }));
  });
}
const pressed = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('button', { pressed: true })
    .map((button) => button.querySelector('span')?.textContent);

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
    await waitFor(() => expect(api.assign).toHaveBeenCalled());
    await act(async () => reject(remoteError('Bu ses artık yok.')));
    expect(within(dialog).getByRole('alert').textContent).toBe('Bu ses artık yok.');
    expect(pick('Fanfar').getAttribute('aria-pressed')).toBe('true');
    expect(pick('Kapı zili').getAttribute('aria-pressed')).toBe('false');
    await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(2));
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

  it('cancels a delete with Escape and keeps focus in the picker after deleting', async () => {
    bridge(profile({ assign: { enter: 'p.kapi', leave: null } }));
    await show();
    const dialog = openPicker(),
      trash = () => within(dialog).getByRole('button', { name: 'Kahkaha sesini sil' });
    fireEvent.click(trash());
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Vazgeç' }), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).queryByText('Kahkaha silinsin mi?')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trash()));
    fireEvent.click(trash());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
    await within(dialog).findByText('Henüz ses yüklemedin.');
    await waitFor(() => expect(document.activeElement).toBe(option(dialog, 'Kapı zili')));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reloads after a refused delete and forgets one cut off by an account change', async () => {
    const api = bridge();
    api.remove.mockRejectedValueOnce(remoteError('Bu ses artık yok.'));
    api.profile.mockResolvedValueOnce(profile()).mockResolvedValueOnce(profile({ sounds: [] }));
    await show();
    let dialog = openPicker();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kahkaha sesini sil' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
    await within(dialog).findByText('Henüz ses yüklemedin.');
    expect(within(dialog).getByRole('alert').textContent).toBe('Bu ses artık yok.');
    cleanup();
    const next = bridge();
    let finish!: (value: PersonalSoundProfile) => void;
    next.remove.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await show();
    dialog = openPicker();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kahkaha sesini sil' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(next.remove).toHaveBeenCalled());
    act(() =>
      useCommunity.setState({
        user: { id: 'other', username: 'other', displayName: 'Other', avatar: null } as never,
      }),
    );
    await screen.findByText('Odaya girince');
    await act(async () => finish(profile({ sounds: [] })));
    dialog = openPicker();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kahkaha sesini sil' }));
    const remove = within(dialog).getByRole('button', { name: 'Sil' });
    expect(remove.hasAttribute('disabled')).toBe(false);
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
    expect(probes[0].preload).toBe('metadata');
    expect(revoked).toContain(probes[0].src);
    expect(contexts[0].options).toEqual({ sampleRate: RATE });
    expect(contexts[0].close).toHaveBeenCalled();
    // Polite, not an alert: it comes and goes while the start is dragged.
    const live = dialog.querySelector('.personal-sound-draft [aria-live="polite"]')!;
    expect(live.textContent).toBe('Seçtiğin kesit neredeyse sessiz. Başka bir bölüm seç.');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    const save = within(dialog).getByRole('button', { name: 'Kaydet ve seç' });
    expect(save.hasAttribute('disabled')).toBe(true);
    const start = within(dialog).getByRole('slider', { name: 'Başlangıç' });
    fireEvent.change(start, { target: { value: '2' } });
    expect(start.getAttribute('aria-valuetext')).toBe('2,0 sn');
    expect(live.textContent).toBe('');
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
    expect((await within(dialog).findByRole('status')).textContent).toBe('Giriş sesin kaydedildi');
    expect(option(dialog, 'Benim sesim').getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(option(dialog, 'Benim sesim')));
  });

  it('keeps one mono copy that windows to exactly what the decoded channels give', () => {
    const channels = [0.37, 0.11, 0.53].map((step) =>
      Float32Array.from(
        { length: 6 * RATE },
        (_, i) => 0.9 * Math.sin(i * step) * Math.cos(i * 1e-4),
      ),
    );
    const bytes = (samples: Float32Array) =>
      Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
    for (const input of [channels.slice(0, 1), channels.slice(0, 2), channels]) {
      const mono = monoOf(input);
      expect(mono).toHaveLength(6 * RATE);
      for (const start of [0, 1.37, 2])
        expect(
          bytes(personalSoundWindow([mono], RATE, start)).equals(
            bytes(personalSoundWindow(input, RATE, start)),
          ),
        ).toBe(true);
    }
  });

  it('refuses sources over five minutes, before decoding when the metadata tells', async () => {
    bridge();
    await show();
    const dialog = openPicker(),
      tooLong = 'Bu dosya 5 dakikadan uzun. Kısa bir bölümünü kaydedip yeniden dene.';
    metadataSeconds = 301;
    await choose(dialog, audioFile('konser.mp3'));
    expect(within(dialog).getByRole('alert').textContent).toBe(tooLong);
    expect(contexts).toHaveLength(0);
    expect(probes[0].load).toHaveBeenCalled();
    // Unknown lengths (live recordings, odd headers) are checked once decoded.
    metadataSeconds = Infinity;
    decoded = tone(1);
    decodedSeconds = 301;
    await choose(dialog, audioFile('kayit.webm'));
    expect(within(dialog).getByRole('alert').textContent).toBe(tooLong);
    expect(contexts[0].close).toHaveBeenCalled();
    metadataSeconds = NaN;
    decodedSeconds = undefined;
    await choose(dialog, audioFile('kisa.mp3'));
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Kaydet ve seç' })).toBeTruthy();
    expect(revoked).toEqual(expect.arrayContaining(probes.map((probe) => probe.src)));
  });

  it('confirms every pick, since it saves without the page Save bar', async () => {
    bridge();
    await show();
    expect(
      screen.getByText('Seçimin hemen kaydedilir ve tüm cihazlarında geçerli olur.'),
    ).toBeTruthy();
    expect(screen.getByText(/aynı seviyede duyulsun/)).toBeTruthy();
    const dialog = openPicker();
    fireEvent.click(option(dialog, 'Kapı zili'));
    expect((await within(dialog).findByRole('status')).textContent).toBe('Giriş sesin kaydedildi');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pencereyi kapat' }));
    expect(screen.getByRole('status').textContent).toBe('Giriş sesin kaydedildi');
  });

  it('sends one pick at a time and only the newest, so the screen matches the server', async () => {
    const api = bridge();
    const save = api.assign.getMockImplementation()!,
      gates: ((fail?: boolean) => void)[] = [];
    api.assign.mockImplementation(
      (value) =>
        new Promise((resolve, reject) =>
          gates.push((fail) =>
            fail
              ? reject(remoteError('Seçimin kaydedilemedi. Yeniden dene.'))
              : resolve(save(value)),
          ),
        ),
    );
    await show();
    const dialog = openPicker();
    fireEvent.click(option(dialog, 'Kapı zili'));
    await waitFor(() => expect(gates).toHaveLength(1));
    // Both wait for the first request; only the newest is sent after it.
    fireEvent.click(option(dialog, 'Portal'));
    fireEvent.click(option(dialog, 'Varsayılan'));
    await act(async () => {});
    expect(gates).toHaveLength(1);
    expect(pressed(dialog)).toEqual(['Varsayılan']);
    await act(async () => gates[0]());
    await waitFor(() => expect(gates).toHaveLength(2));
    expect(api.assign.mock.calls.map(([value]) => value.enter)).toEqual(['p.kapi', null]);
    expect(within(dialog).queryByRole('status')).toBeNull();
    await act(async () => gates[1](true));
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Seçimin kaydedilemedi. Yeniden dene.',
    );
    await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(2));
    expect((await api.profile()).assign.enter).toBe('p.kapi');
    expect(pressed(dialog)).toEqual(['Kapı zili']);
  });

  it('reloads after a refused pick, so a sound deleted elsewhere does not block the next', async () => {
    // Loaded with Kahkaha as the entrance sound; another device has since deleted it.
    const api = bridge(profile({ assign: { enter: OWN, leave: null } }));
    let server = profile({ sounds: [], assign: { enter: null, leave: null } });
    const known = (id: string | null) =>
      id === null || id.startsWith('p.') || server.sounds.some((sound) => sound.id === id);
    api.assign.mockImplementation(async (value) => {
      if (!known(value.enter) || !known(value.leave)) throw remoteError('Bu ses artık yok.');
      return (server = { ...server, assign: value });
    });
    await show();
    api.profile.mockImplementation(async () => server);
    const dialog = openPicker('Çıkış sesini değiştir');
    fireEvent.click(option(dialog, 'Kapı zili'));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toBe('Bu ses artık yok.'),
    );
    await within(dialog).findByText('Henüz ses yüklemedin.');
    expect(within(row('Odaya girince')).getByText('Varsayılan')).toBeTruthy();
    fireEvent.click(option(dialog, 'Kapı zili'));
    expect((await within(dialog).findByRole('status')).textContent).toBe('Çıkış sesin kaydedildi');
    expect(server.assign).toEqual({ enter: null, leave: 'p.kapi' });
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('reloads after a refused upload and says when a saved sound could not be selected', async () => {
    const api = bridge();
    await show();
    // The library filled up on another device.
    const full = profile({
      sounds: Array.from({ length: 6 }, (_, i) => ({
        id: `3f8e2a6c-1b4d-4c5e-9f0a-2b3c4d5e6f7${i}`,
        name: `Ses ${i + 1}`,
        durationSec: 1,
      })),
    });
    api.upload.mockRejectedValueOnce(
      remoteError('En fazla 6 ses saklayabilirsin. Önce birini sil.'),
    );
    api.profile.mockResolvedValueOnce(full);
    let dialog = openPicker();
    await upload(dialog);
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'En fazla 6 ses saklayabilirsin. Önce birini sil.',
    );
    await within(dialog).findByText('Ses 6');
    expect(
      within(dialog)
        .getByRole('button', { name: 'Bilgisayardan ses seç' })
        .hasAttribute('disabled'),
    ).toBe(true);
    cleanup();
    const next = bridge();
    next.assign.mockRejectedValueOnce(remoteError('Seçimin kaydedilemedi. Yeniden dene.'));
    await show();
    dialog = openPicker();
    await upload(dialog);
    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toBe(
        'Ses kaydedildi ama seçilemedi. Listeden seçebilirsin.',
      ),
    );
    expect(option(dialog, 'Benim sesim').getAttribute('aria-pressed')).toBe('false');
    expect(pressed(dialog)).toEqual(['Fanfar']);
    cleanup();
    // A refusal while the new sound's selection waited in line rolls that selection back too.
    const third = bridge();
    let refuse!: (error: Error) => void;
    third.assign.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)));
    await show();
    dialog = openPicker();
    fireEvent.click(option(dialog, 'Kapı zili'));
    await waitFor(() => expect(third.assign).toHaveBeenCalledTimes(1));
    await upload(dialog);
    await act(async () => refuse(remoteError('Seçimin kaydedilemedi. Yeniden dene.')));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toBe(
        'Ses kaydedildi ama seçilemedi. Listeden seçebilirsin.',
      ),
    );
    expect(third.assign).toHaveBeenCalledTimes(1);
    expect(pressed(dialog)).toEqual(['Fanfar']);
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
    const effects = screen.getByRole('slider', { name: 'Efekt ses düzeyi' });
    fireEvent.change(effects, { target: { value: '0.4' } });
    expect(screen.getByText('40%')).toBeTruthy();
    expect(effects.getAttribute('aria-valuetext')).toBe('40%');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    });
    const saved = useRooms.getState().preferences;
    expect(saved.soundEffectsLevel).toBe(0.4);
    expect(saved.personalSounds).toBe(false);
    expect(saved.roomEventSounds).toBe(true);
  });
  it('saves a microphone level for the named device only', async () => {
    media.inputName = 'HyperX Cloud II';
    try {
      useRooms.setState({
        preferences: { ...original.prefs, inputLevels: { 'MacBook Pro Microphone': 20 } },
      });
      showSettings();
      const slider = screen.getByRole('slider', { name: 'Mikrofon seviyesi' });
      expect(slider.getAttribute('aria-valuetext')).toBe('100%');
      expect(screen.getByText(/HyperX Cloud II için hatırlanır/)).toBeTruthy();
      fireEvent.change(slider, { target: { value: '50' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
      });
      expect(useRooms.getState().preferences.inputLevels).toEqual({
        'MacBook Pro Microphone': 20,
        'HyperX Cloud II': 50,
      });
    } finally {
      media.inputName = null;
    }
  });
});
