// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatAttachment } from '../apps/desktop/src/ChatAttachment';
import { useCommunity } from '../apps/desktop/src/community';
import type { DesktopBridge } from '../packages/shared-contracts/src';
afterEach(() => {
  cleanup();
  delete window.rooms;
});
it('renders authorized inline image data and expands it instead of a broken remote image', async () => {
  const image = vi.fn(async () => 'data:image/png;base64,AA==');
  window.rooms = { social: { attachmentImage: image } } as unknown as DesktopBridge;
  useCommunity.setState({
    serverUrl: 'https://qa.test',
    user: { id: 'owner', username: 'owner', displayName: 'Owner', avatar: null },
  });
  render(
    <ChatAttachment
      file={{
        id: 'file',
        name: 'photo.png',
        size: 2,
        mime: 'image/png',
        url: 'https://qa.test/autumn/attachments/file/photo.png',
      }}
      channelId="room"
      messageId="message"
    />,
  );
  const button = await screen.findByRole('button', { name: 'photo.png fotoğrafını büyüt' });
  expect(image).toHaveBeenCalledWith('room', 'message', 'file');
  expect(button.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
  fireEvent.click(button);
  expect(screen.getByRole('dialog')).toBeTruthy();
});
it('shows retry for image lookup failure and never embeds an arbitrary remote attachment URL', async () => {
  window.rooms = {
    social: {
      attachmentImage: vi.fn(async () => {
        throw Error('access changed');
      }),
    },
  } as unknown as DesktopBridge;
  const view = render(
    <ChatAttachment
      file={{
        id: 'file',
        name: 'photo.png',
        size: 2,
        mime: 'image/png',
        url: 'https://evil.test/image',
      }}
      channelId="room"
      messageId="message"
    />,
  );
  await screen.findByText('Fotoğraf yüklenemedi.');
  expect(view.container.querySelector('img')).toBeNull();
  expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
});
