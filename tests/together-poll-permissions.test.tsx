// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RoomSnapshot } from '@rooms/activity-protocol';
const native = vi.hoisted(() => ({ snapshot: vi.fn(), command: vi.fn() }));
vi.mock('../apps/desktop/src/runtime-sources', () => ({
  activityBridge: () => native,
  developmentActivityState: () => null,
}));
vi.mock('../apps/desktop/src/Agent', () => ({ useCurrentRoom: () => 'poll-room' }));
vi.mock('../apps/desktop/src/Whiteboard', () => ({ default: () => null }));
vi.mock('../apps/desktop/src/MusicDJ', () => ({ openRoomActivity: vi.fn() }));
import { useCommunity } from '../apps/desktop/src/community';
import Together from '../apps/desktop/src/Together';

const room = (participants: RoomSnapshot['participants']) =>
  ({
    roomId: 'poll-room',
    revision: 3,
    participants,
    primary: null,
    queue: [],
    polls: [],
    whiteboard: [],
    timeline: {},
  }) as unknown as RoomSnapshot;
const self = (canCreate: boolean) => ({
  userId: 'owner',
  displayName: 'Owner',
  joinedAt: 1,
  lastSeenAt: 1,
  canControl: true,
  canCreate,
});

beforeEach(() => {
  act(() =>
    useCommunity.setState({
      user: { id: 'owner', username: 'Owner', displayName: 'Owner', avatar: null },
      serverUrl: 'https://server',
      channels: [],
    }),
  );
});
afterEach(() => {
  cleanup();
  act(() => useCommunity.setState({ user: null, serverUrl: '' }));
  native.snapshot.mockReset();
  native.command.mockReset();
});

it('offers poll creation before the viewer has joined the activity room', async () => {
  // The service prunes idle participants and the client joins only when it sends a command,
  // so a fresh or idle room has no participant record for the viewer yet.
  native.snapshot.mockResolvedValue({ room: room([]), serverTimeMs: Date.now() });
  render(
    <MemoryRouter>
      <Together />
    </MemoryRouter>,
  );
  await screen.findByText('0 oda katılımcısı');
  // Both the header button and the empty-state call to action open the form.
  const buttons = screen.getAllByRole('button', { name: 'Yeni anket' }) as HTMLButtonElement[];
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button.title).toBe('');
    expect(button.disabled).toBe(false);
  }
});

it('joins the activity room before creating the poll', async () => {
  native.snapshot.mockResolvedValue({ room: room([]), serverTimeMs: Date.now() });
  native.command.mockResolvedValue({ room: room([self(true)]), serverTimeMs: Date.now() });
  render(
    <MemoryRouter>
      <Together />
    </MemoryRouter>,
  );
  await screen.findByText('0 oda katılımcısı');
  fireEvent.click(screen.getAllByRole('button', { name: 'Yeni anket' })[0]);
  fireEvent.change(screen.getByLabelText('Soru'), { target: { value: 'Ne izleyelim?' } });
  fireEvent.change(screen.getByLabelText('Seçenek 1'), { target: { value: 'Film' } });
  fireEvent.change(screen.getByLabelText('Seçenek 2'), { target: { value: 'Dizi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Anketi başlat' }));
  await waitFor(() => expect(native.command).toHaveBeenCalledTimes(2));
  expect(native.command.mock.calls.map(([, envelope]) => envelope.command.type)).toEqual([
    'join',
    'poll.create',
  ]);
});

it('explains when the service reports that the viewer cannot create polls', async () => {
  native.snapshot.mockResolvedValue({ room: room([self(false)]), serverTimeMs: Date.now() });
  render(
    <MemoryRouter>
      <Together />
    </MemoryRouter>,
  );
  await screen.findByText('1 oda katılımcısı');
  const buttons = screen.getAllByRole('button', { name: 'Yeni anket' }) as HTMLButtonElement[];
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Bu odada anket oluşturma yetkin yok.');
  }
});
