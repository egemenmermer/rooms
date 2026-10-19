// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Timeline } from '../packages/activity-protocol/src';
import { CinemaYouTubeStage } from '../apps/desktop/src/CinemaYouTubeStage';

const player = { url: 'https://rooms.test/rooms-activities/player/youtube?x=1', nonce: 'n-1' };
vi.mock('../apps/desktop/src/runtime-sources', () => ({
  activityBridge: () => ({ youtubePlayer: vi.fn(async () => player) }),
}));
afterEach(cleanup);

const item = {
  id: 'a',
  addedBy: 'ece',
  media: { kind: 'youtube' as const, videoId: 'aaaaaaaaaaa', title: 'İlk video' },
};
const next = {
  id: 'b',
  addedBy: 'ece',
  media: { kind: 'youtube' as const, videoId: 'bbbbbbbbbbb', title: 'İkinci' },
};
async function mount(timeline: Timeline, canDirect = true) {
  const quiet = vi.fn(),
    send = vi.fn(),
    onEnded = vi.fn();
  // The player URL resolves asynchronously. Mounting inside an async act flushes that render and the
  // message listener effect before any player message is posted, so a slow CI worker cannot drop one.
  await act(async () => {
    render(
      <CinemaYouTubeStage
        item={item}
        timeline={timeline}
        serverOffsetMs={0}
        next={next}
        canDirect={canDirect}
        directReason="Kumanda hostta."
        connected
        addedBy="Ece"
        fullscreen={false}
        send={send}
        quiet={quiet}
        onToggleFullscreen={vi.fn()}
        onEnded={onEnded}
        onOpenSource={vi.fn()}
      />,
    );
  });
  const frame = screen.getByTitle('YouTube: İlk video') as HTMLIFrameElement;
  const emit = (event: string, data: Record<string, unknown> = {}) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'rooms-youtube', nonce: player.nonce, event, data },
          origin: 'https://rooms.test',
          source: frame.contentWindow,
        }),
      );
    });
  emit('ready');
  return { quiet, send, onEnded, emit };
}
const playing = (positionSec: number): Timeline => ({
  playing: true,
  positionSec,
  rate: 1,
  effectiveServerTimeMs: Date.now(),
  epoch: 1,
  itemId: 'a',
});

it('moves the room to the next video when the playing one ends', async () => {
  const { quiet, onEnded, emit } = await mount(playing(299));
  emit('state', { state: 1, positionSec: 299 });
  emit('position', { state: 0, positionSec: 300, durationSec: 300 });
  emit('state', { state: 0, positionSec: 300 });
  expect(onEnded).toHaveBeenCalledWith('a');
  expect(quiet).toHaveBeenCalledOnce();
  expect(quiet).toHaveBeenCalledWith({ type: 'queue.next', fromItemId: 'a', reason: 'ended' });
});

it('follows the room instead of skipping when only this player ran ahead', async () => {
  const { quiet, onEnded, emit } = await mount(playing(40));
  emit('position', { state: 0, positionSec: 300, durationSec: 300 });
  expect(onEnded).not.toHaveBeenCalled();
  expect(quiet).not.toHaveBeenCalled();
});

it('shows viewers a paused screen they cannot start, and lets a controller skip', async () => {
  const paused = { ...playing(10), playing: false };
  const view = await mount(paused, false);
  const big = document.querySelector<HTMLButtonElement>('.cozy-yt-bigplay')!;
  expect(big.disabled).toBe(true);
  expect(big.title).toBe('Kumanda hostta.');
  cleanup();
  const controller = await mount(paused, true);
  fireEvent.click(screen.getByRole('button', { name: 'Sıradaki video' }));
  expect(controller.send).toHaveBeenCalledWith({
    type: 'queue.next',
    fromItemId: 'a',
    reason: 'skip',
  });
  expect(view.send).not.toHaveBeenCalled();
});

it('leaves Space and arrows to the page in front while it plays in a corner', async () => {
  const send = vi.fn();
  const props = {
    item,
    timeline: playing(40),
    serverOffsetMs: 0,
    next,
    canDirect: true,
    directReason: 'Kumanda hostta.',
    connected: true,
    addedBy: 'Ece',
    fullscreen: false,
    send,
    quiet: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onEnded: vi.fn(),
    onOpenSource: vi.fn(),
  };
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<CinemaYouTubeStage {...props} keyboard={false} />);
  });
  fireEvent.keyDown(document.body, { key: ' ' });
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  expect(send).not.toHaveBeenCalled();
  // In front, on the hall page, the same keys act for the hall.
  view.rerender(<CinemaYouTubeStage {...props} />);
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'playback', rate: 1 }));
});
