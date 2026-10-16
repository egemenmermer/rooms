// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopBridge, SocialSession } from '@rooms/contracts';
import type { GatewayEvent, SocialMessage } from '@rooms/social';
beforeEach(() => vi.resetModules());
afterEach(() => {
  delete window.rooms;
});
it('replaces the sending copy with the delivered message after the channel is reselected', async () => {
  const self = { id: 'self', username: 'self', displayName: 'Self', avatar: null };
  const session: SocialSession = {
    instanceUrl: 'https://example.test',
    user: self,
    status: 'connected',
    remembered: true,
  };
  const bugs = { id: 'bugs', spaceId: 'community', name: 'bugs & features', type: 0, topic: null };
  let deliver!: (message: SocialMessage) => void;
  const send = vi.fn(
    () =>
      new Promise<SocialMessage>((resolve) => {
        deliver = resolve;
      }),
  );
  window.rooms = {
    social: {
      session: async () => session,
      onEvent: (_listener: (event: GatewayEvent) => void) => () => {},
      spaces: async () => [{ id: 'community', name: 'Friends', ownerId: 'self' }],
      channels: async () => [bugs],
      dms: async () => [],
      readStates: async () => [],
      messages: async () => [],
      send,
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  await initializeCommunity();
  await vi.waitFor(() => expect(useCommunity.getState().activeChannelId).toBe('bugs'));
  const sending = useCommunity.getState().send('merhaba');
  expect(useCommunity.getState().messages.map((m) => m.delivery)).toEqual(['pending']);
  await useCommunity.getState().openChannel('bugs', true);
  deliver({
    id: 'delivered',
    channelId: 'bugs',
    author: self,
    content: 'merhaba',
    timestamp: new Date().toISOString(),
    editedTimestamp: null,
  });
  await sending;
  expect(useCommunity.getState().messages.map((m) => [m.id, m.delivery])).toEqual([
    ['delivered', 'sent'],
  ]);
  await useCommunity.getState().openChannel('bugs');
  expect(useCommunity.getState().messages.some((m) => m.delivery === 'pending')).toBe(false);
});
