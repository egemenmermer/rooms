// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityCommand } from '../packages/activity-protocol/src';

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
let commands: ActivityCommand['type'][] = [];
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
  commands = [];
  sent = [];
});
afterEach(() => {
  cleanup();
  cleanups.forEach((clean) => clean());
  cleanups = [];
  resetGuideCache();
  vi.unstubAllGlobals();
});

function mount(
  variant: CommunityCinemaFixtureVariant,
  owner = variant !== 'member' && variant !== 'remote',
) {
  useCommunity.setState({
    user: { id: 'demo-deniz', username: 'deniz', displayName: 'Deniz', avatar: null },
    serverUrl: `https://cinema-${variant}-${Math.random()}`,
    activeSpaceId: FIXTURE_COMMUNITY_ID,
    activeChannelId: FIXTURE_HALL_ID,
    spaces: [
      {
        id: FIXTURE_COMMUNITY_ID,
        name: 'Bizim Oda',
        ownerId: owner ? 'demo-deniz' : 'demo-ece',
        icon: null,
      },
    ],
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
  const activity = createCommunityCinemaFixtureActivity(communityCinemaFixtureRoom(variant));
  const command = activity.command;
  activity.command = async (roomId, envelope) => {
    commands.push(envelope.command.type);
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

describe('community cinema hall', () => {
  it('asks the owner to set up a hall, and tells members it is not open yet', async () => {
    mount('no_hall');
    expect(await screen.findByText('Bir sinema salonu kur')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Salonu ayarla/ })).toBeTruthy();
    cleanup();
    mount('member');
    // A member sees the hall, but its catalog explains that the owner has not connected a source.
    fireEvent.click(await screen.findByRole('tab', { name: 'Canlı TV' }));
    expect(await screen.findByText('Sahip henüz bir kaynak bağlamadı')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bağlantıyı kur/ })).toBeNull();
  });

  it('offers the owner the IPTV connection when the hall has no source', async () => {
    mount('not_connected');
    fireEvent.click(await screen.findByRole('tab', { name: 'Canlı TV' }));
    expect(await screen.findByText('Sunucu IPTV’sini bağla')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bağlantıyı kur/ })).toBeTruthy();
  });

  it('greets an empty hall and opens a channel for everyone', async () => {
    mount('empty');
    expect(await screen.findByText('Bu akşam ne izliyoruz?')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Canlı TV' }));
    // One click on a channel tile opens it; the tile says so on hover.
    const option = await screen.findByRole('option', { name: /Show TV/ });
    expect(option.textContent).toContain('Salonda aç');
    fireEvent.click(option);
    await waitFor(() => expect(commands).toContain('queue.add'));
    // The first command takes a seat; then the hall starts and plays the channel.
    const steps = sent.filter((c) => c.type !== 'join');
    expect(steps.map((c) => c.type).slice(0, 2)).toEqual(['start', 'queue.add']);
    expect(steps[0]).toMatchObject({ type: 'start', activity: 'hall' });
    expect(steps[1]).toMatchObject({
      type: 'queue.add',
      start: true,
      media: { kind: 'community-media', ref: 'l-1002', title: 'Show TV', live: true },
    });
  });

  it('suggests instead of switching when the host holds the remote', async () => {
    mount('remote');
    fireEvent.click(await screen.findByRole('tab', { name: 'Canlı TV' }));
    const option = await screen.findByRole('option', { name: /Kanal D/ });
    expect(option.textContent).toContain('Sıraya öner');
    fireEvent.click(option);
    await waitFor(() => expect(sent.some((c) => c.type === 'queue.add')).toBe(true));
    const add = sent.find((c) => c.type === 'queue.add');
    expect(add).toMatchObject({ media: { ref: 'l-1003' } });
    expect(add && 'start' in add ? add.start : undefined).toBeUndefined();
  });

  it('zaps live channels from the keyboard and replaces the previous channel', async () => {
    mount('default');
    await screen.findAllByText('TRT 1');
    // Let the channel list arrive; zapping walks it.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    });
    // The OSD names the next channel at once; the hall switches when the presses settle.
    await waitFor(() =>
      expect(document.querySelector('.hall-osd')?.textContent).toContain('Show TV'),
    );
    await waitFor(() => expect(commands).toContain('queue.remove'), { timeout: 3000 });
    expect(sent.find((c) => c.type === 'queue.add')).toMatchObject({
      start: true,
      media: { ref: 'l-1002' },
    });
    expect(sent.find((c) => c.type === 'queue.remove')).toMatchObject({ itemId: 'demo-hall-1' });
  });

  it('explains a stream the hall cannot play', async () => {
    mount('error');
    expect(
      await screen.findByText(
        'Bu kanalın görüntü biçimi salonda oynatılamıyor. Başka bir kanal dene.',
        undefined,
        { timeout: 3000 },
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yeniden dene/ })).toBeTruthy();
  });

  it('recognises a pasted YouTube link in the ⌘K palette', async () => {
    mount('default');
    await screen.findAllByText('TRT 1');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Salonda aç' });
    const input = within(dialog).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    expect(within(dialog).getByText('YouTube videosu')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Enter' });
    await waitFor(() =>
      expect(sent.find((c) => c.type === 'queue.add')).toMatchObject({
        media: { kind: 'youtube', videoId: 'dQw4w9WgXcQ' },
        start: true,
      }),
    );
  });
});
