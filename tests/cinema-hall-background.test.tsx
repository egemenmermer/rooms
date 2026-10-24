// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import type { ActivityCommand } from '../packages/activity-protocol/src';

vi.mock('../apps/desktop/src/realtime', () => ({
  useVoiceRejoin: (select: (state: { rejoin: null }) => unknown) => select({ rejoin: null }),
  useRealtime: () => ({ participants: [], tracks: [], status: 'idle', channelId: null }),
}));
vi.mock('@rooms/media', () => ({ liveKitMediaProvider: {} }));
vi.mock('../apps/desktop/src/RealSocial', () => ({
  CommunityChat: () => <div>Salon sohbeti</div>,
}));

import CinemaHall from '../apps/desktop/src/cinema/CinemaHall';
import { HallBackground } from '../apps/desktop/src/cinema/HallBackground';
import {
  hallPageClosed,
  hallPageOpened,
  registerHallBackgroundHost,
  stopHallBackground,
  useHallBackground,
} from '../apps/desktop/src/cinema/hall-background';
import { installCinemaFixture } from '../apps/desktop/src/cinema/cinema-bridge';
import { resetGuideCache } from '../apps/desktop/src/cinema/guide-cache';
import { useCommunity } from '../apps/desktop/src/community';
import { installDevelopmentRuntime } from '../apps/desktop/src/runtime-sources';
import {
  communityCinemaFixtureRoom,
  createCommunityCinemaFixtureActivity,
  createCommunityCinemaFixtureBridge,
  fixtureArt,
  FIXTURE_COMMUNITY_ID,
  FIXTURE_HALL_ID,
} from '../apps/desktop/src/dev/community-cinema-fixture';

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
let cleanups: (() => void)[] = [];
let sent: ActivityCommand[] = [];

function signIn() {
  useCommunity.setState({
    user: { id: 'demo-deniz', username: 'deniz', displayName: 'Deniz', avatar: null },
    serverUrl: `https://cinema-background-${Math.random()}`,
    activeSpaceId: FIXTURE_COMMUNITY_ID,
    activeChannelId: FIXTURE_HALL_ID,
    spaces: [{ id: FIXTURE_COMMUNITY_ID, name: 'Bizim Oda', ownerId: 'demo-deniz', icon: null }],
    channels: [
      {
        id: FIXTURE_HALL_ID,
        spaceId: FIXTURE_COMMUNITY_ID,
        name: 'film-gecesi',
        type: 0,
        topic: null,
      },
      { id: 'voice-1', spaceId: FIXTURE_COMMUNITY_ID, name: 'Sohbet', type: 2, topic: null },
    ],
    openChannel: vi.fn(async () => {}),
  });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
  localStorage.clear();
  sent = [];
  signIn();
});
afterEach(() => {
  cleanup();
  cleanups.forEach((clean) => clean());
  cleanups = [];
  resetGuideCache();
  stopHallBackground();
  vi.unstubAllGlobals();
});

describe('who keeps the hall on screen', () => {
  it('lets the corner keep a seat only when someone watches and a shell can show it', () => {
    expect(hallPageClosed(FIXTURE_HALL_ID, true)).toBe(false);
    const unregister = registerHallBackgroundHost();
    hallPageOpened();
    expect(hallPageClosed(FIXTURE_HALL_ID, false)).toBe(false);
    expect(useHallBackground.getState().hallId).toBeNull();
    hallPageOpened();
    expect(hallPageClosed(FIXTURE_HALL_ID, true)).toBe(true);
    expect(useHallBackground.getState()).toMatchObject({ pages: 0, hallId: FIXTURE_HALL_ID });
    // The page coming back takes the screen.
    hallPageOpened();
    expect(useHallBackground.getState()).toMatchObject({ pages: 1, hallId: null });
    hallPageClosed(FIXTURE_HALL_ID, true);
    // Another account never inherits the seat.
    act(() => useCommunity.setState({ user: null }));
    expect(useHallBackground.getState().hallId).toBeNull();
    unregister();
  });
});

function Shell() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/voice')}>Sohbet odasına gir</button>
      <Routes>
        <Route path="/cinema" element={<CinemaHall notify={vi.fn()} />} />
        <Route path="/voice" element={<p>Ses odası</p>} />
      </Routes>
      <HallBackground notify={vi.fn()} />
    </>
  );
}

function mount(withShell = true, strict = false) {
  const activity = createCommunityCinemaFixtureActivity(communityCinemaFixtureRoom('vod'));
  const command = activity.command;
  activity.command = async (roomId, envelope) => {
    sent.push(envelope.command);
    return command(roomId, envelope);
  };
  cleanups.push(
    installDevelopmentRuntime({
      mediaProvider: {} as never,
      mediaBridge: {} as never,
      activityBridge: activity,
    }),
    installCinemaFixture({ bridge: createCommunityCinemaFixtureBridge('vod'), art: fixtureArt }),
  );
  const tree = (
    <MemoryRouter initialEntries={['/cinema']}>
      {withShell ? <Shell /> : <ShellWithoutCorner />}
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function ShellWithoutCorner() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/voice')}>Sohbet odasına gir</button>
      <Routes>
        <Route path="/cinema" element={<CinemaHall notify={vi.fn()} />} />
        <Route path="/voice" element={<p>Ses odası</p>} />
      </Routes>
    </>
  );
}

const types = () => sent.map((c) => c.type);

describe('the hall while the person talks in a voice room', () => {
  it('keeps the film playing in a corner on the same seat, and gives the screen back', async () => {
    mount();
    await screen.findByRole('button', { name: 'Herkes için duraklat' });
    await waitFor(() => expect(types()).toContain('join'));
    fireEvent.click(screen.getByRole('button', { name: 'Sohbet odasına gir' }));
    expect(await screen.findByText('Ses odası')).toBeTruthy();
    const corner = await screen.findByRole('region', { name: 'Sinema küçük oynatıcı' });
    expect(corner.textContent).toContain('Mavi Saat');
    // Still seated: the hall counts this person as watching.
    expect(types()).not.toContain('leave');
    // The corner's own keys never act for the hall from another page.
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(types()).not.toContain('playback');
    // Back to the hall: the page takes the screen and the seat.
    fireEvent.click(screen.getByRole('button', { name: 'Sahneyi büyüt' }));
    await screen.findByRole('button', { name: 'Herkes için duraklat' });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Sinema küçük oynatıcı' })).toBeNull(),
    );
    expect(types()).not.toContain('leave');
  });

  it('gives up the seat when the person closes the corner', async () => {
    mount();
    await screen.findByRole('button', { name: 'Herkes için duraklat' });
    await waitFor(() => expect(types()).toContain('join'));
    fireEvent.click(screen.getByRole('button', { name: 'Sohbet odasına gir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Küçük oynatıcıyı kapat' }));
    await waitFor(() => expect(types()).toContain('leave'));
    expect(screen.queryByRole('region', { name: 'Sinema küçük oynatıcı' })).toBeNull();
  });

  it('keeps the seat when React re-runs the corner effects (development)', async () => {
    mount(true, true);
    await screen.findByRole('button', { name: 'Herkes için duraklat' });
    await waitFor(() => expect(types()).toContain('join'));
    fireEvent.click(screen.getByRole('button', { name: 'Sohbet odasına gir' }));
    await screen.findByRole('region', { name: 'Sinema küçük oynatıcı' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(types()).not.toContain('leave');
  });

  it('leaves the seat with the page where no shell can show the corner', async () => {
    mount(false);
    await screen.findByRole('button', { name: 'Herkes için duraklat' });
    await waitFor(() => expect(types()).toContain('join'));
    fireEvent.click(screen.getByRole('button', { name: 'Sohbet odasına gir' }));
    await waitFor(() => expect(types()).toContain('leave'));
  });
});
