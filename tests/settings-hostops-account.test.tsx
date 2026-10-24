// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DesktopBridge } from '@rooms/contracts';

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
vi.mock('@rooms/media', () => ({
  createNoiseSuppressionNode: vi.fn(),
  selectedInputLabel: () => null,
}));
vi.mock('../apps/desktop/src/NoiseComparison', () => ({ NoiseComparison: () => null }));
import Settings from '../apps/desktop/src/Settings';
import { useCommunity } from '../apps/desktop/src/community';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.rooms;
});

const deep = (): unknown =>
  new Proxy(() => new Promise(() => {}), {
    get: (_target, key) =>
      key === 'then' ? undefined : key === Symbol.toPrimitive ? () => '' : deep(),
  });
const quiet = <T extends object>(known: T): T =>
  new Proxy(known, {
    get: (target, key) => (key in target ? target[key as keyof T] : deep()),
  });
const first = { id: 'first', username: 'first', displayName: 'Ilk', avatar: null };
const second = { id: 'second', username: 'second', displayName: 'Ikinci', avatar: null };
const host = {
  id: 'core',
  label: 'Tayfa sunucusu',
  physicalHostId: 'primary',
  mode: 'shared',
  owner: false,
  permissions: ['monitor'],
  terminalAvailable: false,
  agentAvailable: false,
  reason: null,
};

it("does not show the previous account's bio when the new account's profile cannot be read", async () => {
  const updateProfile = vi.fn(async () => second);
  let calls = 0;
  window.rooms = quiet({
    platform: 'darwin',
    social: quiet({
      ownProfile: async () => {
        if (calls++ === 0)
          return { bio: 'Eski hesabin ozgecmisi', statusText: '', presence: 'online' };
        throw new Error('offline');
      },
      updateProfile,
    }),
  }) as unknown as DesktopBridge;
  useCommunity.setState({ user: first, status: 'connected' });
  render(
    <MemoryRouter initialEntries={['/settings?tab=profile']}>
      <Settings notify={() => {}} onClose={() => {}} />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue('Eski hesabin ozgecmisi');
  act(() => useCommunity.setState({ user: second }));
  await waitFor(() => expect(screen.queryByDisplayValue('Eski hesabin ozgecmisi')).toBeNull());
  expect(screen.getByDisplayValue('Ikinci')).toBeTruthy();
  const form = screen.getByDisplayValue('Ikinci').closest('form')!;
  await act(async () => {
    fireEvent.submit(form);
  });
  // The unread bio must not be sent (and so cleared) for the new account.
  await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ displayName: 'Ikinci' }));
});

it('shows Sunucu makinesi to a delegated operator who is not an admin, and hides it from other members', async () => {
  const hosts = vi.fn(async () => [host]);
  window.rooms = quiet({
    platform: 'darwin',
    hostOps: quiet({ hosts }),
  }) as unknown as DesktopBridge;
  useCommunity.setState({ user: first, status: 'connected', serverUrl: 'https://one.example' });
  const view = render(
    <MemoryRouter initialEntries={['/settings']}>
      <Settings notify={() => {}} onClose={() => {}} />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('button', { name: /Sunucu makinesi/ })).toBeTruthy();
  view.unmount();
  window.rooms = quiet({
    platform: 'darwin',
    hostOps: quiet({ hosts: async () => [] }),
  }) as unknown as DesktopBridge;
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Settings notify={() => {}} onClose={() => {}} />
    </MemoryRouter>,
  );
  await screen.findAllByText('Tayfa');
  await act(async () => {});
  expect(screen.queryByRole('button', { name: /Sunucu makinesi/ })).toBeNull();
});
