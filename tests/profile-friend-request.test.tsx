// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DesktopBridge } from '@rooms/contracts';
import { queryClient } from '../apps/desktop/src/query-client';
import { useCommunity } from '../apps/desktop/src/community';
import { FriendRequestButton } from '../apps/desktop/src/FriendRequestButton';
const self = { id: 'self', username: 'Self', displayName: 'Self', avatar: null };
const peer = {
  id: 'peer',
  username: 'Friend',
  displayName: 'Friend',
  avatar: null,
  discriminator: '1234',
};
beforeEach(() => {
  queryClient.clear();
  useCommunity.setState({ user: self, serverUrl: 'https://example.test', status: 'connected' });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  delete window.rooms;
});
it('sends the full user tag and reflects the actual pending relationship', async () => {
  let pending = false;
  const addFriend = vi.fn(async () => {
    pending = true;
  });
  window.rooms = {
    social: {
      addFriend,
      friends: async () =>
        pending ? [{ user: peer, relationship: 'outgoing', status: 'online' }] : [],
    },
  } as unknown as DesktopBridge;
  render(<FriendRequestButton user={peer} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Arkadaş ekle' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Arkadaş ekle' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'İstek gönderildi' })).toBeTruthy(),
  );
  expect(addFriend).toHaveBeenCalledWith('Friend#1234');
});
it('does not claim an account-changing delayed request as sent for a different account', async () => {
  let complete!: () => void;
  const addFriend = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  window.rooms = { social: { addFriend, friends: async () => [] } } as unknown as DesktopBridge;
  render(<FriendRequestButton user={peer} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Arkadaş ekle' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Arkadaş ekle' }));
  act(() => useCommunity.setState({ user: { ...self, id: 'new' } }));
  await act(async () => complete());
  expect(screen.queryByText('İstek gönderildi')).toBeNull();
  expect(screen.queryByText('Gönderiliyor…')).toBeNull();
});
