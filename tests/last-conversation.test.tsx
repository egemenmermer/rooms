// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useCommunity } from '../apps/desktop/src/community';
import {
  useLastConversation,
  useConversationRestore,
  conversationScope,
} from '../apps/desktop/src/last-conversation';
import { useChannelAccess } from '../apps/desktop/src/channel-access';
const original = useCommunity.getState();
afterEach(() => {
  cleanup();
  useCommunity.setState(original);
  useLastConversation.setState({ positions: {} });
  useChannelAccess.setState({ checks: {} });
});
function Probe() {
  useConversationRestore(true);
  return <p>{useLocation().pathname}</p>;
}
function setup() {
  const open = vi.fn(async (id: string) => {
    useCommunity.setState({ activeChannelId: id });
  });
  useCommunity.setState({
    status: 'connected',
    busy: false,
    user: { id: 'owner', username: 'Owner', displayName: 'Owner', avatar: null },
    serverUrl: 'https://one.test',
    activeSpaceId: 'space',
    spaces: [{ id: 'space', name: 'Friends', ownerId: 'owner' } as any],
    channels: [
      { id: 'text', spaceId: 'space', name: 'General', type: 0, topic: null },
      { id: 'voice', spaceId: 'space', name: 'Lounge', type: 2, topic: null },
    ],
    dms: [],
    activeChannelId: 'text',
    openChannel: open,
  });
  return open;
}
it('restores saved voice-room view without joining audio', async () => {
  const open = setup();
  useLastConversation.getState().remember(conversationScope('https://one.test', 'owner'), {
    spaceId: 'space',
    channelId: 'voice',
  });
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Probe />
    </MemoryRouter>,
  );
  await screen.findByText('/voice');
  expect(open).toHaveBeenCalledWith('voice', true);
});
it('different server or account cannot restore another identity position', async () => {
  const open = setup();
  useLastConversation.getState().remember(conversationScope('https://other.test', 'owner'), {
    spaceId: 'space',
    channelId: 'voice',
  });
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Probe />
    </MemoryRouter>,
  );
  await screen.findByText('/chat');
  expect(open).toHaveBeenCalledWith('text', true);
});
it('removed saved channel falls back to an existing text channel', async () => {
  const open = setup();
  useLastConversation.getState().remember(conversationScope('https://one.test', 'owner'), {
    spaceId: 'space',
    channelId: 'removed',
  });
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Probe />
    </MemoryRouter>,
  );
  await screen.findByText('/chat');
  expect(open).toHaveBeenCalledWith('text', true);
});
it('explicit deep link takes precedence over restoration', async () => {
  const open = setup();
  render(
    <MemoryRouter initialEntries={['/games']}>
      <Probe />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText('/games')).toBeTruthy());
  expect(open).not.toHaveBeenCalled();
});
