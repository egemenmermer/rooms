// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { EmptyState, LoadingView, Modal, Notice } from '../packages/design-system/src/index';
afterEach(cleanup);

describe('Notice', () => {
  it('announces an error at once and keeps its action', () => {
    render(
      <Notice kind="error" title="Bağlantı kesildi" action={<button>Tekrar dene</button>}>
        Sunucuya ulaşılamadı.
      </Notice>,
    );
    const notice = screen.getByRole('alert');
    expect(notice.getAttribute('data-kind')).toBe('error');
    expect(within(notice).getByText('Bağlantı kesildi')).toBeTruthy();
    expect(within(notice).getByText('Sunucuya ulaşılamadı.')).toBeTruthy();
    expect(within(notice).getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });
  it.each(['info', 'success', 'warning'] as const)('uses a polite status for %s', (kind) => {
    render(<Notice kind={kind}>Kaydedildi</Notice>);
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe(kind);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('defaults to info, hides the icon from assistive tech and honours role and icon overrides', () => {
    const { container, rerender } = render(<Notice>İpucu</Notice>);
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('info');
    expect(container.querySelector('.ds-notice-icon')?.getAttribute('aria-hidden')).toBe('true');
    rerender(
      <Notice kind="warning" role="alert" icon={null}>
        Dikkat
      </Notice>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(container.querySelector('.ds-notice-icon')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('keeps the original markup for a single action', () => {
    const { container } = render(
      <EmptyState icon={<i />} title="Topluluk yok" action={<button>Davet bağlantısı aç</button>}>
        Bir davet bağlantısıyla katıl.
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { name: 'Topluluk yok' })).toBeTruthy();
    expect(container.querySelector('.empty-description')?.textContent).toBe(
      'Bir davet bağlantısıyla katıl.',
    );
    expect(container.querySelector('.ds-empty-actions')).toBeNull();
    expect(container.querySelector('.ds-empty-inline')).toBeNull();
  });
  it('groups two actions, allows no body and has an inline size', () => {
    const { container } = render(
      <EmptyState
        icon={<i />}
        title="Henüz konuşma yok"
        size="inline"
        action={<button>Arkadaş ekle</button>}
        secondaryAction={<button>Davet gönder</button>}
      />,
    );
    const actions = container.querySelector('.ds-empty-actions') as HTMLElement;
    expect(within(actions).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Arkadaş ekle',
      'Davet gönder',
    ]);
    expect(container.querySelector('.empty-description')).toBeNull();
    expect(container.querySelector('.empty-state')?.classList.contains('ds-empty-inline')).toBe(
      true,
    );
  });
});

describe('LoadingView', () => {
  it('is a busy status with a visible label', () => {
    render(<LoadingView label="Ayarlar yükleniyor…" />);
    const view = screen.getByRole('status');
    expect(view.getAttribute('aria-busy')).toBe('true');
    expect(view.getAttribute('aria-label')).toBeNull();
    expect(within(view).getByText('Ayarlar yükleniyor…')).toBeTruthy();
    expect(view.querySelector('.loading-ring')?.getAttribute('aria-hidden')).toBe('true');
  });
  it('names itself in Turkish when there is no label', () => {
    render(<LoadingView size="inline" />);
    const view = screen.getByRole('status', { name: 'Yükleniyor…' });
    expect(view.getAttribute('aria-busy')).toBe('true');
    expect(view.classList.contains('ds-loading-inline')).toBe(true);
  });
});

describe('Modal footer', () => {
  it('renders actions in a footer inside the dialog, after the content', () => {
    render(
      <Modal
        title="Mesajı sil"
        onClose={() => {}}
        footer={
          <>
            <button>Vazgeç</button>
            <button>Sil</button>
          </>
        }
      >
        <p>Bu işlem geri alınamaz.</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Mesajı sil' });
    const footer = dialog.querySelector('footer.modal-footer') as HTMLElement;
    expect(footer).toBeTruthy();
    expect(within(footer).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Vazgeç',
      'Sil',
    ]);
    expect(dialog.lastElementChild).toBe(footer);
  });
  it('renders no footer element without the prop', () => {
    render(
      <Modal title="Form" onClose={() => {}}>
        <p>İçerik</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').querySelector('footer')).toBeNull();
  });
});

describe('English default text', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__roomsLocale = 'en';
  });
  afterEach(() => {
    globalThis.__roomsLocale = 'tr';
  });
  it('names a label-less LoadingView in English', async () => {
    await import('../apps/desktop/src/i18n'); // configures the English catalog
    const { LoadingView: EnglishLoadingView } =
      await import('../packages/design-system/src/index');
    render(<EnglishLoadingView />);
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeTruthy();
  });
});
