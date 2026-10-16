// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StoatClient } from '@rooms/stoat';
import {
  FriendRequiredDialog,
  directMessageFailed,
} from '../apps/desktop/src/FriendRequiredDialog';
import { dmFriendRequired, uiError } from '../apps/desktop/src/i18n';
import type { DesktopBridge } from '../packages/shared-contracts/src';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.rooms;
});
const peer = {
  id: 'peer',
  username: 'peer',
  displayName: 'Peer',
  avatar: null,
  discriminator: '1234',
};
function deniedDm(relations: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/users/peer/dm'))
        return new Response(JSON.stringify({ type: 'MissingPermission' }), { status: 403 });
      if (path.endsWith('/users/@me'))
        return new Response(JSON.stringify({ _id: 'self', username: 'self', relations }));
      return new Response('{}', { status: 404 });
    }),
  );
  return new StoatClient('http://localhost', 'fixture');
}
it('explains which friendship step a refused private message is missing', async () => {
  await expect(deniedDm([]).createDM('peer')).rejects.toThrow(
    'You need to be friends before sending a private message.',
  );
  await expect(deniedDm([{ _id: 'peer', status: 'Outgoing' }]).createDM('peer')).rejects.toThrow(
    'Your friend request has not been accepted yet.',
  );
  await expect(deniedDm([{ _id: 'peer', status: 'Friend' }]).createDM('peer')).rejects.toThrow(
    'You do not have permission for this action.',
  );
  expect(
    uiError(
      new Error(
        "Error invoking remote method 'rooms:social-create-dm': Error: You need to be friends before sending a private message.",
      ),
    ),
  ).toBe(dmFriendRequired);
});
it('offers a friend request instead of a dead-end error', async () => {
  const addFriend = vi.fn(async () => {});
  window.rooms = { social: { addFriend } } as unknown as DesktopBridge;
  const notify = vi.fn(),
    report = vi.fn();
  render(
    <MemoryRouter>
      <FriendRequiredDialog notify={notify} />
    </MemoryRouter>,
  );
  let offered = false;
  act(() => {
    offered = directMessageFailed(
      new Error('You need to be friends before sending a private message.'),
      peer,
      report,
    );
  });
  expect(offered).toBe(true);
  expect(report).not.toHaveBeenCalled();
  expect(screen.getByText(/Özel mesaj için önce arkadaş olmanız gerekiyor/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Arkadaşlık isteği gönder' }));
  await waitFor(() => expect(addFriend).toHaveBeenCalledWith('peer#1234'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(notify).toHaveBeenCalledWith(
    'Arkadaşlık isteği gönderildi. Kabul edilince özel mesaj gönderebilirsin.',
  );
});
it('reports other private message failures as before', () => {
  const report = vi.fn();
  expect(
    directMessageFailed(new Error('Too many requests. Please wait and retry.'), peer, report),
  ).toBe(false);
  expect(report).toHaveBeenCalledWith(
    'Kısa sürede çok fazla işlem yapıldı. Biraz bekleyip yeniden dene.',
  );
});
