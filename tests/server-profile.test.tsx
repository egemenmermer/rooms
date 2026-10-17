// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ServerProfile } from '../apps/desktop/src/ServerProfile';
import { useCommunity } from '../apps/desktop/src/community';

const profile = {
  id: 'space',
  name: 'Dostlar Meclisi',
  description: '',
  icon: null,
  banner: null,
  ownerId: 'owner',
};
let social: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  social = {
    spaceProfile: vi.fn(async () => profile),
    communityCapabilities: vi.fn(async () => ({ manageServer: false })),
    members: vi.fn(async () => [{ status: 'online' }, { status: 'invisible' }, { status: 'idle' }]),
    updateSpaceProfile: vi.fn(async (change: { name: string; description: string }) => ({
      ...profile,
      ...change,
    })),
    chooseSpaceImage: vi.fn(async () => ({ ...profile, icon: 'data:image/png;base64,AA==' })),
    removeSpaceImage: vi.fn(),
  };
  (window as { rooms?: unknown }).rooms = { social };
  useCommunity.setState({
    user: { id: 'owner', username: 'egemen', displayName: 'egemen', avatar: null },
    activeSpaceId: 'space',
    spaces: [{ id: 'space', name: 'Dostlar Meclisi', icon: null, ownerId: 'owner' }],
  });
});
afterEach(() => {
  cleanup();
  delete (window as { rooms?: unknown }).rooms;
});

it('lets the owner rename and describe the server with a live preview and a save bar', async () => {
  const notify = vi.fn();
  render(<ServerProfile notify={notify} />);
  const name = (await screen.findByRole('textbox', { name: 'Ad' })) as HTMLInputElement;
  expect(name.value).toBe('Dostlar Meclisi');
  expect(screen.getByText(/2 çevrimiçi/)).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Kaydedilmemiş değişiklikler' })).toBeNull();
  fireEvent.change(name, { target: { value: 'Dostlar' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Açıklama' }), {
    target: { value: 'Akşam oyunları' },
  });
  expect(screen.getByLabelText('Önizleme').textContent).toContain('Akşam oyunları');
  fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
  await waitFor(() =>
    expect(social.updateSpaceProfile).toHaveBeenCalledWith({
      spaceId: 'space',
      name: 'Dostlar',
      description: 'Akşam oyunları',
    }),
  );
  expect(notify).toHaveBeenCalledWith('Sunucu profili kaydedildi.');
  fireEvent.click(screen.getByRole('button', { name: 'İkonu değiştir' }));
  await waitFor(() => expect(social.chooseSpaceImage).toHaveBeenCalledWith('space', 'icon'));
  expect(await screen.findByRole('button', { name: 'Kaldır' })).toBeTruthy();
});

it('is read-only for a member without Manage Server', async () => {
  useCommunity.setState({
    user: { id: 'member', username: 'ob', displayName: 'OB', avatar: null },
  });
  render(<ServerProfile notify={() => {}} />);
  const name = (await screen.findByRole('textbox', { name: 'Ad' })) as HTMLInputElement;
  expect(name.disabled).toBe(true);
  expect(screen.getByText(/yalnızca topluluk sahibi/)).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Afişi değiştir' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
