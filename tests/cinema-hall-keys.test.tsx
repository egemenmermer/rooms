// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityCommand, RoomSnapshot } from '../packages/activity-protocol/src';

vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({ participants: [], tracks: [], status: 'idle', channelId: null }),
}));
vi.mock('@rooms/media', () => ({ liveKitMediaProvider: {} }));
vi.mock('../apps/desktop/src/RealSocial', () => ({
  CommunityChat: () => <div>Salon sohbeti</div>,
}));

import CinemaHall from '../apps/desktop/src/cinema/CinemaHall';
import { installCinemaFixture } from '../apps/desktop/src/cinema/cinema-bridge';
import { resetGuideCache } from '../apps/desktop/src/cinema/guide-cache';
import {
  arrowTarget,
  controlTarget,
  seekNote,
  seekTarget,
} from '../apps/desktop/src/cinema/hall-model';
import { useCommunity } from '../apps/desktop/src/community';
import { installDevelopmentRuntime } from '../apps/desktop/src/runtime-sources';
import {
  communityCinemaFixtureRoom,
  createCommunityCinemaFixtureActivity,
  createCommunityCinemaFixtureBridge,
  fixtureArt,
  FIXTURE_COMMUNITY_ID,
  FIXTURE_HALL_ID,
  type CommunityCinemaFixtureVariant,
} from '../apps/desktop/src/dev/community-cinema-fixture';

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
let cleanups: (() => void)[] = [];
let sent: ActivityCommand[] = [];

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
});
afterEach(() => {
  cleanup();
  cleanups.forEach((clean) => clean());
  cleanups = [];
  resetGuideCache();
  vi.unstubAllGlobals();
});

function mount(variant: CommunityCinemaFixtureVariant, room?: RoomSnapshot) {
  useCommunity.setState({
    user: { id: 'demo-deniz', username: 'deniz', displayName: 'Deniz', avatar: null },
    serverUrl: `https://cinema-keys-${variant}-${Math.random()}`,
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
    ],
    openChannel: vi.fn(async () => {}),
  });
  const activity = createCommunityCinemaFixtureActivity(
    room ?? communityCinemaFixtureRoom(variant),
  );
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
    installCinemaFixture({ bridge: createCommunityCinemaFixtureBridge(variant), art: fixtureArt }),
  );
  return render(
    <MemoryRouter>
      <CinemaHall notify={vi.fn()} />
    </MemoryRouter>,
  );
}

const osd = () => document.querySelector('.hall-osd')?.textContent ?? '';
const playback = () => sent.filter((c) => c.type === 'playback');
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 600)));

describe('hall key targets', () => {
  it('lets a focused button or tab keep the arrows for the screen, but not a slider or menu', () => {
    document.body.innerHTML = `
      <button id="play">Oynat</button>
      <div role="tablist"><button role="tab" id="tab">Salon</button></div>
      <input type="range" id="range" />
      <div role="slider" id="slider"></div>
      <div role="menu"><button role="menuitemradio" id="pick">Türkçe</button></div>
      <div role="listbox"><div role="option" id="option">Kanal</div></div>`;
    const target = (id: string) => document.getElementById(id);
    expect(arrowTarget(target('play'))).toBe(false);
    expect(arrowTarget(target('tab'))).toBe(false);
    expect(arrowTarget(target('slider'))).toBe(true);
    expect(arrowTarget(target('pick'))).toBe(true);
    expect(arrowTarget(target('option'))).toBe(true);
    // Space still belongs to the focused button: it presses it.
    expect(controlTarget(target('play'))).toBe(true);
    document.body.innerHTML = '';
  });

  it('keeps a keyboard seek inside the film and names where it lands', () => {
    expect(seekTarget(-4, 5400)).toBe(0);
    expect(seekTarget(5412, 5400)).toBe(5399);
    expect(seekTarget(1280, null)).toBe(1280);
    expect(seekNote(20, 1280)).toBe('20 sn ileri · 21:20');
    expect(seekNote(-10, 3725)).toBe('10 sn geri · 1:02:05');
  });
});

describe('film remote keys in the hall', () => {
  it('seeks the film for everyone even right after a control button was clicked', async () => {
    mount('vod');
    const pause = await screen.findByRole('button', { name: 'Herkes için duraklat' });
    pause.focus();
    fireEvent.keyDown(pause, { key: 'ArrowRight' });
    fireEvent.keyDown(pause, { key: 'ArrowRight' });
    // Presses add up on the screen first …
    await waitFor(() => expect(osd()).toContain('20 sn ileri'));
    expect(playback()).toHaveLength(0);
    // … then one remote-gated seek reaches the hall.
    await waitFor(() => expect(playback()).toHaveLength(1));
    const [seek] = playback();
    expect(seek).toMatchObject({ type: 'playback', playing: true, rate: 1 });
    const position = seek && 'positionSec' in seek ? seek.positionSec : 0;
    expect(position).toBeGreaterThanOrEqual(1279);
    expect(position).toBeLessThan(1290);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    await waitFor(() => expect(osd()).toContain('10 sn geri'));
    await waitFor(() => expect(playback()).toHaveLength(2));
  });

  it('leaves the arrows to the position slider and to open menus', async () => {
    mount('vod');
    const slider = await screen.findByRole('slider', { name: 'Konum' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    await settle();
    expect(playback()).toHaveLength(0);
    expect(osd()).toBe('');
  });

  it('explains instead of seeking when the host holds the remote', async () => {
    const room = communityCinemaFixtureRoom('vod');
    room.primary = { ...room.primary!, controlMode: 'host', controllers: [] };
    mount('vod', room);
    await screen.findAllByText('Mavi Saat');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await waitFor(() => expect(osd()).toContain('Kumanda ev sahibinde'));
    await settle();
    expect(playback()).toHaveLength(0);
  });

  it('says a live channel cannot be rewound', async () => {
    mount('default');
    await screen.findAllByText('TRT 1');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    await waitFor(() => expect(osd()).toContain('sarılamaz'));
    await settle();
    expect(playback()).toHaveLength(0);
  });
});
