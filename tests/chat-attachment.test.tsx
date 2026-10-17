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
it('downloads files through the native message-scoped save flow instead of opening their URL', async () => {
  const download = vi.fn(async () => true);
  window.rooms = { social: { downloadAttachment: download } } as unknown as DesktopBridge;
  const view = render(
    <ChatAttachment
      file={{
        id: 'file',
        name: 'report.txt',
        size: 10,
        mime: 'text/plain',
        url: 'https://qa.test/private',
      }}
      channelId="room"
      messageId="message"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /report.txt/ }));
  expect(download).toHaveBeenCalledWith('room', 'message', 'file');
  expect(view.container.querySelector('a')).toBeNull();
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
  const button = await screen.findByRole('button', { name: 'Fotoğrafı büyüt' });
  expect(image).toHaveBeenCalledWith('room', 'message', 'file');
  expect(button.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
  fireEvent.click(button);
  expect(screen.getByRole('dialog', { name: 'Fotoğraf' })).toBeTruthy();
  expect(screen.queryByText('photo.png')).toBeNull();
  expect(screen.getAllByAltText('Paylaşılan fotoğraf')).toHaveLength(2);
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
      messageId="failed-message"
    />,
  );
  await screen.findByText('Fotoğraf yüklenemedi.');
  expect(view.container.querySelector('img')).toBeNull();
  expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
});
it('reuses a shown photo when the channel is reopened until channel access changes', async () => {
  const image = vi.fn(async () => 'data:image/png;base64,AQ==');
  window.rooms = { social: { attachmentImage: image } } as unknown as DesktopBridge;
  useCommunity.setState({
    serverUrl: 'https://qa.test',
    user: { id: 'owner', username: 'owner', displayName: 'Owner', avatar: null },
  });
  const photo = (
    <ChatAttachment
      file={{ id: 'cached-file', name: 'photo.png', size: 2, mime: 'image/png' }}
      channelId="photos"
      messageId="photo-message"
    />
  );
  const first = render(photo);
  await screen.findByRole('button', { name: 'Fotoğrafı büyüt' });
  first.unmount();
  render(photo);
  expect(screen.getByRole('button', { name: 'Fotoğrafı büyüt' })).toBeTruthy();
  expect(image).toHaveBeenCalledTimes(1);
  cleanup();
  window.dispatchEvent(
    new CustomEvent('rooms:channel-access-invalidated', { detail: { channelIds: ['photos'] } }),
  );
  render(photo);
  await screen.findByRole('button', { name: 'Fotoğrafı büyüt' });
  expect(image).toHaveBeenCalledTimes(2);
});
it('plays a shared video in place once someone presses play', async () => {
  const video = vi.fn(async () => ({
    mime: 'video/quicktime',
    bytes: new Uint8Array([0, 0, 0, 24]),
  }));
  window.rooms = { social: { attachmentVideo: video } } as unknown as DesktopBridge;
  const created: Blob[] = [];
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => (created.push(blob), 'blob:clip'),
      revokeObjectURL: vi.fn(),
    }),
  );
  const view = render(
    <ChatAttachment
      file={{ id: 'clip', name: 'Ekran Kaydı.mov', size: 2_400_000, mime: 'video/quicktime' }}
      channelId="room"
      messageId="video-message"
    />,
  );
  // Opening a channel downloads no video until someone asks for it.
  expect(video).not.toHaveBeenCalled();
  expect(screen.getByText('Video · 2.4 MB')).toBeTruthy();
  expect(screen.queryByText('Ekran Kaydı.mov')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Videoyu oynat' }));
  await screen.findByLabelText('Paylaşılan video');
  expect(video).toHaveBeenCalledWith('room', 'video-message', 'clip');
  expect(view.container.querySelector('video')?.getAttribute('src')).toBe('blob:clip');
  expect(created[0]!.type).toBe('video/mp4');
  expect(screen.getByRole('button', { name: /İndir/ })).toBeTruthy();
  vi.unstubAllGlobals();
});
