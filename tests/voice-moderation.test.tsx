// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const f = vi.hoisted(() => ({
  snapshot: {
    status: 'connected',
    channelId: 'hall',
    roomName: 'Salon',
    muted: false,
    camera: false,
    sharing: false,
    deafened: false,
    participants: [
      { id: 'me', name: 'Ben', muted: false, volume: 1 },
      { id: 'ece', name: 'Ece', muted: false, volume: 1 },
    ],
    tracks: [],
    busy: false,
    error: null,
  },
}));
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => f.snapshot,
  joinVoice: vi.fn(),
  leaveVoice: vi.fn(),
  toggleMic: vi.fn(),
  toggleDeafen: vi.fn(),
  toggleCamera: vi.fn(),
  startRoomAudio: vi.fn(),
  stopScreen: vi.fn(),
}));
vi.mock('../apps/desktop/src/voice-directory', () => ({
  useVoiceDirectory: () => ({ rooms: [], loading: false, error: null }),
}));
vi.mock('../apps/desktop/src/Soundboard', () => ({ SoundboardButton: () => null }));
vi.mock('../apps/desktop/src/activity', () => ({ useActivityRoom: () => ({ room: null }) }));
import { MinimalSidebar } from '../apps/desktop/src/MinimalSidebar';
import { useCommunity } from '../apps/desktop/src/community';
import { queryClient } from '../apps/desktop/src/query-client';

const bridge = {
  moderate: vi.fn(async () => {}),
  capabilities: vi.fn(async () => ({
    manageServer: false,
    manageChannels: false,
    manageRoles: false,
    managePermissions: false,
    assignRoles: false,
    kickMembers: true,
    moveMembers: true,
    banMembers: false,
  })),
};
afterEach(() => {
  cleanup();
  queryClient.clear();
});
beforeEach(() => {
  bridge.moderate.mockClear();
  (window as { rooms?: unknown }).rooms = {
    social: {
      communityCapabilities: bridge.capabilities,
      removeCommunityMember: vi.fn(),
      avatar: vi.fn(async () => null),
    },
    media: { moderate: bridge.moderate },
  };
  useCommunity.setState({
    user: { id: 'me', username: 'me', displayName: 'Ben', avatar: null },
    serverUrl: 'https://local.example',
    activeSpaceId: 'server',
    activeChannelId: null,
    channels: [
      { id: 'hall', spaceId: 'server', name: 'Salon', type: 2, topic: null },
      { id: 'lounge', spaceId: 'server', name: 'Bahçe', type: 2, topic: null },
    ],
    spaces: [{ id: 'server', name: 'Server', ownerId: 'me', icon: null }],
  });
});
const notify = vi.fn();
async function mount() {
  render(
    <MemoryRouter initialEntries={['/voice']}>
      <MinimalSidebar
        notify={notify}
        invite={() => {}}
        createSpace={() => {}}
        editSpace={() => {}}
        search={() => {}}
        help={() => {}}
      />
    </MemoryRouter>,
  );
  await waitFor(() => expect(bridge.capabilities).toHaveBeenCalledWith('server'));
  await act(async () => {});
}
const occupant = (id: string) =>
  document.querySelector(`[data-voice-participant-id="${id}"]`) as HTMLElement;

it('offers only the moderation this account may do, and never on yourself', async () => {
  await mount();
  fireEvent.contextMenu(occupant('me'));
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.contextMenu(occupant('ece'), { clientX: 40, clientY: 60 });
  const menu = screen.getByRole('menu', { name: 'Ece için işlemler' });
  const items = [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
  expect(items).toEqual(['Profili aç', 'Bahçe', 'Sesten çıkar', 'Topluluktan çıkar']);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Bahçe' }));
  await waitFor(() =>
    expect(bridge.moderate).toHaveBeenCalledWith({
      channelId: 'hall',
      userId: 'ece',
      action: 'move',
      targetChannelId: 'lounge',
    }),
  );
  expect(notify).toHaveBeenCalledWith('Ece, Bahçe odasına taşındı.');
});

it('asks before disconnecting someone from voice', async () => {
  await mount();
  fireEvent.contextMenu(occupant('ece'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sesten çıkar' }));
  expect(bridge.moderate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sesten çıkar' }));
  await waitFor(() =>
    expect(bridge.moderate).toHaveBeenCalledWith({
      channelId: 'hall',
      userId: 'ece',
      action: 'disconnect',
    }),
  );
});

it('moves someone by dragging them onto another room', async () => {
  await mount();
  expect(occupant('me').getAttribute('draggable')).toBe('false');
  expect(occupant('ece').getAttribute('draggable')).toBe('true');
  const data = new Map<string, string>();
  const dataTransfer = {
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: '',
    dropEffect: '',
  };
  fireEvent.dragStart(occupant('ece'), { dataTransfer });
  const lounge = document.querySelector('[data-channel-id="lounge"]')!.parentElement!;
  fireEvent.dragOver(lounge, { dataTransfer });
  expect(lounge.className).toContain('voice-drop-target');
  fireEvent.drop(lounge, { dataTransfer });
  await waitFor(() =>
    expect(bridge.moderate).toHaveBeenCalledWith({
      channelId: 'hall',
      userId: 'ece',
      action: 'move',
      targetChannelId: 'lounge',
    }),
  );
  expect(lounge.className).not.toContain('voice-drop-target');
});

it('shows no moderation to someone without rights', async () => {
  bridge.capabilities.mockResolvedValueOnce({
    manageServer: false,
    manageChannels: false,
    manageRoles: false,
    managePermissions: false,
    assignRoles: false,
    kickMembers: false,
    moveMembers: false,
    banMembers: false,
  });
  await mount();
  expect(occupant('ece').getAttribute('draggable')).toBe('false');
  fireEvent.contextMenu(occupant('ece'));
  expect(screen.queryByRole('menu')).toBeNull();
});
