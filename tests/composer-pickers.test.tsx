// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmojiPicker, GifPicker, isGifMessage } from '../apps/desktop/src/ComposerPickers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as { rooms?: unknown }).rooms;
});
const media = (id: string) => ({
  id,
  title: `Merhaba ${id}`,
  preview: { url: `https://static.klipy.com/sm/${id}.webp`, width: 220, height: 160 },
  gif: { url: `https://static.klipy.com/md/${id}.gif`, width: 498, height: 360 },
});

it('shows only KLIPY CDN GIF messages as images', () => {
  expect(isGifMessage('https://static.klipy.com/md/a1.gif')).toBe(true);
  expect(isGifMessage(' https://static.klipy.com/md/a1.webp ')).toBe(true);
  expect(isGifMessage('https://evil.example/a.gif')).toBe(false);
  expect(isGifMessage('bak https://static.klipy.com/md/a1.gif')).toBe(false);
});

it('starts with trending GIFs, searches after typing settles, and sends the picked GIF', async () => {
  vi.useFakeTimers();
  const gifs = vi.fn(async (query: string) => ({ items: [media(query || 'trend')], more: false }));
  (window as { rooms?: unknown }).rooms = { media: { gifs } };
  const onPick = vi.fn();
  render(<GifPicker onPick={onPick} onClose={() => {}} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(gifs).toHaveBeenLastCalledWith('', 1);
  // KLIPY's required attribution is the search placeholder.
  const search = screen.getByRole('textbox', { name: 'GIF ara' });
  expect(search.getAttribute('placeholder')).toBe('Search KLIPY');
  fireEvent.change(search, { target: { value: 'mer' } });
  fireEvent.change(search, { target: { value: 'merhaba' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(gifs).toHaveBeenCalledTimes(2);
  expect(gifs).toHaveBeenLastCalledWith('merhaba', 1);
  fireEvent.click(screen.getByRole('button', { name: 'Merhaba merhaba' }));
  expect(onPick).toHaveBeenCalledWith(media('merhaba'));
});

it('explains when the server has no GIF key', async () => {
  (window as { rooms?: unknown }).rooms = {
    media: {
      gifs: vi.fn(async () => {
        throw new Error('GIF araması için sunucuya KLIPY anahtarı eklenmeli.');
      }),
    },
  };
  render(<GifPicker onPick={() => {}} onClose={() => {}} />);
  expect((await screen.findByRole('alert')).textContent).toContain('KLIPY anahtarı');
});

it('inserts the chosen emoji and closes with Escape', () => {
  const onPick = vi.fn(),
    onClose = vi.fn();
  render(<EmojiPicker onPick={onPick} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: '🔥' }));
  expect(onPick).toHaveBeenCalledWith('🔥');
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Emoji ekle' }), { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
