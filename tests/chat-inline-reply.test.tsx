// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DesktopBridge } from '@rooms/contracts';
import { CommunityChat, quoteReply } from '../apps/desktop/src/RealSocial';
import { useCommunity } from '../apps/desktop/src/community';
vi.mock('../apps/desktop/src/VoiceAvatar', () => ({ VoiceAvatar: () => null }));
vi.mock('../apps/desktop/src/realtime', () => ({
  useVoiceRejoin: (select: (state: { rejoin: null }) => unknown) => select({ rejoin: null }),
  stopSoundboard: vi.fn(),
  useRealtime: () => ({ channelId: null, participants: [], status: 'not-configured' }),
}));
vi.mock('../apps/desktop/src/activity', () => ({
  useActivityRoom: () => ({ status: 'not-configured', room: null }),
}));
const alice = { id: 'alice', username: 'alice', displayName: 'Alice', avatar: null };
const bob = { id: 'bob', username: 'bob', displayName: 'Bob', avatar: null };
const message = (id: string, content: string, author = alice) => ({
  id,
  channelId: 'channel',
  author,
  content,
  timestamp: '2026-10-16T09:00:00Z',
  editedTimestamp: null,
  reactions: {},
});
const send = vi.fn(async () => {});
const reactMessage = vi.fn(async () => {});
beforeEach(() => {
  send.mockClear();
  reactMessage.mockClear();
  useCommunity.setState({
    user: alice,
    serverUrl: 'https://example.test',
    status: 'connected',
    activeChannelId: 'channel',
    channels: [{ id: 'channel', spaceId: 'space', name: 'genel', type: 0, topic: null }],
    dms: [],
    messages: [message('m1', 'merhaba'), message('m2', 'akşam film var mı?\nsaat 9', bob)],
    typing: {},
    unread: {},
    loadingMessages: false,
    hasOlder: false,
    send,
    reactMessage,
  });
  window.rooms = {
    social: { typing: vi.fn(async () => {}) },
  } as unknown as DesktopBridge;
});
afterEach(() => {
  cleanup();
  delete window.rooms;
});
const renderChat = () =>
  render(
    <MemoryRouter>
      <CommunityChat notify={vi.fn()} />
    </MemoryRouter>,
  );
const composer = () => screen.getByRole('textbox', { name: 'Kanala mesaj yaz' });

it('keeps the quote transport format other clients already render', () => {
  expect(quoteReply({ author: bob, content: 'bir\niki' }, 'tamam')).toBe(
    '> Bob: bir\n> iki\n\ntamam',
  );
  const long = quoteReply({ author: { ...bob, displayName: '' }, content: 'x'.repeat(500) }, 'y');
  expect(long).toBe(`> bob: ${'x'.repeat(400)}\n\ny`);
});

it('replies inline above the composer and sends the quote with the reply', async () => {
  renderChat();
  fireEvent.click(screen.getAllByRole('button', { name: 'Yanıtla' })[1]!);
  // No modal: the bar above the composer names who is being answered.
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Yanıtlanıyor: Bob');
  fireEvent.change(composer(), { target: { value: 'evet', selectionStart: 4 } });
  await act(async () => {
    fireEvent.keyDown(composer(), { key: 'Enter' });
  });
  expect(send).toHaveBeenCalledWith('> Bob: akşam film var mı?\n> saat 9\n\nevet', []);
  expect(screen.queryByText('Yanıtlanıyor: Bob')).toBeNull();
});

it('cancels an inline reply with Escape or its close button', () => {
  renderChat();
  fireEvent.click(screen.getAllByRole('button', { name: 'Yanıtla' })[1]!);
  fireEvent.keyDown(composer(), { key: 'Escape' });
  expect(screen.queryByText('Yanıtlanıyor: Bob')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Yanıtla' })[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Yanıtı iptal et' }));
  expect(screen.queryByText('Yanıtlanıyor: Alice')).toBeNull();
});

it('opens the reaction picker as a popover on the message, not a modal', async () => {
  renderChat();
  fireEvent.click(screen.getAllByRole('button', { name: 'Reaksiyon ekle' })[1]!);
  const popover = screen.getByRole('dialog', { name: 'Bir reaksiyon bırak' });
  expect(popover.closest('article')?.id).toBe('message-m2');
  expect(document.querySelector('.modal')).toBeNull();
  await act(async () => {
    fireEvent.click(within(popover).getByRole('button', { name: 'Kalp reaksiyonunu ekle' }));
  });
  expect(reactMessage).toHaveBeenCalledWith('m2', '❤️');
  expect(screen.queryByRole('dialog', { name: 'Bir reaksiyon bırak' })).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Reaksiyon ekle' })[0]!);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Bir reaksiyon bırak' })).toBeNull();
});

it('drops controls that can never work and leaves members and search to the toolbar', async () => {
  renderChat();
  expect(screen.queryByRole('button', { name: /Sabitlenmiş mesajlar/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Üyeler paneli/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /mesajlarda ara/ })).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Mesaj seçenekleri' })[0]!);
  const options = await screen.findByRole('dialog');
  expect(within(options).queryByRole('button', { name: /sabitle/ })).toBeNull();
  expect(within(options).queryByRole('button', { name: /bağlantısını kopyala/ })).toBeNull();
  // Without a connected assistant its actions are hidden, not left to fail.
  expect(within(options).queryByRole('button', { name: /Asistana gönder/ })).toBeNull();
});

it('shows the assistant tag only when an assistant is connected', async () => {
  const { unmount } = renderChat();
  expect(screen.queryByRole('button', { name: 'Asistanı etiketle' })).toBeNull();
  unmount();
  window.rooms = {
    social: { typing: vi.fn(async () => {}) },
    agent: { status: vi.fn(async () => ({ connected: true, capabilities: [] })) },
  } as unknown as DesktopBridge;
  renderChat();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Asistanı etiketle' })).toBeTruthy(),
  );
});

it('greets a direct message by the person, not as a #channel', () => {
  useCommunity.setState({
    activeChannelId: 'dm',
    channels: [],
    dms: [{ id: 'dm', spaceId: null, name: 'Bob', type: 1, topic: null, recipients: [alice, bob] }],
    messages: [],
  });
  renderChat();
  expect(screen.getByText('Bob ile konuşman burada başlıyor.')).toBeTruthy();
  expect(screen.queryByText(/#Bob/)).toBeNull();
});
