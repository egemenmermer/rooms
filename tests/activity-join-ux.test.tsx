// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
const f = vi.hoisted(() => ({
  voice: {
    status: 'connected',
    channelId: 'room',
    roomName: 'DARK WEB',
    muted: false,
    camera: false,
    sharing: false,
    deafened: false,
    participants: [] as Record<string, unknown>[],
    tracks: [],
    busy: false,
    error: null,
  },
  activity: {
    status: 'connected',
    room: null as Record<string, unknown> | null,
    busy: false,
    error: null,
    serverOffsetMs: 0,
    send: vi.fn(),
    refresh: vi.fn(),
    clearError: vi.fn(),
  },
}));
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => f.voice,
  joinVoice: vi.fn(),
  leaveVoice: vi.fn(),
  toggleMic: vi.fn(),
  toggleDeafen: vi.fn(),
  toggleCamera: vi.fn(),
  startRoomAudio: vi.fn(),
  stopScreen: vi.fn(),
}));
vi.mock('../apps/desktop/src/activity', () => ({ useActivityRoom: () => f.activity }));
vi.mock('../apps/desktop/src/MusicDJ', () => ({
  openRoomActivity: (path: string, navigate: (path: string) => void) => navigate(path),
}));
vi.mock('../apps/desktop/src/voice-directory', () => ({ useVoiceDirectory: () => ({}) }));
vi.mock('../apps/desktop/src/Soundboard', () => ({ SoundboardButton: () => null }));
import { ActivityLauncher } from '../apps/desktop/src/Activities';
import { MinimalSidebar } from '../apps/desktop/src/MinimalSidebar';
import { PushToTalkNotice } from '../apps/desktop/src/PushToTalk';
import { useCommunity } from '../apps/desktop/src/community';
import { useRooms } from '../apps/desktop/src/store';

const person = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  local: id === 'me',
  muted: false,
  deafened: false,
  speaking: false,
  camera: false,
  screen: false,
  volume: 1,
  quality: 'excellent',
  ...extra,
});
const watchTogether = (participants: string[]) => ({
  roomId: 'room',
  revision: 3,
  participants: participants.map((userId) => ({
    userId,
    displayName: userId,
    canControl: true,
    canCreate: true,
    joinedAt: 1,
    lastSeenAt: 1,
  })),
  primary: {
    activity: 'youtube',
    title: 'Birlikte izle',
    hostUserId: 'egemen',
    startedAt: 1,
    state: 'live',
  },
  timeline: {
    playing: true,
    positionSec: 0,
    rate: 1,
    effectiveServerTimeMs: 1,
    epoch: 1,
    itemId: null,
  },
  queue: [],
  polls: [],
  whiteboard: [],
});
function Route() {
  const location = useLocation();
  return <output data-testid="route">{location.pathname + location.search}</output>;
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  f.voice.participants = [];
  f.activity.room = null;
  useCommunity.setState({
    user: { id: 'me', username: 'me', displayName: 'Me', avatar: null },
    serverUrl: 'https://local.example',
    activeSpaceId: 'server',
    activeChannelId: 'room',
    channels: [{ id: 'room', name: 'DARK WEB', type: 2 } as any],
    spaces: [{ id: 'server', name: 'Server', ownerId: 'me', icon: null }],
  });
});
const launcher = () =>
  render(
    <MemoryRouter initialEntries={['/voice']}>
      <ActivityLauncher onClose={() => {}} />
      <Route />
    </MemoryRouter>,
  );
const sidebar = () =>
  render(
    <MemoryRouter initialEntries={['/voice']}>
      <MinimalSidebar
        notify={() => {}}
        invite={() => {}}
        createSpace={() => {}}
        editSpace={() => {}}
        search={() => {}}
        help={() => {}}
      />
      <Route />
    </MemoryRouter>,
  );

it('lets a newcomer join a running activity in one click without end-for-everyone text', () => {
  f.activity.room = watchTogether(['egemen']);
  launcher();
  expect(screen.queryByText(/herkes adına bitir/)).toBeNull();
  expect(screen.queryByRole('button', { name: /Bitir ve etkinlik seç/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Etkinliği bitir' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Kıraathane' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Katıl' }));
  expect(screen.getByTestId('route').textContent).toBe('/cinema');
});

it('keeps ending the shared player for the host only', () => {
  useCommunity.setState({
    user: { id: 'egemen', username: 'egemen', displayName: 'egemen', avatar: null },
  });
  f.activity.room = watchTogether(['egemen']);
  launcher();
  expect(screen.getByRole('button', { name: 'Aç' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Etkinliği bitir' }));
  expect(f.activity.send).toHaveBeenCalledWith({ type: 'end' });
});

it('does not offer the DJ as an activity; it already has its own button', () => {
  f.activity.room = { ...watchTogether([]), primary: null };
  launcher();
  expect(screen.getByRole('button', { name: /Birlikte izle/ })).toBeTruthy();
  expect(screen.queryByText('Ses odasına müzik botu çağır.')).toBeNull();
});

it('shows the running activity under the joined room and opens it from the sidebar', () => {
  f.voice.participants = [person('me', 'Me'), person('egemen', 'egemen')];
  f.activity.room = watchTogether(['egemen']);
  sidebar();
  fireEvent.click(screen.getByRole('button', { name: /Birlikte izle sürüyor, 1 kişi\. Katıl/ }));
  expect(screen.getByTestId('route').textContent).toBe('/cinema');
});

it('marks a person this listener silenced and drops their speaking ring', () => {
  f.voice.participants = [
    person('me', 'Me'),
    person('rooms-music-dj', 'DJ Recep', { speaking: true, volume: 0 }),
    person('sems', 'sems', { speaking: true }),
  ];
  sidebar();
  const dj = document.querySelector('[data-voice-participant-id="rooms-music-dj"]')!;
  const sems = document.querySelector('[data-voice-participant-id="sems"]')!;
  expect(dj.className).not.toContain('speaking');
  expect(dj.querySelector('[aria-label="Sesini kapattın, yalnızca sende"]')).not.toBeNull();
  expect(sems.className).toContain('speaking');
  expect(sems.querySelector('[aria-label="Sesini kapattın, yalnızca sende"]')).toBeNull();
});

it('shows both the muted and the deafened icon for a deafened person', () => {
  f.voice.participants = [
    person('me', 'Me'),
    person('ece', 'Ece', { deafened: true, muted: true }),
    person('can', 'Can', { muted: true }),
  ];
  sidebar();
  const ece = document.querySelector('[data-voice-participant-id="ece"]')!;
  const can = document.querySelector('[data-voice-participant-id="can"]')!;
  expect(ece.querySelector('[aria-label="Mikrofon kapalı"]')).not.toBeNull();
  expect(ece.querySelector('[aria-label="Sağırlaştırdı"]')).not.toBeNull();
  expect(can.querySelector('[aria-label="Mikrofon kapalı"]')).not.toBeNull();
  expect(can.querySelector('[aria-label="Sağırlaştırdı"]')).toBeNull();
});

it('names the chosen push-to-talk key in the room hint', () => {
  const previous = useRooms.getState().preferences;
  useRooms.setState({ preferences: { ...previous, pushToTalkKey: 'Alt+KeyV' } });
  render(<PushToTalkNotice />);
  expect(screen.getByText(/Bas konuş açık/).textContent).not.toContain('Space');
  expect(screen.getByText(/Bas konuş açık/).textContent).toMatch(/V$/);
  useRooms.setState({ preferences: previous });
});
