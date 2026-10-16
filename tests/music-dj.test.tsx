// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { DesktopBridge } from '@rooms/contracts';
import type { MediaSnapshot } from '@rooms/media';
import type { MusicSnapshot } from '../packages/shared-contracts/src/music';
import { MusicDJ, MusicDJEntry, openMusicDJ, openRoomActivity } from '../apps/desktop/src/MusicDJ';
import { useCommunity } from '../apps/desktop/src/community';
import { queryClient } from '../apps/desktop/src/query-client';
const empty: MusicSnapshot = {
  channelId: 'room',
  identity: 'rooms-music-room',
  status: 'disconnected',
  queue: [],
  currentId: null,
  positionSec: 0,
  error: null,
};
const media = vi.hoisted(() => ({
  voice: undefined as unknown as MediaSnapshot & {
    channelId: string;
    roomName: string;
    busy: boolean;
  },
  volume: vi.fn(),
}));
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => media.voice,
  setParticipantVolume: media.volume,
}));
vi.mock('../apps/desktop/src/activity', () => ({
  useActivityRoom: () => ({ room: { primary: null }, send: vi.fn() }),
}));
beforeEach(() => {
  media.volume.mockReset();
  media.voice = {
    channelId: 'room',
    roomName: 'Friends',
    busy: false,
    status: 'connected',
    roomId: 'room',
    error: null,
    muted: true,
    deafened: false,
    camera: false,
    sharing: false,
    audioBlocked: false,
    participants: [],
    tracks: [],
    diagnostics: { bitrate: null, packetLoss: null, rtt: null },
  };
  queryClient.clear();
  useCommunity.setState({
    user: { id: 'self', username: 'Self', displayName: 'Self', avatar: null },
    serverUrl: 'https://rooms.test',
  });
  openMusicDJ();
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  delete window.rooms;
});
it('sends a room bot MP3 command without creating an iframe or local audio player', async () => {
  const command = vi.fn(async () => ({
    ...empty,
    status: 'playing',
    currentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    queue: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Song', durationSec: 60 }],
  }));
  window.rooms = { music: { snapshot: async () => empty, command } } as unknown as DesktopBridge;
  const view = render(<MusicDJ />);
  await waitFor(() => expect(screen.queryByText('Yükleniyor…')).toBeNull());
  fireEvent.change(screen.getByLabelText('YouTube, Spotify, SoundCloud veya ses bağlantısı'), {
    target: { value: 'https://audio.test/song.mp3' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kuyruğa ekle' }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith('room', {
      type: 'add',
      url: 'https://audio.test/song.mp3',
      offerCandidates: true,
    }),
  );
  await screen.findByRole('button', { name: 'Duraklat' });
  expect(view.container.querySelector('iframe,audio')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'DJ panelini kapat' }));
  expect(command).toHaveBeenCalledTimes(1);
});
it('opens DJ without changing the current conversation and restores legacy route links', async () => {
  window.rooms = { music: { snapshot: async () => empty } } as unknown as DesktopBridge;
  const navigate = vi.fn();
  openRoomActivity('/youtube', navigate);
  expect(navigate).not.toHaveBeenCalled();
  render(
    <MemoryRouter initialEntries={['/youtube']}>
      <Routes>
        <Route path="/youtube" element={<MusicDJEntry returnTo="/chat" />} />
        <Route path="/chat" element={<p>Current conversation</p>} />
      </Routes>
      <MusicDJ />
    </MemoryRouter>,
  );
  await screen.findByText('Current conversation');
  expect(screen.getByRole('dialog', { name: 'DJ' })).toBeTruthy();
  expect(screen.queryByText('DJ panelini aç')).toBeNull();
});

it('changes only the listener bot gain and keeps controller gain disabled without a bot', async () => {
  const command = vi.fn();
  window.rooms = { music: { snapshot: async () => empty, command } } as unknown as DesktopBridge;
  const view = render(<MusicDJ />);
  const gain = screen.getByRole('slider', { name: 'Botun ses seviyesi' });
  expect((gain as HTMLInputElement).disabled).toBe(true);
  media.voice = {
    ...media.voice,
    participants: [
      {
        id: empty.identity,
        name: 'DJ',
        local: false,
        muted: false,
        speaking: true,
        camera: false,
        screen: false,
        volume: 0.6,
        quality: 'excellent',
      },
    ],
  };
  await waitFor(() => expect(screen.queryByText('Yükleniyor…')).toBeNull());
  view.rerender(<MusicDJ />);
  fireEvent.change(gain, { target: { value: '.25' } });
  expect(media.volume).toHaveBeenLastCalledWith(empty.identity, 0.25);
  fireEvent.click(screen.getByRole('button', { name: 'Botun sesini kapat' }));
  expect(media.volume).toHaveBeenLastCalledWith(empty.identity, 0);
  expect(command).not.toHaveBeenCalled();
});
it.each([
  'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
  'https://soundcloud.com/forss/flickermood',
])(
  'sends a provider reference through the same bot and displays YouTube playback: %s',
  async (url) => {
    const command = vi.fn(async () => ({
      ...empty,
      status: 'playing',
      currentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      queue: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          title: 'Matched song · YouTube',
          durationSec: 213,
        },
      ],
    }));
    window.rooms = { music: { snapshot: async () => empty, command } } as unknown as DesktopBridge;
    const view = render(<MusicDJ />);
    fireEvent.change(screen.getByLabelText('YouTube, Spotify, SoundCloud veya ses bağlantısı'), {
      target: { value: url },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kuyruğa ekle' }));
    await waitFor(() =>
      expect(command).toHaveBeenCalledWith('room', { type: 'add', url, offerCandidates: true }),
    );
    expect(await screen.findAllByText('Matched song · YouTube')).not.toHaveLength(0);
    expect(view.container.querySelector('iframe,audio')).toBeNull();
  },
);
it('does not let a late pre-command snapshot hide the newly resolved queue item', async () => {
  let finish!: (value: MusicSnapshot) => void;
  const old = new Promise<MusicSnapshot>((resolve) => {
    finish = resolve;
  });
  const command = vi.fn(async () => ({
    ...empty,
    status: 'playing',
    currentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    queue: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'Matched song · YouTube',
        durationSec: 213,
      },
    ],
  }));
  window.rooms = { music: { snapshot: () => old, command } } as unknown as DesktopBridge;
  render(<MusicDJ />);
  fireEvent.change(screen.getByLabelText('YouTube, Spotify, SoundCloud veya ses bağlantısı'), {
    target: { value: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kuyruğa ekle' }));
  await screen.findAllByText('Matched song · YouTube');
  finish(empty);
  await waitFor(() => expect(screen.queryByText('Kuyruk boş')).toBeNull());
});

it('restores the prior quiet listener setting after muting and closes independently of bot errors', async () => {
  const command = vi.fn();
  window.rooms = { music: { snapshot: async () => empty, command } } as unknown as DesktopBridge;
  media.voice = {
    ...media.voice,
    participants: [
      {
        id: empty.identity,
        name: 'DJ',
        local: false,
        muted: false,
        speaking: true,
        camera: false,
        screen: false,
        volume: 0.09,
        quality: 'excellent',
      },
    ],
  };
  const view = render(<MusicDJ />);
  await waitFor(() => expect(screen.queryByText('Yükleniyor…')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Botun sesini kapat' }));
  expect(media.volume).toHaveBeenLastCalledWith(empty.identity, 0);
  media.voice = {
    ...media.voice,
    participants: media.voice.participants.map((p) => ({ ...p, volume: 0 })),
  };
  view.rerender(<MusicDJ />);
  fireEvent.click(screen.getByRole('button', { name: 'Botun sesini aç' }));
  expect(media.volume).toHaveBeenLastCalledWith(empty.identity, 0.09);
  fireEvent.click(screen.getByRole('button', { name: 'DJ panelini kapat' }));
  expect(screen.queryByRole('dialog', { name: 'DJ' })).toBeNull();
  expect(command).not.toHaveBeenCalled();
});
it('shows an actionable provider access error from a room snapshot', async () => {
  window.rooms = {
    music: {
      snapshot: async () => ({ ...empty, status: 'error', error: 'MUSIC_YOUTUBE_ACCESS_REQUIRED' }),
    },
  } as unknown as DesktopBridge;
  render(<MusicDJ />);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Parça için YouTube ses erişimini reddetti. DJ sunucu oturumu kontrol edilmeli; tekrar tekrar eklemek bu engeli çözmez.',
  );
});

it('searches a title without changing playback and adds only the selected result', async () => {
  const command = vi.fn(async () => empty),
    search = vi.fn(async () => [
      { id: 'w2BTr6qsLFc', title: 'Diyar Pala - Bensiz Yapama', durationSec: 200 },
    ]);
  window.rooms = {
    music: { snapshot: async () => empty, command, search },
  } as unknown as DesktopBridge;
  render(<MusicDJ />);
  fireEvent.change(screen.getByLabelText('YouTube, Spotify, SoundCloud veya ses bağlantısı'), {
    target: { value: 'Diyar Pala Bensiz Yapama' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Şarkı ara' }));
  const selected = await screen.findByRole('button', {
    name: /^Kuyruğa ekle: Diyar Pala - Bensiz Yapama/,
  });
  expect(search).toHaveBeenCalledWith('room', 'Diyar Pala Bensiz Yapama');
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(selected);
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith('room', {
      type: 'add',
      url: 'https://www.youtube.com/watch?v=w2BTr6qsLFc',
    }),
  );
});
it('commits a seek once on release and includes the selected track identity', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    snapshot = {
      ...empty,
      status: 'playing' as const,
      currentId: id,
      positionSec: 10,
      queue: [{ id, title: 'Song', durationSec: 200 }],
    };
  const command = vi.fn(async () => snapshot);
  window.rooms = { music: { snapshot: async () => snapshot, command } } as unknown as DesktopBridge;
  render(<MusicDJ />);
  const slider = await screen.findByRole('slider', { name: 'Parçada konum' });
  fireEvent.change(slider, { target: { value: '55' } });
  expect(command).not.toHaveBeenCalled();
  fireEvent.pointerUp(slider);
  await waitFor(() =>
    expect(command).toHaveBeenCalledExactlyOnceWith('room', { type: 'seek', id, positionSec: 55 }),
  );
});

it('selects queue tracks and moves them without submitting a source URL', async () => {
  const one = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    two = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const snapshot = {
    ...empty,
    currentId: one,
    status: 'playing' as const,
    queue: [
      { id: one, title: 'One', durationSec: 30 },
      { id: two, title: 'Two', durationSec: 40 },
    ],
  };
  const command = vi.fn(async () => snapshot);
  window.rooms = { music: { snapshot: async () => snapshot, command } } as unknown as DesktopBridge;
  render(<MusicDJ />);
  fireEvent.click(await screen.findByRole('button', { name: 'Two parçasını çal' }));
  await waitFor(() => expect(command).toHaveBeenCalledWith('room', { type: 'select', id: two }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Two yukarı taşı' }).getAttribute('disabled'),
    ).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Two yukarı taşı' }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith('room', { type: 'reorder', ids: [two, one] }),
  );
  expect(JSON.stringify(command.mock.calls)).not.toContain('https:');
});
it('loads room history only when opened and replays through the same bot command', async () => {
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    history = vi.fn(async () => [
      {
        id,
        startedAt: '2026-10-14T10:00:00.000Z',
        endedAt: null,
        tracks: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            title: 'Saved song',
            durationSec: 200,
            played: true,
          },
        ],
      },
    ]),
    command = vi.fn(async () => empty);
  window.rooms = {
    music: { snapshot: async () => empty, history, command },
  } as unknown as DesktopBridge;
  render(<MusicDJ />);
  expect(history).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Geçmiş' }));
  await screen.findByText('Saved song');
  fireEvent.click(screen.getByRole('button', { name: 'Kuyruğa ekle ve çal' }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith('room', { type: 'restore', sessionId: id }),
  );
});
it('offers uncertain match candidates without auto-enqueueing and requires an explicit choice', async () => {
  const candidate = { id: 'abcdefghijk', title: 'Possible match', durationSec: 180 };
  const command = vi
    .fn()
    .mockResolvedValueOnce({
      ...empty,
      matchCandidates: { query: 'Artist Song', candidates: [candidate] },
    })
    .mockResolvedValue(empty);
  window.rooms = { music: { snapshot: async () => empty, command } } as unknown as DesktopBridge;
  render(<MusicDJ />);
  fireEvent.change(screen.getByLabelText('YouTube, Spotify, SoundCloud veya ses bağlantısı'), {
    target: { value: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kuyruğa ekle' }));
  await screen.findByText('Possible match');
  expect(command).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Seçmeden kuyruğa eklenmez/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Kuyruğa ekle: Possible match' }));
  await waitFor(() =>
    expect(command).toHaveBeenLastCalledWith('room', {
      type: 'add',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
    }),
  );
});
it('keeps a single seek control while playback snapshots refresh', async () => {
  // The seek control and lyrics once shared the track id as a sibling key, so each refresh
  // leaked another seek slider into the panel.
  let position = 0;
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const snapshot = vi.fn(async () => ({
    ...empty,
    status: 'playing' as const,
    currentId: id,
    positionSec: (position += 3),
    queue: [{ id, title: 'Song', durationSec: 257 }],
  }));
  window.rooms = {
    music: {
      snapshot,
      command: vi.fn(),
      lyrics: vi.fn(async () => ({ status: 'unavailable' })),
    },
  } as unknown as DesktopBridge;
  const view = render(<MusicDJ />);
  for (let i = 0; i < 6; i++) {
    await queryClient.refetchQueries();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(snapshot.mock.calls.length).toBeGreaterThanOrEqual(6);
  expect(view.container.querySelectorAll('.dj-seek')).toHaveLength(1);
});
