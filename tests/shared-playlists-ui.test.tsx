// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DesktopBridge } from '@rooms/contracts';
import { SharedPlaylists } from '../apps/desktop/src/SharedPlaylists';
import { useCommunity } from '../apps/desktop/src/community';
import { queryClient } from '../apps/desktop/src/query-client';
const original = useCommunity.getState();
const item = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  revision: 3,
  name: 'Friends',
  updatedAt: '2026-10-15T12:00:00Z',
  tracks: [
    { videoId: 'abcdefghijk', title: 'One', durationSec: 100 },
    { videoId: 'lmnopqrstuv', title: 'Two', durationSec: 200 },
  ],
};
beforeEach(() => {
  queryClient.clear();
  useCommunity.setState({
    user: { id: 'alice', username: 'alice', displayName: 'Alice', avatar: null },
    serverUrl: 'https://example.test',
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  useCommunity.setState(original, true);
  delete window.rooms;
});
it('edits a shared revision, changes order and distinguishes enqueue from play-now', async () => {
  const changePlaylist = vi.fn(async () => [{ ...item, revision: 4 }]),
    play = vi.fn(async () => {});
  window.rooms = {
    music: { playlists: async () => [item], changePlaylist },
  } as unknown as DesktopBridge;
  render(<SharedPlaylists channelId="room" canPlay play={play} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Friends 2 parça' }));
  fireEvent.click(screen.getByRole('button', { name: '2. parçayı yukarı taşı' }));
  fireEvent.click(screen.getByRole('button', { name: 'Listeyi kuyruğa ekle' }));
  expect(play).toHaveBeenLastCalledWith({
    type: 'add-list',
    tracks: [item.tracks[1], item.tracks[0]],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Listeyi şimdi çal' }));
  expect(play).toHaveBeenLastCalledWith({
    type: 'add-list',
    tracks: [item.tracks[1], item.tracks[0]],
    playNow: true,
  });
  fireEvent.change(screen.getByLabelText('Liste adı'), { target: { value: 'Evening' } });
  fireEvent.click(screen.getByRole('button', { name: 'Listeyi kaydet' }));
  await waitFor(() =>
    expect(changePlaylist).toHaveBeenCalledWith('room', {
      op: 'save',
      id: item.id,
      revision: 3,
      name: 'Evening',
      tracks: [item.tracks[1], item.tracks[0]],
    }),
  );
});
it('preserves an unsaved draft on revision conflict and does not retry the write', async () => {
  const changePlaylist = vi.fn(async () => {
    throw Error('Liste başka biri tarafından değiştirildi.');
  });
  const playlists = vi.fn(async () => [item]);
  window.rooms = { music: { playlists, changePlaylist } } as unknown as DesktopBridge;
  render(<SharedPlaylists channelId="room" canPlay play={async () => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Friends 2 parça' }));
  fireEvent.change(screen.getByLabelText('Liste adı'), { target: { value: 'My draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Listeyi kaydet' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(playlists).toHaveBeenCalledTimes(2));
  expect(changePlaylist).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText('Liste adı') as HTMLInputElement).value).toBe('My draft');
});
it('imports only an explicit YouTube playlist and saves the queue as a separate list', async () => {
  const changePlaylist = vi.fn(async () => [item]);
  window.rooms = {
    music: { playlists: async () => [], changePlaylist },
  } as unknown as DesktopBridge;
  render(<SharedPlaylists channelId="room" canPlay play={async () => {}} />);
  fireEvent.change(screen.getByLabelText('Liste adı'), { target: { value: 'Imported' } });
  const input = screen.getByLabelText('Listeye eklenecek YouTube bağlantısı');
  fireEvent.change(input, { target: { value: 'https://example.test/private.m3u?token=secret' } });
  expect(
    (
      screen.getByRole('button', {
        name: 'YouTube listesini yeni liste olarak aktar',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(input, {
    target: { value: 'https://www.youtube.com/playlist?list=PLabcdefgh123' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'YouTube listesini yeni liste olarak aktar' }),
  );
  await waitFor(() =>
    expect(changePlaylist).toHaveBeenCalledWith('room', {
      op: 'import',
      name: 'Imported',
      url: 'https://www.youtube.com/playlist?list=PLabcdefgh123',
    }),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Kuyruğu yeni listeye kaydet' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Kuyruğu yeni listeye kaydet' }));
  await waitFor(() =>
    expect(changePlaylist).toHaveBeenLastCalledWith('room', { op: 'saveQueue', name: 'Friends' }),
  );
});
