// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  AgentModelsSurface,
  AgentConnectionsSurface,
  AgentMemorySurface,
  type AgentModelsProps,
  type AgentMemoryProps,
} from '../apps/desktop/src/Agent';
import {
  getS59Fixture,
  getS60Fixture,
  getS61Fixture,
  S59_VARIANTS,
  S60_VARIANTS,
  S61_VARIANTS,
} from '../apps/desktop/src/dev/S59S61Entry';
import type { AgentBridge, AgentMemory, ModelConnection } from '../packages/agent-contracts/src';
import type { SocialMessage } from '@rooms/social';
afterEach(cleanup);
const own: ModelConnection = {
  id: 'own',
  ownerId: 'owner',
  provider: 'openrouter',
  label: 'Own connection',
  model: 'own/model',
  status: 'connected',
};
const models = (): AgentModelsProps => ({
  models: [own, { ...own, id: 'other', ownerId: 'other', label: 'PRIVATE OTHER CONNECTION' }],
  userId: 'owner',
  ready: true,
  onRefresh: vi.fn(async () => {}),
});
const mount = (element: React.ReactNode) => render(<MemoryRouter>{element}</MemoryRouter>);
const message: SocialMessage = {
  id: 'source',
  channelId: 'room',
  author: { id: 'author', username: 'Author', displayName: 'Author', avatar: null },
  content: 'Fresh verified source',
  timestamp: '2026-10-10T19:00:00Z',
  editedTimestamp: null,
  attachments: [],
};
const note: AgentMemory = {
  id: 'note',
  roomId: 'room',
  authorId: 'owner',
  text: 'Cached saved source',
  sourceMessageId: 'source',
  createdAt: '2026-10-10T19:00:00Z',
};
const memory = (): AgentMemoryProps => ({
  memories: [note, { ...note, id: 'other', roomId: 'other-room', text: 'PRIVATE OTHER ROOM' }],
  userId: 'owner',
  roomId: 'room',
  roomName: 'Room',
  channelName: 'channel',
  ready: true,
  onRefresh: vi.fn(async () => {}),
  loadSource: vi.fn(async () => message),
  sourceCandidates: [message],
});
describe('S59 personal model boundaries', () => {
  it('shows only own metadata, starts with no selected fallback and has no stored-key mask', () => {
    mount(<AgentModelsSurface {...models()} />);
    expect(screen.queryByText('PRIVATE OTHER CONNECTION')).toBeNull();
    expect((screen.getByLabelText('Kişisel bağlantın') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('OpenRouter API anahtarı') as HTMLInputElement).value).toBe('');
  });
  it('submits a transient own key only on click and clears it before IPC returns', async () => {
    const p = models();
    let resolve!: (model: ModelConnection) => void;
    const connectModel = vi.fn(
      () =>
        new Promise<ModelConnection>((r) => {
          resolve = r;
        }),
    );
    p.bridge = { connectModel } as unknown as AgentBridge;
    mount(<AgentModelsSurface {...p} />);
    fireEvent.change(screen.getByLabelText('OpenRouter API anahtarı'), {
      target: { value: 'private-key-for-focused-test' },
    });
    fireEvent.change(screen.getByLabelText('OpenRouter model'), {
      target: { value: 'own/new-model' },
    });
    expect(connectModel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantı ekle' }));
    expect((screen.getByLabelText('OpenRouter API anahtarı') as HTMLInputElement).value).toBe('');
    expect(connectModel).toHaveBeenCalledWith({
      provider: 'openrouter',
      label: 'OpenRouter',
      model: 'own/new-model',
      apiKey: 'private-key-for-focused-test',
    });
    await act(async () => resolve(own));
    await waitFor(() => expect(p.onRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status').textContent).toContain(
      'Model erişimi görev sırasında doğrulanır',
    );
  });
  it('does not accept another-owner model receipt', async () => {
    const p = models();
    p.bridge = {
      connectModel: vi.fn(async () => ({ ...own, ownerId: 'other' })),
    } as unknown as AgentBridge;
    mount(<AgentModelsSurface {...p} />);
    fireEvent.change(screen.getByLabelText('OpenRouter API anahtarı'), {
      target: { value: 'private-test-key' },
    });
    fireEvent.change(screen.getByLabelText('OpenRouter model'), { target: { value: 'own/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantı ekle' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/Bağlantı kaydedildi/)).toBeNull();
    expect(p.onRefresh).not.toHaveBeenCalled();
  });
  it('discards in-flight receipt and key when access is invalidated', async () => {
    const p = models();
    let resolve!: (m: ModelConnection) => void;
    p.bridge = {
      connectModel: vi.fn(
        () =>
          new Promise<ModelConnection>((r) => {
            resolve = r;
          }),
      ),
    } as unknown as AgentBridge;
    mount(<AgentModelsSurface {...p} />);
    fireEvent.change(screen.getByLabelText('OpenRouter API anahtarı'), {
      target: { value: 'private-test-key' },
    });
    fireEvent.change(screen.getByLabelText('OpenRouter model'), { target: { value: 'own/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantı ekle' }));
    act(() => window.dispatchEvent(new Event('rooms:channel-access-invalidated')));
    await act(async () => resolve(own));
    expect(p.onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Own connection')).toBeNull();
    expect(screen.queryByText(/Bağlantı kaydedildi/)).toBeNull();
  });
  it('requires confirmation before disconnecting and never switches to another model', async () => {
    const p = models();
    p.bridge = { disconnectModel: vi.fn(async () => {}) } as unknown as AgentBridge;
    mount(<AgentModelsSurface {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Own connection bağlantısını kaldır' }));
    expect(p.bridge.disconnectModel).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Bağlantıyı kaldır' }),
    );
    await waitFor(() => expect(p.bridge!.disconnectModel).toHaveBeenCalledWith('own'));
    expect((screen.getByLabelText('Kişisel bağlantın') as HTMLSelectElement).value).toBe('');
  });
  it('official login management has no password or subscription-token field and no fake OAuth launch', () => {
    mount(<AgentModelsSurface {...models()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Resmî oturum bağlantısı' })[0]);
    expect(screen.getByRole('dialog').textContent).toContain(
      'Giriş başlatma bağlantısı bu hizmette sunulmuyor',
    );
    expect(within(screen.getByRole('dialog')).queryByLabelText(/Parola/)).toBeNull();
    expect(within(screen.getByRole('dialog')).queryByLabelText(/token/i)).toBeNull();
  });
  it.each(S59_VARIANTS)(
    'renders DEV %s with production component and no native bridge',
    (variant) => {
      const props = getS59Fixture(variant);
      expect(props.bridge).toBeUndefined();
      mount(<AgentModelsSurface {...props} />);
      expect(screen.getByText('Yerel demo önizlemesi')).toBeTruthy();
      if (variant.includes('waiting')) expect(screen.getByRole('dialog')).toBeTruthy();
    },
  );
});
describe('S60 read-only application grant', () => {
  it('shows a server scope rather than claiming a connected OAuth identity', () => {
    const p = getS60Fixture('default');
    p.fixture = false;
    mount(<AgentConnectionsSurface {...p} />);
    expect(screen.queryByText('Bağlı')).toBeNull();
    expect(screen.getAllByText('Kapsam tanımlı')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'GitHub ile bağlan' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
  it('does not display private resources from a wrong identity or room', () => {
    const p = getS60Fixture('default');
    p.userId = 'other';
    mount(<AgentConnectionsSurface {...p} />);
    expect(screen.queryByText('rooms-space/film-night-notes')).toBeNull();
  });
  it('scope review is read-only and cannot increase access', () => {
    mount(<AgentConnectionsSurface {...getS60Fixture('scope')} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('checkbox').hasAttribute('disabled')).toBe(true);
    expect(
      within(dialog).getByRole('button', { name: 'Seçimi kaydet' }).hasAttribute('disabled'),
    ).toBe(true);
  });
  it('clears visible resource names and closes private modal on access invalidation', () => {
    const p = getS60Fixture('scope');
    p.fixture = false;
    mount(<AgentConnectionsSurface {...p} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Kapsamı incele' })[0]);
    act(() => window.dispatchEvent(new Event('rooms:channel-access-invalidated')));
    expect(screen.queryByText('rooms-space/film-night-notes')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it.each(S60_VARIANTS)('renders exact DEV %s safely', (variant) => {
    mount(<AgentConnectionsSurface {...getS60Fixture(variant)} />);
    expect(screen.getByText('Yerel demo önizlemesi')).toBeTruthy();
    if (variant === 'scope' || variant === 'drive_scope')
      expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
describe('S61 explicit room memory', () => {
  it('never writes memory on mount and filters room data', async () => {
    const p = memory();
    p.bridge = { saveMemory: vi.fn() } as unknown as AgentBridge;
    mount(<AgentMemorySurface {...p} />);
    await screen.findByText('Cached saved source');
    expect(screen.queryByText('PRIVATE OTHER ROOM')).toBeNull();
    expect(p.bridge.saveMemory).not.toHaveBeenCalled();
    expect(screen.getByText(/Sohbetler ve asistan konuşmaları kendiliğinden/)).toBeTruthy();
  });
  it('does not expose cached source text before fresh authorization or after a denial', async () => {
    const p = memory();
    p.loadSource = vi.fn(async () => null);
    mount(<AgentMemorySurface {...p} />);
    expect(screen.queryByText('Cached saved source')).toBeNull();
    await screen.findByText('Kaynak doğrulanamadı. İçerik önizlemesi kapalı.');
    expect(screen.queryByText('Cached saved source')).toBeNull();
    expect(screen.getByRole('button', { name: 'Kaynak mesaj' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
  it('previews fresh source rather than cached memory and refetches on every open', async () => {
    const p = memory();
    mount(<AgentMemorySurface {...p} />);
    await screen.findByText('Cached saved source');
    fireEvent.click(screen.getByRole('button', { name: 'Kaynak mesaj' }));
    await waitFor(() =>
      expect(within(screen.getByRole('dialog')).getByText('Fresh verified source')).toBeTruthy(),
    );
    expect(within(screen.getByRole('dialog')).queryByText('Cached saved source')).toBeNull();
    expect(p.loadSource).toHaveBeenCalledTimes(2);
  });
  it('save uses reauthorized source text and sends only after explicit confirmation', async () => {
    const p = memory(),
      saveMemory = vi.fn(async () => note);
    p.bridge = { saveMemory } as unknown as AgentBridge;
    mount(<AgentMemorySurface {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mesajdan kaydet' }));
    fireEvent.change(screen.getByLabelText('Kaynak mesaj seç'), { target: { value: 'source' } });
    expect(saveMemory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hafızaya kaydet' }));
    await waitFor(() =>
      expect(saveMemory).toHaveBeenCalledWith({
        roomId: 'room',
        sourceMessageId: 'source',
        text: 'Fresh verified source',
      }),
    );
    expect(p.onRefresh).toHaveBeenCalledTimes(1);
  });
  it('deleting a memory never deletes the social message and occurs only after review', async () => {
    const p = memory(),
      deleteMemory = vi.fn(async () => {});
    p.bridge = { deleteMemory } as unknown as AgentBridge;
    mount(<AgentMemorySurface {...p} />);
    await screen.findByText('Cached saved source');
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(deleteMemory).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toContain('Kaynak sohbet mesajı yerinde kalır');
    fireEvent.click(screen.getByRole('button', { name: 'Hafızadan sil' }));
    await waitFor(() => expect(deleteMemory).toHaveBeenCalledWith('note'));
    expect(p.onRefresh).toHaveBeenCalledTimes(1);
  });
  it('discards a pending source response after invalidation', async () => {
    const p = memory();
    let resolve!: (m: SocialMessage | null) => void;
    p.loadSource = vi.fn(
      () =>
        new Promise<SocialMessage | null>((r) => {
          resolve = r;
        }),
    );
    mount(<AgentMemorySurface {...p} />);
    act(() => window.dispatchEvent(new Event('rooms:channel-access-invalidated')));
    await act(async () => resolve(message));
    expect(screen.queryByText('Cached saved source')).toBeNull();
    expect(screen.queryByText('Fresh verified source')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();
  });
  it.each(S61_VARIANTS)('renders DEV %s without allowing account mutations', (variant) => {
    const p = getS61Fixture(variant);
    expect(p.bridge).toBeUndefined();
    mount(<AgentMemorySurface {...p} />);
    expect(screen.getByText('Yerel demo önizlemesi')).toBeTruthy();
    if (['source', 'save', 'delete'].includes(variant))
      expect(screen.getByRole('dialog')).toBeTruthy();
    if (variant === 'permission')
      expect(
        screen.queryByText(
          'Cumartesi 21.00’de buluşuyoruz. Herkes kendi kaynağıyla senkron katılıyor.',
        ),
      ).toBeNull();
  });
});
