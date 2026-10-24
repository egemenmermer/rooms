// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
const f = vi.hoisted(() => ({
  directory: {
    rooms: [] as {
      channelId: string;
      participants: { id: string; name: string; muted: boolean }[];
    }[],
    loading: false,
    error: false,
  },
  friends: {
    friends: [] as {
      user: { id: string; username: string; displayName: string; avatar: null };
      relationship: string;
      status: string;
    }[],
    loading: false,
    error: '',
    refresh: async () => {},
  },
  joinVoice: vi.fn(async () => {}),
}));
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({ status: 'idle', channelId: null }),
  joinVoice: f.joinVoice,
}));
vi.mock('../apps/desktop/src/voice-directory', () => ({ useVoiceDirectory: () => f.directory }));
vi.mock('../apps/desktop/src/activity', () => ({
  useActivityRoom: () => ({ status: 'idle', room: null }),
}));
vi.mock('../apps/desktop/src/cinema/cinema-status', () => ({
  useCommunityCinema: () => ({ hallId: null, available: false, status: null }),
}));
vi.mock('../apps/desktop/src/FriendsPage', async (original) => ({
  ...(await original<typeof import('../apps/desktop/src/FriendsPage')>()),
  useFriendList: () => f.friends,
}));
import { Home } from '../apps/desktop/src/Home';
import { Messages } from '../apps/desktop/src/Messages';
import { useCommunity } from '../apps/desktop/src/community';

const me = { id: 'me', username: 'me', displayName: 'Ben', avatar: null },
  peer = { id: 'friend', username: 'friend', displayName: 'Test Friend', avatar: null };
const originalOpen = useCommunity.getState().openChannel;
const openChannel = vi.fn(async (id: string) => {
  useCommunity.setState({ activeChannelId: id });
});

beforeEach(() => {
  f.joinVoice.mockClear();
  openChannel.mockClear();
  f.directory = { rooms: [], loading: false, error: false };
  f.friends = { ...f.friends, friends: [], loading: false, error: '' };
  (window as { rooms?: unknown }).rooms = {
    social: { avatar: vi.fn(async () => null), cachedMessages: vi.fn(async () => []) },
    media: {},
  };
  useCommunity.setState({
    status: 'connected',
    busy: false,
    loadingMessages: false,
    user: me,
    serverUrl: 'https://local.example',
    activeSpaceId: 'server',
    activeChannelId: null,
    spaces: [{ id: 'server', name: 'Tayfa Evi', ownerId: 'me', icon: null }],
    channels: [
      { id: 'general', spaceId: 'server', name: 'genel', type: 0, topic: null },
      { id: 'salon', spaceId: 'server', name: 'Salon', type: 2, topic: null },
    ],
    dms: [],
    unread: {},
    readStates: {},
    presence: {},
    messages: [],
    openChannel,
  });
});
afterEach(() => {
  cleanup();
  delete (window as { rooms?: unknown }).rooms;
  useCommunity.setState({ openChannel: originalOpen });
});

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}
async function mount(page: 'home' | 'messages', open = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[page === 'home' ? '/home' : '/messages']}>
      {page === 'home' ? <Home open={open} notify={vi.fn()} /> : <Messages notify={vi.fn()} />}
      <Where />
    </MemoryRouter>,
  );
  await act(async () => {});
  return open;
}
const path = () => screen.getByTestId('path').textContent;

it('shows who is in a voice room and joins it on the voice page, like the sidebar', async () => {
  f.directory.rooms = [
    { channelId: 'salon', participants: [{ id: 'p', name: 'Ayşe', muted: false }] },
  ];
  f.friends.friends = [{ user: peer, relationship: 'friend', status: 'online' }];
  (window.rooms!.media as { directory?: unknown }).directory = vi.fn();
  await mount('home');
  const voice = within(screen.getByRole('region', { name: 'Ses odaları' }));
  expect(voice.getByText('1 kişi')).toBeTruthy();
  fireEvent.click(voice.getByRole('button', { name: /Salon/ }));
  expect(path()).toBe('/voice');
  expect(openChannel).toHaveBeenCalledWith('salon');
  expect(f.joinVoice).toHaveBeenCalledWith('salon', 'Salon');
  // Someone is around, so the new-member card stays away; online friends are listed.
  expect(screen.queryByText('Tayfana hoş geldin')).toBeNull();
  expect(
    within(screen.getByRole('region', { name: 'Çevrimiçi arkadaşlar' })).getByText('Test Friend'),
  ).toBeTruthy();
});

it('never shows a voice room as pending when presence cannot be read', async () => {
  // The hook stays "loading" without a directory bridge; the card must not wait forever.
  f.directory = { rooms: [], loading: true, error: false };
  await mount('home');
  const voice = within(screen.getByRole('region', { name: 'Ses odaları' }));
  expect(voice.queryByText('Bakılıyor…')).toBeNull();
  expect(voice.queryByText('Boş')).toBeNull();
  expect(screen.getByText('Tayfana hoş geldin')).toBeTruthy();
});

it('welcomes a new member of a text-only community into the chat', async () => {
  f.directory = { rooms: [], loading: true, error: false };
  useCommunity.setState({
    channels: [{ id: 'general', spaceId: 'server', name: 'genel', type: 0, topic: null }],
  });
  await mount('home');
  expect(screen.queryByRole('region', { name: 'Ses odaları' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sohbete katıl' }));
  expect(path()).toBe('/chat');
  expect(openChannel).toHaveBeenCalledWith('general');
});

it('lists unread chats first and opens them on the chat page', async () => {
  useCommunity.setState({
    channels: [
      { id: 'general', spaceId: 'server', name: 'genel', type: 0, topic: null },
      { id: 'games', spaceId: 'server', name: 'oyunlar', type: 0, topic: null },
    ],
    unread: { games: true },
  });
  await mount('home');
  const chats = within(screen.getByRole('region', { name: 'Sohbetler' }));
  const rows = chats.getAllByRole('button');
  expect(rows[0]!.textContent).toContain('oyunlar');
  expect(chats.getByRole('img', { name: 'Okunmamış mesaj var' })).toBeTruthy();
  fireEvent.click(rows[0]!);
  expect(path()).toBe('/chat');
  expect(openChannel).toHaveBeenCalledWith('games');
  expect(f.joinVoice).not.toHaveBeenCalled();
});

it('greets a new member with a voice room to join and an invite', async () => {
  const open = await mount('home');
  expect(screen.getByText('Tayfana hoş geldin')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: 'Arkadaşını davet et' })[0]!);
  expect(open).toHaveBeenCalledWith('invite');
  fireEvent.click(screen.getByRole('button', { name: 'Bir ses odasına katıl' }));
  expect(path()).toBe('/voice');
  expect(f.joinVoice).toHaveBeenCalledWith('salon', 'Salon');
});

it('offers an invite link and community creation without any community', async () => {
  useCommunity.setState({ spaces: [], channels: [], activeSpaceId: null });
  const open = await mount('home');
  expect(screen.getByRole('heading', { name: 'Henüz bir topluluğun yok' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Topluluk oluştur' }));
  expect(open).toHaveBeenCalledWith('create-space');
  fireEvent.click(screen.getByRole('button', { name: 'Davet bağlantısı aç' }));
  expect(path()).toBe('/setup/invite');
});

it('shows the shared DM list on /messages and opens a conversation in chat', async () => {
  useCommunity.setState({
    dms: [
      {
        id: 'direct',
        spaceId: null,
        name: 'Test Friend',
        type: 1,
        topic: null,
        recipients: [me, peer],
        lastMessageId: null,
      },
    ],
    unread: { direct: true },
  });
  await mount('messages');
  expect(screen.getByRole('button', { name: 'Yeni özel mesaj' })).toBeTruthy();
  const list = within(screen.getByRole('navigation', { name: 'Özel mesajlar' }));
  expect(list.getByRole('img', { name: 'Okunmamış mesaj var' })).toBeTruthy();
  fireEvent.click(list.getByRole('button', { name: /Test Friend/ }));
  expect(path()).toBe('/chat');
  expect(openChannel).toHaveBeenCalledWith('direct');
  // The old list's stray "Arkadaşlar" button is gone.
  expect(screen.queryByRole('button', { name: 'Arkadaşlar' })).toBeNull();
});

it('points to friends from an empty /messages page', async () => {
  await mount('messages');
  expect(screen.getByRole('heading', { name: 'Henüz özel konuşma yok' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Arkadaşlarını aç' }));
  expect(path()).toBe('/friends');
});
