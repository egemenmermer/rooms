// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DesktopBridge } from '@rooms/contracts';
import { CommunityChat } from '../apps/desktop/src/RealSocial';
import { useCommunity } from '../apps/desktop/src/community';
import { deserializeMentions, serializeMentions } from '../apps/desktop/src/mentions';
vi.mock('../apps/desktop/src/VoiceAvatar', () => ({ VoiceAvatar: () => null }));
vi.mock('../apps/desktop/src/realtime', () => ({
  stopSoundboard: vi.fn(),
  useRealtime: () => ({ channelId: null, participants: [], status: 'not-configured' }),
}));
vi.mock('../apps/desktop/src/activity', () => ({
  useActivityRoom: () => ({ status: 'not-configured', room: null }),
}));
const user = { id: 'alice', username: 'alice', displayName: 'Alice', avatar: null };
const bob = { id: 'bob', username: 'bob', displayName: 'Bob', avatar: null };
const message = (id: string, content: string, author = user) => ({
  id,
  channelId: 'channel',
  author,
  content,
  timestamp: '2026-10-16T09:00:00Z',
  editedTimestamp: null,
  reactions: {},
});
const editMessage = vi.fn(async () => {});
beforeEach(() => {
  editMessage.mockClear();
  useCommunity.setState({
    user,
    serverUrl: 'https://example.test',
    status: 'connected',
    activeChannelId: 'channel',
    channels: [],
    messages: [
      message('m1', 'ilk <@bob> mesaj'),
      message('m2', 'bak https://rooms.example/a?b=1.', bob),
    ],
    typing: {},
    unread: {},
    loadingMessages: false,
    hasOlder: false,
    editMessage,
  });
});
afterEach(() => {
  cleanup();
  delete window.rooms;
});
const renderChat = (notify = vi.fn()) =>
  render(
    <MemoryRouter>
      <CommunityChat notify={notify} />
    </MemoryRouter>,
  );

it('renders message URLs as external links without trailing punctuation', () => {
  renderChat();
  const link = screen.getByRole('link', { name: 'https://rooms.example/a?b=1' });
  expect(link.getAttribute('href')).toBe('https://rooms.example/a?b=1');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toContain('noopener');
});

it('edits the last own message in the composer and restores the unsent draft on Escape', async () => {
  renderChat();
  const box = screen.getByRole('textbox', { name: 'Kanala mesaj yaz' }) as HTMLTextAreaElement;
  fireEvent.keyDown(box, { key: 'ArrowUp' });
  const editor = (await screen.findByRole('textbox', {
    name: 'Mesajı düzenle',
  })) as HTMLTextAreaElement;
  expect(editor.value).toBe('ilk @Bob mesaj');
  expect(screen.getByRole('status').textContent).toContain('Mesajı düzenliyorsun');
  fireEvent.keyDown(editor, { key: 'Escape' });
  await waitFor(() =>
    expect(
      (screen.getByRole('textbox', { name: 'Kanala mesaj yaz' }) as HTMLTextAreaElement).value,
    ).toBe(''),
  );
  expect(editMessage).not.toHaveBeenCalled();
});

it('saves an edit with Enter and keeps mentions canonical', async () => {
  renderChat();
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Kanala mesaj yaz' }), { key: 'ArrowUp' });
  const editor = (await screen.findByRole('textbox', {
    name: 'Mesajı düzenle',
  })) as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: 'ilk @Bob mesaj düzeldi', selectionStart: 22 } });
  await act(async () => {
    fireEvent.keyDown(editor, { key: 'Enter' });
  });
  await waitFor(() => expect(editMessage).toHaveBeenCalledWith('m1', 'ilk <@bob> mesaj düzeldi'));
  expect(screen.getByRole('textbox', { name: 'Kanala mesaj yaz' })).toBeTruthy();
});

it('uploads dropped files through the validated attachment bridge', async () => {
  const dropAttachment = vi.fn(async (_channel: string, name: string, data: Uint8Array) => ({
    id: 'file-1',
    name,
    size: data.byteLength,
    mime: 'image/png',
  }));
  window.rooms = {
    social: { dropAttachment, discardAttachment: vi.fn() },
  } as unknown as DesktopBridge;
  const { container } = renderChat();
  // jsdom's File lacks arrayBuffer(); Chromium provides it in the app.
  const file = Object.assign(
    new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' }),
    {
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    },
  );
  const page = container.querySelector('.chat-page')!;
  const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' };
  fireEvent.dragOver(page, { dataTransfer });
  expect(page.className).toContain('is-dropping');
  await act(async () => {
    fireEvent.drop(page, { dataTransfer });
  });
  await waitFor(() => expect(dropAttachment).toHaveBeenCalled());
  const [channel, name, bytes] = dropAttachment.mock.calls[0];
  expect([channel, name, [...bytes]]).toEqual(['channel', 'foto.png', [1, 2, 3]]);
  expect(await screen.findByText('foto.png')).toBeTruthy();
  expect(page.className).not.toContain('is-dropping');
});

it('round-trips canonical mentions through readable labels', () => {
  const names: Record<string, string> = { bob: 'Bob Builder' };
  const loaded = deserializeMentions('selam <@bob> ve <@ghost>', (id) => names[id]);
  expect(loaded.text).toBe('selam @Bob Builder ve <@ghost>');
  expect(serializeMentions(loaded.text, loaded.bindings)).toBe('selam <@bob> ve <@ghost>');
});

it('attaches pasted image files and asks the native clipboard when the paste carries none', async () => {
  const dropAttachment = vi.fn(async (_channel: string, name: string, data: Uint8Array) => ({
    id: 'pasted-file',
    name,
    size: data.byteLength,
    mime: 'image/png',
  }));
  const pasteAttachment = vi.fn(async () => ({
    id: 'native',
    name: 'pano-20261016.png',
    size: 4,
    mime: 'image/png',
  }));
  window.rooms = {
    social: { dropAttachment, pasteAttachment, discardAttachment: vi.fn() },
  } as unknown as DesktopBridge;
  renderChat();
  const box = screen.getByRole('textbox', { name: 'Kanala mesaj yaz' });
  const file = Object.assign(new File([new Uint8Array([5])], 'image.png', { type: 'image/png' }), {
    arrayBuffer: async () => new Uint8Array([5]).buffer,
  });
  await act(async () => {
    fireEvent.paste(box, {
      clipboardData: {
        items: [{ kind: 'file', getAsFile: () => file }],
        files: [],
        types: ['Files'],
      },
    });
  });
  await waitFor(() => expect(dropAttachment).toHaveBeenCalled());
  expect(pasteAttachment).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.paste(box, { clipboardData: { items: [], files: [], types: ['Files'] } });
  });
  await waitFor(() => expect(pasteAttachment).toHaveBeenCalledWith('channel'));
  expect(await screen.findByText('pano-20261016.png')).toBeTruthy();
  await act(async () => {
    fireEvent.paste(box, { clipboardData: { items: [], files: [], types: ['text/plain'] } });
  });
  expect(pasteAttachment).toHaveBeenCalledTimes(1);
});
