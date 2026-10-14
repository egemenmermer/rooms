// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Messages } from '../apps/desktop/src/Messages';
import { useCommunity } from '../apps/desktop/src/community';
import type { DesktopBridge } from '../packages/shared-contracts/src';
const originalOpen = useCommunity.getState().openChannel,
  owner = { id: 'owner', username: 'owner', displayName: 'Owner', avatar: null },
  peer = { ...owner, id: 'friend', displayName: 'Test Friend' };
const channel = {
  id: 'direct',
  spaceId: null,
  name: 'Test Friend',
  type: 1,
  topic: null,
  recipients: [owner, peer],
};
beforeEach(() => {
  useCommunity.setState({
    user: owner,
    serverUrl: 'https://rooms.example/api',
    activeSpaceId: 'space',
    activeChannelId: 'general',
    dms: [],
    openChannel: vi.fn(async (id) => {
      useCommunity.setState({ activeChannelId: id });
    }),
  });
});
afterEach(() => {
  cleanup();
  delete window.rooms;
  useCommunity.setState({ openChannel: originalOpen });
});
function bridge(createDM: () => Promise<typeof channel>) {
  window.rooms = {
    social: {
      avatar: async () => null,
      friends: async () => [{ user: peer, relationship: 'friend' }],
      members: async () => [],
      createDM,
    },
  } as unknown as DesktopBridge;
}
it('creates an authorized DM and opens its conversation from the person picker', async () => {
  const create = vi.fn(async () => channel);
  bridge(create);
  render(
    <MemoryRouter>
      <Messages notify={vi.fn()} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Yeni özel mesaj' }));
  fireEvent.click(await screen.findByRole('button', { name: /Test Friend/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(create).toHaveBeenCalledWith('friend');
  expect(useCommunity.getState().dms).toContainEqual(channel);
  expect(useCommunity.getState().openChannel).toHaveBeenCalledWith('direct');
});
it('does not navigate or install a late DM result after the picker was closed', async () => {
  let finish!: (value: typeof channel) => void;
  bridge(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <MemoryRouter>
      <Messages notify={vi.fn()} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Yeni özel mesaj' }));
  fireEvent.click(await screen.findByRole('button', { name: /Test Friend/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Pencereyi kapat' }));
  finish(channel);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(useCommunity.getState().openChannel).not.toHaveBeenCalled();
  expect(useCommunity.getState().dms).toEqual([]);
});
