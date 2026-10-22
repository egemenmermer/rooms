// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '@rooms/contracts';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  delete window.rooms;
});

const message = (id: string, minute: number, content = id) => ({
  id,
  channelId: 'chan',
  author: { id: 'ece', username: 'ece', displayName: 'Ece', avatar: null },
  content,
  timestamp: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
  attachments: [],
  reactions: [],
});

async function setup(older: (before: string) => unknown[]) {
  let listener!: (event: { type: string; data: unknown }) => void;
  window.rooms = {
    social: {
      session: async () => ({
        instanceUrl: 'https://example.test',
        user: { id: 'me', username: 'me', displayName: 'Me', avatar: null },
        status: 'connected',
        remembered: true,
      }),
      onEvent: (callback: typeof listener) => {
        listener = callback;
        return () => {};
      },
      spaces: async () => [],
      dms: async () => [],
      readStates: async () => [],
      messages: vi.fn(async (_channel: string, before: string) => older(before)),
    },
  } as unknown as DesktopBridge;
  const community = await import('../apps/desktop/src/community');
  await community.initializeCommunity();
  return { ...community, emit: (event: { type: string; data: unknown }) => listener(event) };
}

it('ignores a reaction or edit on a message that is not loaded', async () => {
  const { useCommunity, emit } = await setup(() => []);
  useCommunity.setState({
    activeChannelId: 'chan',
    messages: [message('m2', 2), message('m3', 3)] as never,
  });
  emit({ type: 'MESSAGE_UPDATE', data: message('m-old', 0, 'a month ago') });
  expect(useCommunity.getState().messages.map((m) => m.id)).toEqual(['m2', 'm3']);
  emit({ type: 'MESSAGE_UPDATE', data: message('m2', 2, 'edited') });
  expect(useCommunity.getState().messages.map((m) => m.content)).toEqual(['edited', 'm3']);
});

it('stops offering older messages at the window instead of looping', async () => {
  const { useCommunity, MESSAGE_WINDOW } = await setup((before) => {
    const start = Number(before.slice(1)) - 50;
    return Array.from({ length: 50 }, (_, i) => message(`m${start + i}`, 0));
  });
  useCommunity.setState({
    activeChannelId: 'chan',
    hasOlder: true,
    messages: Array.from({ length: MESSAGE_WINDOW - 20 }, (_, i) =>
      message(`m${100000 + i}`, 1),
    ) as never,
  });
  await useCommunity.getState().loadOlder();
  const state = useCommunity.getState();
  expect(state.messages).toHaveLength(MESSAGE_WINDOW);
  expect(state.hasOlder).toBe(false);
});

it('counts unread mentions and unread conversations for the Dock badge', async () => {
  const { badgeCount } = await import('../apps/desktop/src/community');
  const user = { id: 'me', username: 'me', displayName: 'Me', avatar: null };
  expect(
    badgeCount({
      user,
      readStates: {
        general: { channelId: 'general', lastReadMessageId: null, mentionMessageIds: ['a', 'b'] },
      },
      unread: { general: true, dm1: true, dm2: false },
      dms: [{ id: 'dm1' }, { id: 'dm2' }] as never,
    }),
  ).toBe(3);
  expect(badgeCount({ user: null, readStates: {}, unread: {}, dms: [] })).toBe(0);
});
