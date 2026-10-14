// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useRooms } from '../apps/desktop/src/store';
import { useCommunity } from '../apps/desktop/src/community';
const f = vi.hoisted(() => ({
  snapshot: { status: 'not-configured', roomId: null, deafened: false, participants: [] } as any,
  listeners: new Set<() => void>(),
  play: vi.fn(),
  sink: vi.fn(),
  pause: vi.fn(),
}));
vi.mock('../apps/desktop/src/runtime-sources', () => ({
  mediaProvider: () => ({
    snapshot: () => f.snapshot,
    subscribeState: (fn: () => void) => {
      f.listeners.add(fn);
      return () => f.listeners.delete(fn);
    },
  }),
}));
vi.mock('../apps/desktop/src/realtime', async () => {
  const { create } = await import('zustand');
  return { useVoiceContext: create(() => ({ channelId: null, busy: false })) };
});
import { RoomEventSounds } from '../apps/desktop/src/room-event-sounds';
const prefs = useRooms.getState().preferences,
  community = useCommunity.getState();
beforeEach(() => {
  f.play.mockClear();
  f.sink.mockClear();
  f.pause.mockClear();
  f.listeners.clear();
  f.snapshot = { status: 'not-configured', roomId: null, deafened: false, participants: [] };
  vi.stubGlobal(
    'Audio',
    class {
      volume = 0;
      paused = true;
      onended = null;
      setSinkId = f.sink;
      async play() {
        this.paused = false;
        f.play();
      }
      pause() {
        f.pause();
      }
    },
  );
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:local-original-cue';
      }
    },
  );
  useCommunity.setState({
    user: { id: 'self', username: 'Self', displayName: 'Self', avatar: null },
    serverUrl: 'https://test',
  });
  useRooms.setState({ preferences: { ...prefs, roomEventSounds: true, outputId: 'headphones' } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useRooms.setState({ preferences: prefs });
  useCommunity.setState(community);
});
async function connect() {
  await act(async () => {
    f.snapshot = {
      status: 'connected',
      roomId: 'room',
      deafened: false,
      participants: [
        { id: 'self', local: true },
        { id: 'friend', local: false },
      ],
    };
    for (const fn of f.listeners) fn();
  });
}
it('routes local cue to chosen output, coalesces initial events and cleans subscriptions', async () => {
  const view = render(<RoomEventSounds />);
  await connect();
  await waitFor(() => expect(f.play).toHaveBeenCalledTimes(1));
  expect(f.sink).toHaveBeenCalledWith('headphones');
  await act(async () => {
    for (const fn of f.listeners) {
      fn();
      fn();
    }
  });
  expect(f.play).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(f.listeners.size).toBe(0);
  expect(f.pause).toHaveBeenCalled();
});
it('disabled preference produces no local audio', async () => {
  useRooms.getState().setPreference('roomEventSounds', false);
  render(<RoomEventSounds />);
  await connect();
  expect(f.play).not.toHaveBeenCalled();
  expect(f.sink).not.toHaveBeenCalled();
});
it('deafened participant movements never play or publish cues', async () => {
  render(<RoomEventSounds />);
  await connect();
  f.play.mockClear();
  await act(async () => {
    f.snapshot = {
      ...f.snapshot,
      deafened: true,
      participants: [...f.snapshot.participants, { id: 'new', local: false }],
    };
    for (const fn of f.listeners) fn();
  });
  expect(f.play).not.toHaveBeenCalled();
  expect(f.pause).toHaveBeenCalled();
});
