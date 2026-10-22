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

it('starts from the stored bio and status, and clears an emptied status on the server', async () => {
  const user = { id: 'me', username: 'me', displayName: 'Deniz', avatar: null };
  const updateProfile = vi.fn(async () => user);
  // Everything Settings asks for besides the profile stays pending ("nothing here").
  const deep = (): unknown =>
    new Proxy(() => new Promise(() => {}), {
      get: (_target, key) =>
        key === 'then' ? undefined : key === Symbol.toPrimitive ? () => '' : deep(),
    });
  const quiet = <T extends object>(known: T): T =>
    new Proxy(known, {
      get: (target, key) => (key in target ? target[key as keyof T] : deep()),
    });
  window.rooms = quiet({
    platform: 'darwin',
    social: quiet({
      ownProfile: async () => ({ bio: 'Film gecesi', statusText: 'Dizide', presence: 'idle' }),
      updateProfile,
    }),
  }) as unknown as DesktopBridge;
  useCommunity.setState({ user, status: 'connected' });
  render(
    <MemoryRouter initialEntries={['/settings?tab=profile']}>
      <Settings notify={() => {}} onClose={() => {}} />
    </MemoryRouter>,
  );
  const status = (await screen.findByDisplayValue('Dizide')) as HTMLInputElement;
  expect(screen.getByDisplayValue('Film gecesi')).toBeTruthy();
  fireEvent.change(status, { target: { value: '' } });
  await act(async () => {
    fireEvent.submit(status.closest('form')!);
  });
  await waitFor(() =>
    expect(updateProfile).toHaveBeenCalledWith({ displayName: 'Deniz', statusText: '' }),
  );
});
