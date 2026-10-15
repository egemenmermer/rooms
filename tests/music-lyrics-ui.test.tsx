// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MusicLyrics } from '../apps/desktop/src/MusicLyrics';
import type { DesktopBridge } from '../packages/shared-contracts/src';
import type { MusicLyrics as Lyrics } from '../packages/shared-contracts/src/music-lyrics';
afterEach(() => {
  cleanup();
  delete window.rooms;
});
it('looks up only after opening and follows confirmed seeks/pauses', async () => {
  const lyrics = vi.fn(async (): Promise<Lyrics> => ({
    status: 'found',
    provider: 'LRCLIB',
    lines: [
      { time: 0, text: 'Fixture one' },
      { time: 10, text: 'Fixture two' },
    ],
  }));
  window.rooms = { music: { lyrics } } as unknown as DesktopBridge;
  const props = {
    channelId: 'room',
    trackId: 'track',
    position: 0,
    playing: false,
    receivedAt: Date.now(),
  };
  const view = render(<MusicLyrics {...props} />);
  expect(lyrics).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Şarkı sözleri' }));
  expect((await screen.findByText('Fixture one')).getAttribute('aria-current')).toBe('true');
  view.rerender(<MusicLyrics {...props} position={12} />);
  expect(screen.getByText('Fixture two').getAttribute('aria-current')).toBe('true');
  expect(lyrics).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Şarkı sözleri' }));
  expect(screen.queryByText('Fixture one')).toBeNull();
});
it('does not replace a new track with a late response for the previous track', async () => {
  let finish!: (value: Lyrics) => void;
  const lyrics = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Lyrics>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ status: 'instrumental' });
  window.rooms = { music: { lyrics } } as unknown as DesktopBridge;
  const props = {
    channelId: 'room',
    trackId: 'old',
    position: 0,
    playing: false,
    receivedAt: Date.now(),
  };
  const view = render(<MusicLyrics {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Şarkı sözleri' }));
  view.rerender(<MusicLyrics {...props} trackId="new" />);
  await screen.findByText('Bu kayıt enstrümantal olarak işaretlenmiş.');
  finish({ status: 'found', provider: 'LRCLIB', lines: [{ time: 0, text: 'Stale fixture' }] });
  await Promise.resolve();
  expect(screen.queryByText('Stale fixture')).toBeNull();
});
