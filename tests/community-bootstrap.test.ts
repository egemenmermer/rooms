// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopBridge, SocialSession } from '@rooms/contracts';
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  delete window.rooms;
});
it('concurrent desktop mounts wait for the same restored session before redirecting', async () => {
  let resolve!: (session: SocialSession) => void;
  const restored = new Promise<SocialSession>((done) => {
    resolve = done;
  });
  const session = vi.fn(() => restored),
    onEvent = vi.fn(() => () => {});
  window.rooms = {
    social: {
      session,
      onEvent,
      spaces: async () => [],
      dms: async () => [],
      readStates: async () => [],
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  const first = initializeCommunity(),
    second = initializeCommunity();
  let finished = false;
  void second.then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(session).toHaveBeenCalledTimes(1);
  expect(onEvent).toHaveBeenCalledTimes(1);
  resolve({
    instanceUrl: 'https://example.test',
    user: { id: 'member', username: 'member', displayName: 'Member', avatar: null },
    status: 'connected',
    remembered: true,
  });
  await Promise.all([first, second]);
  expect(useCommunity.getState().user?.id).toBe('member');
  expect(finished).toBe(true);
});
it('restoration failure retains an actionable connection error for all waiting mounts', async () => {
  window.rooms = {
    social: {
      session: async () => {
        throw new Error('network');
      },
      onEvent: () => () => {},
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  await Promise.all([initializeCommunity(), initializeCommunity()]);
  expect(useCommunity.getState().user).toBeNull();
  expect(useCommunity.getState().error).toContain('Ayarlar');
});
it('does not let a delayed stored-session restoration replace a newer sign-in', async () => {
  let restore!: (session: SocialSession) => void;
  const oldSession = new Promise<SocialSession>((done) => {
    restore = done;
  });
  const next: SocialSession = {
    instanceUrl: 'https://new.example.test',
    user: { id: 'new', username: 'new', displayName: 'New', avatar: null },
    status: 'connected',
    remembered: true,
    sessionEpoch: 2,
  };
  const social = {
    session: () => oldSession,
    login: async () => next,
    onEvent: () => () => {},
    spaces: async () => [],
    dms: async () => [],
    readStates: async () => [],
  };
  window.rooms = { social } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  const initializing = initializeCommunity();
  const signingIn = useCommunity.getState().connect({
    serverUrl: 'https://new.example.test',
    email: 'new@example.test',
    password: 'secret',
  });
  restore({
    instanceUrl: 'https://old.example.test',
    user: { id: 'old', username: 'old', displayName: 'Old', avatar: null },
    status: 'connected',
    remembered: true,
    sessionEpoch: 1,
  });
  await Promise.all([initializing, signingIn]);
  expect(useCommunity.getState().user?.id).toBe('new');
  expect(useCommunity.getState().serverUrl).toBe('https://new.example.test');
});
it('ignores queued gateway events produced by a previous account session', async () => {
  let listener!: (event: import('@rooms/social').GatewayEvent) => void;
  const session: SocialSession = {
    instanceUrl: 'https://new.example.test',
    user: { id: 'new', username: 'new', displayName: 'New', avatar: null },
    status: 'connected',
    remembered: false,
    sessionEpoch: 8,
  };
  window.rooms = {
    social: {
      session: async () => session,
      onEvent: (handler: (event: import('@rooms/social').GatewayEvent) => void) => {
        listener = handler;
        return () => {};
      },
      spaces: async () => [],
      dms: async () => [],
      readStates: async () => [],
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  await initializeCommunity();
  useCommunity.setState({ activeChannelId: 'channel' });
  const author = session.user!;
  listener({
    type: 'MESSAGE_CREATE',
    sessionEpoch: 7,
    data: {
      id: 'stale',
      channelId: 'channel',
      author,
      content: 'old account',
      timestamp: new Date().toISOString(),
      editedTimestamp: null,
    },
  });
  expect(useCommunity.getState().messages).toEqual([]);
  listener({
    type: 'MESSAGE_CREATE',
    sessionEpoch: 8,
    data: {
      id: 'current',
      channelId: 'channel',
      author,
      content: 'current account',
      timestamp: new Date().toISOString(),
      editedTimestamp: null,
    },
  });
  expect(useCommunity.getState().messages.map((message) => message.id)).toEqual(['current']);
});
it('keeps mention acknowledgements cleared when a reconnect repeats a delivered message', async () => {
  let listener!: (event: import('@rooms/social').GatewayEvent) => void;
  window.rooms = {
    social: {
      session: async () => ({ status: 'not-configured', user: null }),
      onEvent: (handler: typeof listener) => {
        listener = handler;
        return () => {};
      },
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  await initializeCommunity();
  const self = { id: 'self', username: 'self', displayName: 'Self', avatar: null };
  useCommunity.setState({
    user: self,
    serverUrl: 'https://example.test',
    activeChannelId: null,
    readStates: {},
    unread: {},
  });
  const event: import('@rooms/social').GatewayEvent = {
    type: 'MESSAGE_CREATE',
    data: {
      id: 'mention-one',
      channelId: 'chat',
      author: { ...self, id: 'other' },
      content: '<@self>',
      mentions: ['self'],
      timestamp: '2026-10-15T12:00:00Z',
      editedTimestamp: null,
    },
  };
  listener(event);
  expect(useCommunity.getState().readStates.chat.mentionMessageIds).toEqual(['mention-one']);
  listener({
    type: 'READ_STATE_SYNC',
    data: [{ channelId: 'chat', lastReadMessageId: 'mention-one', mentionMessageIds: [] }],
  });
  listener(event);
  expect(useCommunity.getState().readStates.chat.mentionMessageIds).toEqual([]);
});
