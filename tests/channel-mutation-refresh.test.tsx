// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChannelTools } from '../apps/desktop/src/ChannelTools';
import { useCommunity } from '../apps/desktop/src/community';
afterEach(cleanup);
it('does not report a successful native create as failed when the following list refresh fails', async () => {
  window.history.replaceState({}, '', '/');
  const createChannel = vi
    .fn()
    .mockResolvedValue({ id: 'newroom', spaceId: 'server', name: 'test', type: 2, topic: null });
  window.rooms = {
    social: { createChannel, channels: vi.fn().mockRejectedValue(new Error('read unavailable')) },
  } as unknown as NonNullable<Window['rooms']>;
  useCommunity.setState({
    user: { id: 'owner', username: 'owner', displayName: 'Owner', avatar: null },
    serverUrl: 'https://local.example',
    activeSpaceId: 'server',
    activeChannelId: null,
    channels: [],
    spaces: [{ id: 'server', name: 'Server', ownerId: 'owner', icon: null }],
  });
  render(
    <MemoryRouter>
      <ChannelTools>
        <button data-create-type="voice">Create</button>
      </ChannelTools>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('Create'));
  fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Oluştur' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('status').textContent).toContain('Kanal kaydedildi. Liste yenilenemedi.');
  expect(createChannel).toHaveBeenCalledOnce();
  expect(useCommunity.getState().channels).toContainEqual(
    expect.objectContaining({ id: 'newroom', name: 'test' }),
  );
});
it('clears a deleted active conversation even when refreshing the channel list fails', async () => {
  window.history.replaceState({}, '', '/');
  const deleteChannel = vi.fn().mockResolvedValue(undefined);
  window.rooms = {
    social: { deleteChannel, channels: vi.fn().mockRejectedValue(new Error('read unavailable')) },
  } as unknown as NonNullable<Window['rooms']>;
  const channel = { id: 'deleted', spaceId: 'server', name: 'old-chat', type: 0, topic: null };
  useCommunity.setState({
    user: { id: 'owner', username: 'owner', displayName: 'Owner', avatar: null },
    serverUrl: 'https://local.example',
    activeSpaceId: 'server',
    activeChannelId: 'deleted',
    channels: [channel],
    spaces: [{ id: 'server', name: 'Server', ownerId: 'owner', icon: null }],
  });
  render(
    <MemoryRouter>
      <ChannelTools>
        <button data-channel-id="deleted">old-chat</button>
      </ChannelTools>
    </MemoryRouter>,
  );
  fireEvent.contextMenu(screen.getByText('old-chat'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Kanalı sil' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kanalı sil' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(deleteChannel).toHaveBeenCalledOnce();
  expect(useCommunity.getState().activeChannelId).toBeNull();
  expect(useCommunity.getState().messages).toEqual([]);
  expect(useCommunity.getState().channels).toEqual([]);
  expect(screen.getByRole('status').textContent).toContain('Kanal silindi. Liste yenilenemedi.');
});
