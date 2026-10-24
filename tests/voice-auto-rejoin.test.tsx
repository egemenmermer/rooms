// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCommunity } from '../apps/desktop/src/community';
import { useDmCall } from '../apps/desktop/src/dm-call';

const DROPPED = 'Voice disconnected. Rejoin to obtain a fresh membership grant.';
const KICKED = 'A moderator disconnected you from the voice room.';
const f = vi.hoisted(() => ({
  status: 'not-configured',
  error: null as string | null,
  muted: true,
  deafened: false,
  listeners: new Set<() => void>(),
  grant: vi.fn(),
  leave: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  noise: vi.fn(),
  devices: vi.fn(),
  mute: vi.fn(),
  deafen: vi.fn(),
}));
/** Changes the fake provider and tells every subscriber, as the LiveKit provider does. */
function patch(next: { status?: string; error?: string | null; muted?: boolean }) {
  Object.assign(f, next);
  for (const listener of [...f.listeners]) listener();
}
vi.mock('../apps/desktop/src/runtime-sources', () => ({
  mediaBridge: () => ({ grant: f.grant, leave: f.leave }),
  mediaProvider: () => ({
    snapshot: () => ({
      status: f.status,
      error: f.error,
      muted: f.muted,
      deafened: f.deafened,
      inputDevice: null,
    }),
    subscribeState: (listener: () => void) => {
      f.listeners.add(listener);
      return () => f.listeners.delete(listener);
    },
    onMove: () => () => {},
    deafen: f.deafen,
    connectRoom: f.connect,
    disconnect: f.disconnect,
    setNoiseSuppression: f.noise,
    deviceSelection: f.devices,
    mute: f.mute,
  }),
}));
import {
  VOICE_REJOIN_DELAYS_MS,
  cancelVoiceRejoin,
  joinVoice,
  leaveVoice,
  toggleMic,
  useVoiceContext,
  useVoiceRejoin,
} from '../apps/desktop/src/realtime';
import { VoiceRejoinNotice } from '../apps/desktop/src/VoiceRejoinNotice';

const grant = { roomName: 'Room', token: 'local-test-token', serverUrl: 'wss://media.test' };
/** LiveKit gives up: the state change first, then the Disconnected reason with its text. */
function drop(error = DROPPED) {
  patch({ status: 'error' });
  patch({ error, muted: true });
}
beforeEach(async () => {
  window.rooms = {} as any;
  await leaveVoice();
  vi.clearAllMocks();
  vi.useFakeTimers();
  useDmCall.setState({ call: null, busy: false });
  f.status = 'not-configured';
  f.error = null;
  f.muted = true;
  f.deafened = false;
  f.grant.mockResolvedValue(grant);
  f.leave.mockResolvedValue(undefined);
  f.disconnect.mockImplementation(async () => patch({ status: 'not-configured', error: null }));
  f.connect.mockImplementation(async () => patch({ status: 'connected', error: null }));
  f.mute.mockImplementation(async (muted: boolean) => patch({ muted }));
  useCommunity.setState({
    serverUrl: 'https://test',
    user: { id: 'owner', username: 'Owner', displayName: 'Owner', avatar: null },
  });
  await joinVoice('one', 'One');
  expect(f.status).toBe('connected');
  vi.clearAllMocks();
});
afterEach(async () => {
  cleanup();
  await leaveVoice();
  vi.useRealTimers();
  delete window.rooms;
});

it('rejoins the same room after a drop and keeps a muted microphone muted', async () => {
  drop();
  expect(useVoiceRejoin.getState().rejoin).toMatchObject({
    channelId: 'one',
    attempt: 1,
    phase: 'waiting',
  });
  await vi.advanceTimersByTimeAsync(VOICE_REJOIN_DELAYS_MS[0]);
  expect(f.grant).toHaveBeenCalledWith('one');
  expect(f.connect).toHaveBeenCalledTimes(1);
  expect(f.mute).not.toHaveBeenCalledWith(false);
  expect(f.muted).toBe(true);
  expect(useVoiceRejoin.getState().rejoin).toBeNull();
  expect(useVoiceContext.getState()).toMatchObject({ channelId: 'one', busy: false, error: null });
});

it('never unmutes on its own, even when the microphone was live before the drop', async () => {
  await toggleMic();
  expect(f.muted).toBe(false);
  f.mute.mockClear();
  drop();
  await vi.advanceTimersByTimeAsync(VOICE_REJOIN_DELAYS_MS[0]);
  expect(f.connect).toHaveBeenCalledTimes(1);
  expect(f.mute).not.toHaveBeenCalledWith(false);
  expect(f.muted).toBe(true);
});

it('does not rejoin after the person left, nor after a moderator kick', async () => {
  await leaveVoice();
  drop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.grant).not.toHaveBeenCalled();

  await joinVoice('one', 'One');
  f.grant.mockClear();
  drop(KICKED);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.grant).not.toHaveBeenCalled();
  expect(useVoiceRejoin.getState().rejoin).toBeNull();
});

it('a move or a private call that takes over before the timer wins', async () => {
  drop();
  // A moderator move arrives through joinVoice for the target room.
  await joinVoice('two', 'Two');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.grant.mock.calls).toEqual([['two']]);
  expect(useVoiceRejoin.getState().rejoin).toBeNull();

  f.grant.mockClear();
  drop();
  useDmCall.setState({ call: { id: 'dm', state: 'accepted' } as any });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.grant).not.toHaveBeenCalled();
  expect(useVoiceRejoin.getState().rejoin).toBeNull();
});

it('a private call taking over through leaveVoice never triggers a rejoin', async () => {
  // dm-call leaves the room first, then the provider reports its own state changes.
  await leaveVoice();
  patch({ status: 'connected' });
  patch({ status: 'error', error: DROPPED });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.grant).not.toHaveBeenCalled();
});

it('backs off between failed attempts and gives up with a message after the limit', async () => {
  f.grant.mockRejectedValue(new Error('Access unavailable'));
  drop();
  await vi.advanceTimersByTimeAsync(VOICE_REJOIN_DELAYS_MS[0]);
  expect(f.grant).toHaveBeenCalledTimes(1);
  expect(useVoiceRejoin.getState().rejoin).toMatchObject({ attempt: 2, phase: 'waiting' });
  // The next attempt waits for the longer delay.
  await vi.advanceTimersByTimeAsync(VOICE_REJOIN_DELAYS_MS[1] - 1);
  expect(f.grant).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(VOICE_REJOIN_DELAYS_MS.reduce((a, b) => a + b, 0));
  expect(f.grant).toHaveBeenCalledTimes(VOICE_REJOIN_DELAYS_MS.length);
  expect(useVoiceRejoin.getState().rejoin).toMatchObject({
    channelId: 'one',
    phase: 'failed',
    attempt: VOICE_REJOIN_DELAYS_MS.length,
  });
  // The room is left properly so the member list stops showing this person.
  expect(useVoiceContext.getState().channelId).toBeNull();
  expect(f.leave).toHaveBeenCalledWith('one');
  await vi.advanceTimersByTimeAsync(120_000);
  expect(f.grant).toHaveBeenCalledTimes(VOICE_REJOIN_DELAYS_MS.length);
});

it('a connection that keeps dropping right after rejoining ends at the limit', async () => {
  for (let round = 0; round < VOICE_REJOIN_DELAYS_MS.length; round++) {
    drop();
    await vi.advanceTimersByTimeAsync(VOICE_REJOIN_DELAYS_MS[round]);
    expect(f.status).toBe('connected');
  }
  drop();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(f.connect).toHaveBeenCalledTimes(VOICE_REJOIN_DELAYS_MS.length);
  expect(useVoiceRejoin.getState().rejoin?.phase).toBe('failed');
});

it('shows the reconnecting notice and "Vazgeç ve ayrıl" stops the rejoin and leaves', async () => {
  drop();
  render(<VoiceRejoinNotice />);
  expect(screen.getByRole('status').textContent).toContain('Yeniden bağlanılıyor…');
  expect(screen.getByRole('status').textContent).toContain('Deneme 1/8');
  fireEvent.click(screen.getByRole('button', { name: 'Vazgeç ve ayrıl' }));
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(f.grant).not.toHaveBeenCalled();
  expect(useVoiceContext.getState().channelId).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});

it('cancelVoiceRejoin during an attempt keeps the person out of the room', async () => {
  let release!: (value: typeof grant) => void;
  f.grant.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
  drop();
  await vi.advanceTimersByTimeAsync(VOICE_REJOIN_DELAYS_MS[0]);
  expect(useVoiceRejoin.getState().rejoin?.phase).toBe('joining');
  const leaving = cancelVoiceRejoin();
  release(grant);
  await leaving;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.connect).not.toHaveBeenCalled();
  expect(useVoiceContext.getState().channelId).toBeNull();
  expect(useVoiceRejoin.getState().rejoin).toBeNull();
});
