// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { PersonalMedia } from '../apps/desktop/src/PersonalMedia';
import { CurrentProgram, addedDate, resumeLabel } from '../apps/desktop/src/PersonalMediaMetadata';
import { useCommunity } from '../apps/desktop/src/community';
import { usePersonalPlayback } from '../apps/desktop/src/personal-playback';
import type {
  PersonalGuide,
  PersonalLibraryItem,
  ProviderBridge,
  ProviderConnection,
} from '../apps/desktop/electron/provider-contracts';

const original = useCommunity.getState();
const playlist: ProviderConnection = {
  id: '00000000-0000-4000-8000-000000000033',
  type: 'playlist',
  name: 'Own channels',
  status: 'connected',
  channelCount: 50,
};
const rd: ProviderConnection = {
  id: '00000000-0000-4000-8000-000000000037',
  type: 'real-debrid',
  name: 'Own RD',
  status: 'connected',
  channelCount: 0,
};
const channels = Array.from({ length: 50 }, (_, i) => ({
  id: `channel-${i}`,
  name: `Own channel ${i}`,
  group: 'Own group',
  favorite: false,
}));
const current = {
  title: 'Actual programme',
  description: 'Actual guide',
  startsAt: new Date(Date.now() - 60000).toISOString(),
  endsAt: new Date(Date.now() + 60000).toISOString(),
};
const item: PersonalLibraryItem = {
  id: 'own-item',
  name: 'Own title',
  size: 1024,
  mime: 'video/mp4',
  addedAt: '2026-10-08T18:00:00.000Z',
  resumeAt: 83,
};
beforeEach(() =>
  useCommunity.setState({
    user: { id: 'owner', username: 'owner', displayName: 'Owner', avatar: null },
    serverUrl: 'https://social.example.test',
    status: 'connected',
  }),
);
afterEach(() => {
  cleanup();
  useCommunity.setState(original, true);
  usePersonalPlayback.setState({ session: null });
  delete window.rooms;
  vi.restoreAllMocks();
});
function mount(
  connections: ProviderConnection[],
  overrides: Partial<ProviderBridge> = {},
  view: 'home' | 'channels' | 'library' = 'home',
) {
  const bridge = {
    status: vi.fn(async () => connections),
    channels: vi.fn(async () => channels),
    guide: vi.fn(async () => ({ status: 'available', programs: { 'channel-0': [current] } })),
    rdLibrary: vi.fn(async () => [item]),
    rdPlay: vi.fn(async () => ({
      url: 'rooms-provider://00000000-0000-4000-8000-000000000099/stream',
      name: item.name,
      mime: item.mime,
      live: false,
      startAt: item.resumeAt,
    })),
    ...overrides,
  } as unknown as ProviderBridge;
  window.rooms = { providers: bridge } as unknown as NonNullable<Window['rooms']>;
  const result = render(
    <MemoryRouter>
      <PersonalMedia notify={vi.fn()} initialView={view} />
    </MemoryRouter>,
  );
  return { bridge, ...result };
}
describe('real private guide and library projection', () => {
  it('keeps browse controls accessible for an old player URL without a session', async () => {
    window.rooms = { providers: { status: vi.fn(async () => []) } } as unknown as NonNullable<
      Window['rooms']
    >;
    const { container } = render(
      <MemoryRouter initialEntries={['/media?player=1']}>
        <PersonalMedia notify={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Kişisel medya' });
    expect(container.querySelector('section')?.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('section')?.getAttribute('aria-hidden')).toBe('false');
  });
  it.each(['channels', 'library'] as const)(
    'restores the same selected connection after player navigation to %s',
    async (view) => {
      const connection = view === 'channels' ? playlist : rd;
      window.rooms = {
        providers: {
          status: vi.fn(async () => [connection]),
          channels: vi.fn(async () => channels),
          rdLibrary: vi.fn(async () => [item]),
        },
      } as unknown as NonNullable<Window['rooms']>;
      const browse = `/media?view=${view}&connection=${connection.id}`;
      function Navigation() {
        const navigate = useNavigate();
        return (
          <>
            <button onClick={() => navigate('/media?player=1')}>Open player route</button>
            <button onClick={() => navigate(browse)}>Return to browse</button>
            <PersonalMedia notify={vi.fn()} />
          </>
        );
      }
      render(
        <MemoryRouter initialEntries={[browse]}>
          <Navigation />
        </MemoryRouter>,
      );
      const content = view === 'channels' ? 'Own channel 0' : 'Own title';
      await screen.findByText(content);
      fireEvent.click(screen.getByRole('button', { name: 'Open player route' }));
      await screen.findByRole('heading', { name: 'Kişisel medya' });
      fireEvent.click(screen.getByRole('button', { name: 'Return to browse' }));
      await screen.findByText(content);
      expect(screen.queryByRole('heading', { name: 'Kişisel medya' })).toBeNull();
    },
  );
  it('requests at most 32 owned channel IDs and displays only actual current programme progress', async () => {
    const { bridge } = mount([playlist], {}, 'channels');
    await screen.findByText('Actual programme');
    expect(bridge.guide).toHaveBeenCalledOnce();
    expect(bridge.guide).toHaveBeenCalledWith(
      playlist.id,
      channels.slice(0, 32).map((channel) => channel.id),
    );
    expect(
      screen
        .getByRole('progressbar', { name: 'Actual programme yayın ilerlemesi' })
        .getAttribute('max'),
    ).toBe('1');
    expect(screen.getAllByText('Own group').length).toBeGreaterThan(0);
  });
  it('preserves channels when guide fetch fails and reports unavailable without invented programmes', async () => {
    mount(
      [playlist],
      {
        guide: vi.fn(async () => {
          throw new Error('Private guide unavailable');
        }),
      },
      'channels',
    );
    await screen.findByText('Program rehberi alınamadı.');
    expect(screen.getByText('Own channel 49')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
  it('shows an absent-guide reason while keeping playback controls present', async () => {
    mount(
      [playlist],
      { guide: vi.fn(async () => ({ status: 'not-configured' as const, programs: {} })) },
      'channels',
    );
    await screen.findByText('Bu bağlantıda program rehberi yok.');
    expect(screen.getAllByRole('button', { name: 'İzle' })).toHaveLength(50);
  });
  it('discards a guide result when navigation leaves channel browsing', async () => {
    let resolve!: (value: PersonalGuide) => void;
    mount(
      [playlist],
      {
        guide: vi.fn(
          () =>
            new Promise<PersonalGuide>((r) => {
              resolve = r;
            }),
        ),
      },
      'channels',
    );
    await screen.findByText('Own channel 0');
    fireEvent.click(screen.getByRole('button', { name: 'Kişisel medyaya dön' }));
    await act(async () => resolve({ status: 'available', programs: { 'channel-0': [current] } }));
    expect(screen.queryByText('Actual programme')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Kişisel medya' })).toBeTruthy();
  });
  it('returns only actual positive saved positions on Home and starts its owned native source', async () => {
    const { bridge } = mount([rd], {
      rdLibrary: vi.fn(async () => [
        item,
        { ...item, id: 'no-resume', name: 'Unwatched', resumeAt: 0 },
        { ...item, id: 'invalid-resume', name: 'Invalid', resumeAt: Infinity },
      ]),
    });
    const card = await screen.findByRole('button', { name: /Own title 01:23 kayıtlı/ });
    expect(screen.queryByText('Unwatched')).toBeNull();
    expect(screen.queryByText('Invalid')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(bridge.rdPlay).not.toHaveBeenCalled();
    fireEvent.click(card);
    await waitFor(() =>
      expect(usePersonalPlayback.getState().session?.ownerServerUrl).toBe(
        'https://social.example.test',
      ),
    );
    expect(bridge.rdPlay).toHaveBeenCalledWith('own-item');
    expect(usePersonalPlayback.getState().session?.connectionId).toBe(rd.id);
  });
  it('does not request RD metadata for a missing or unreachable account', async () => {
    const { bridge } = mount([{ ...rd, status: 'error' }]);
    await screen.findByText('Kayıtlı izleme konumları alınamadı.');
    expect(bridge.rdLibrary).not.toHaveBeenCalled();
  });
  it('renders genuine added date and saved position, keeping size and format in details', async () => {
    mount([rd], {}, 'library');
    await screen.findByText('Own title');
    expect(screen.getByRole('columnheader', { name: 'EKLENME' })).toBeTruthy();
    expect(screen.getByText('01:23 kayıtlı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
    expect(screen.getByText('İzleme konumu')).toBeTruthy();
    expect(screen.getByText(/video\/mp4/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
  it('omits late prior-account resume metadata', async () => {
    let resolve!: (items: PersonalLibraryItem[]) => void;
    let first = true;
    mount([rd], {
      rdLibrary: vi.fn(() =>
        first
          ? ((first = false),
            new Promise<PersonalLibraryItem[]>((r) => {
              resolve = r;
            }))
          : Promise.resolve([]),
      ),
    });
    await screen.findByText('Kayıtlı konumlar yükleniyor…');
    await act(async () =>
      useCommunity.setState({
        user: { id: 'other', username: 'other', displayName: 'Other', avatar: null },
      }),
    );
    await act(async () => resolve([item]));
    expect(screen.queryByText('Own title')).toBeNull();
  });
  it('uses actual time bounds; missing or expired guide data never gets progress', () => {
    const now = Date.now();
    const { rerender } = render(
      <CurrentProgram programs={[current]} now={now} fallback="Own group" />,
    );
    expect(screen.getByRole('progressbar')).toBeTruthy();
    rerender(<CurrentProgram programs={[current]} now={now + 120000} fallback="Own group" />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Own group')).toBeTruthy();
  });
  it('does not manufacture duration, percent or invalid date/position values', () => {
    expect(addedDate(undefined)).toBe('Belirtilmedi');
    expect(addedDate('bad')).toBe('Belirtilmedi');
    expect(resumeLabel(-1)).toBe('Kayıtlı konum yok');
    expect(resumeLabel(NaN)).toBe('Kayıtlı konum yok');
    expect(resumeLabel(604801)).toBe('Kayıtlı konum yok');
    expect(resumeLabel(3601)).toBe('1:00:01 kayıtlı');
  });
});
