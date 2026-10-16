// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { DesktopBridge, SocialSession } from '@rooms/contracts';
import type { GatewayEvent, SocialMessage } from '@rooms/social';
beforeEach(() => vi.resetModules());
afterEach(() => {
  delete window.rooms;
});
it('purges private previews before reauthorization and rejects stale message results', async () => {
  let event!: (value: GatewayEvent) => void, resolve!: (messages: SocialMessage[]) => void;
  const pending = new Promise<SocialMessage[]>((done) => {
    resolve = done;
  });
  let calls = 0;
  const self = { id: 'self', username: 'self', displayName: 'Self', avatar: null };
  const session: SocialSession = {
    instanceUrl: 'https://example.test',
    user: self,
    status: 'connected',
    remembered: true,
  };
  const channel = { id: 'private', spaceId: 'community', name: 'Private', type: 0, topic: null };
  const channelPermissions = vi.fn(async () => ({
    channelId: 'private',
    spaceId: null,
    access: 'denied',
    effective: { view: false },
    subjects: [],
  }));
  window.rooms = {
    social: {
      session: async () => session,
      onEvent: (listener: (event: GatewayEvent) => void) => {
        event = listener;
        return () => {};
      },
      spaces: async () => [{ id: 'community', name: 'Friends', ownerId: 'self' }],
      channels: async () => [channel],
      dms: async () => [],
      readStates: async () => [],
      messages: async () => (++calls === 1 ? [] : pending),
      channelPermissions,
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  const { useChannelAccess } = await import('../apps/desktop/src/channel-access');
  await initializeCommunity();
  const stale = useCommunity.getState().openChannel('private');
  const cleared: unknown[] = [];
  const listener = (e: Event) => cleared.push((e as CustomEvent).detail);
  window.addEventListener('rooms:channel-access-invalidated', listener);
  event({
    type: 'CHANNEL_ACCESS_INVALIDATED',
    data: { channelIds: ['private'], reason: 'permissions-changed' },
  });
  expect(useCommunity.getState().channels).toEqual([]);
  expect(useCommunity.getState().messages).toEqual([]);
  expect(cleared).toEqual([{ channelIds: ['private'] }]);
  await vi.waitFor(() => expect(useChannelAccess.getState().checks.private).toBe('denied'));
  resolve([
    {
      id: 'secret',
      channelId: 'private',
      author: self,
      content: 'must-not-return',
      timestamp: new Date().toISOString(),
      editedTimestamp: null,
    },
  ]);
  await stale;
  event({
    type: 'MESSAGE_CREATE',
    data: {
      id: 'new-secret',
      channelId: 'private',
      author: self,
      content: 'must-not-return',
      timestamp: new Date().toISOString(),
      editedTimestamp: null,
    },
  });
  expect(useCommunity.getState().messages).toEqual([]);
  expect(useCommunity.getState().unread.private).toBeUndefined();
  await expect(useCommunity.getState().send('draft')).rejects.toThrow('erişimi');
  window.removeEventListener('rooms:channel-access-invalidated', listener);
});
it('does not restore another account data from a stale refresh', async () => {
  let resolve!: (value: unknown[]) => void;
  const spaces = new Promise<unknown[]>((done) => {
    resolve = done;
  });
  window.rooms = {
    social: { spaces: () => spaces, dms: async () => [], readStates: async () => [] },
  } as unknown as DesktopBridge;
  const { useCommunity } = await import('../apps/desktop/src/community');
  useCommunity.setState({
    user: { id: 'old', username: 'old', displayName: 'Old', avatar: null },
    serverUrl: 'https://example.test',
  });
  const refresh = useCommunity.getState().refresh();
  useCommunity.setState({
    user: { id: 'new', username: 'new', displayName: 'New', avatar: null },
    spaces: [],
    serverUrl: 'https://other.example.test',
  });
  resolve([{ id: 'private-old', name: 'must-not-restore' }]);
  await refresh;
  expect(useCommunity.getState().spaces).toEqual([]);
  expect(useCommunity.getState().user?.id).toBe('new');
});

it('keeps channels listed during a server-wide membership recheck and refreshes the list', async () => {
  let event!: (value: GatewayEvent) => void;
  const self = { id: 'self', username: 'self', displayName: 'Self', avatar: null };
  const session: SocialSession = {
    instanceUrl: 'https://example.test',
    user: self,
    status: 'connected',
    remembered: true,
  };
  const general = { id: 'general', spaceId: 'community', name: 'General', type: 0, topic: null };
  const channels = vi.fn(async () => [general]);
  window.rooms = {
    social: {
      session: async () => session,
      onEvent: (listener: (event: GatewayEvent) => void) => {
        event = listener;
        return () => {};
      },
      spaces: async () => [{ id: 'community', name: 'Friends', ownerId: 'self' }],
      channels,
      dms: async () => [],
      readStates: async () => [],
      messages: async () => [],
      channelPermissions: async () => ({ channelId: 'general', access: 'allowed' }),
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  await initializeCommunity();
  await vi.waitFor(() => expect(useCommunity.getState().channels).toEqual([general]));
  const before = channels.mock.calls.length;
  event({
    type: 'CHANNEL_ACCESS_INVALIDATED',
    data: { channelIds: ['general'], reason: 'membership-changed' },
  });
  expect(useCommunity.getState().channels).toEqual([general]);
  await vi.waitFor(() => expect(channels.mock.calls.length).toBeGreaterThan(before));
  expect(useCommunity.getState().channels).toEqual([general]);
});
