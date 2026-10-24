// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopBridge, SocialSession } from '@rooms/contracts';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  vi.doUnmock('../apps/desktop/src/realtime');
  delete window.rooms;
});

const member = { id: 'member', username: 'member', displayName: 'Member', avatar: null };

it('signs out of the main process even when leaving voice rejects', async () => {
  const leaveVoice = vi.fn(async () => {
    throw new DOMException('Cannot close a closed AudioContext.', 'InvalidStateError');
  });
  vi.doMock('../apps/desktop/src/realtime', () => ({
    leaveVoice,
    useVoiceContext: { getState: () => ({ channelId: null }), setState: vi.fn() },
  }));
  const logout = vi.fn(async () => {});
  window.rooms = {
    social: {
      session: async () => ({
        instanceUrl: 'https://example.test',
        user: member,
        status: 'connected',
        remembered: true,
        sessionEpoch: 1,
      }),
      onEvent: () => () => {},
      logout,
      spaces: async () => [],
      dms: async () => [],
      readStates: async () => [],
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  await initializeCommunity();
  expect(useCommunity.getState().user?.id).toBe('member');
  await useCommunity.getState().logout();
  expect(leaveVoice).toHaveBeenCalled();
  expect(logout).toHaveBeenCalledTimes(1);
  expect(useCommunity.getState()).toMatchObject({
    user: null,
    status: 'not-configured',
    error: null,
    busy: false,
  });
});

it('signs out of the main process even when the voice module cannot load', async () => {
  vi.doMock('../apps/desktop/src/realtime', () => {
    throw new Error('chunk failed');
  });
  const logout = vi.fn(async () => {});
  window.rooms = {
    social: { session: async () => ({ user: null }), onEvent: () => () => {}, logout },
  } as unknown as DesktopBridge;
  const { useCommunity } = await import('../apps/desktop/src/community');
  await useCommunity.getState().logout();
  expect(logout).toHaveBeenCalledTimes(1);
  expect(useCommunity.getState().error).toBeNull();
});

it('does not let a restored saved session orphan a sign-in in progress', async () => {
  let listener!: (event: { type: string; data: unknown; sessionEpoch?: number }) => void;
  let finishLogin!: (session: SocialSession) => void;
  const restored: SocialSession = {
    instanceUrl: 'https://old.example.test',
    user: { id: 'old', username: 'old', displayName: 'Old', avatar: null },
    status: 'connected',
    remembered: true,
    sessionEpoch: 1,
  };
  const session = vi.fn(async () => restored);
  window.rooms = {
    social: {
      session,
      login: () =>
        new Promise<SocialSession>((done) => {
          finishLogin = done;
        }),
      onEvent: (callback: typeof listener) => {
        listener = callback;
        return () => {};
      },
      spaces: async () => [],
      dms: async () => [],
      readStates: async () => [],
    },
  } as unknown as DesktopBridge;
  const { initializeCommunity, useCommunity } = await import('../apps/desktop/src/community');
  window.rooms.social.session = async () => ({
    instanceUrl: 'https://old.example.test',
    user: null,
    status: 'reconnecting',
    remembered: true,
    restore: 'unreachable',
  });
  await initializeCommunity();
  window.rooms.social.session = session;
  const signingIn = useCommunity.getState().connect({
    serverUrl: 'https://new.example.test',
    email: 'new@example.test',
    password: 'secret',
  });
  expect(useCommunity.getState().busy).toBe(true);
  // Without an epoch, the event passes the stale-session filter: only the busy guard stops it.
  listener({ type: 'SESSION_RESTORED', data: null });
  await Promise.resolve();
  finishLogin({
    instanceUrl: 'https://new.example.test',
    user: { id: 'new', username: 'new', displayName: 'New', avatar: null },
    status: 'connected',
    remembered: true,
    sessionEpoch: 2,
  });
  await signingIn;
  expect(session).not.toHaveBeenCalled();
  expect(useCommunity.getState()).toMatchObject({
    user: { id: 'new' },
    serverUrl: 'https://new.example.test',
    busy: false,
  });
});
