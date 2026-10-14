// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '@rooms/design';
import {
  ReferenceRDConnection,
  type ReferenceRDConnectionProps,
} from '../apps/desktop/src/ReferenceRDConnection';

afterEach(cleanup);
const grant = {
  userCode: 'LOCAL-TEST-CODE',
  verificationUrl: 'https://real-debrid.com/device',
  expiresAt: '2030-10-11T12:34:56.000Z',
};
function mount(overrides: Partial<ReferenceRDConnectionProps> = {}) {
  const props: ReferenceRDConnectionProps = {
    state: 'initial',
    grant: null,
    busy: false,
    available: true,
    canCancel: true,
    error: null,
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    onOpenLibrary: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ReferenceRDConnection {...props} />) };
}

describe('S37 stateless connection presentation', () => {
  it('shows the initial introduction and dispatches explicit start and close actions', () => {
    const { props } = mount();
    expect(screen.getByRole('heading', { name: 'Kendi Real-Debrid hesabını bağla' })).toBeTruthy();
    expect(props.onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı başlat' }));
    expect(props.onStart).toHaveBeenCalledOnce();
    expect(screen.queryByText('Onay bekleniyor.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi değil' }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('shows only the actual waiting grant, absolute expiry and current approval step', () => {
    const { props, container } = mount({ state: 'waiting', grant });
    expect(screen.queryByRole('heading', { name: 'Kendi Real-Debrid hesabını bağla' })).toBeNull();
    expect(screen.getByText(grant.userCode)).toBeTruthy();
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(grant.expiresAt);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Tarayıcıda onayla',
    );
    expect(screen.getByText('Tamamlanması bekleniyor')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Yetkilendirme sayfasını aç' });
    expect(link.getAttribute('href')).toBe(grant.verificationUrl);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('tabindex')).toBe('0');
    expect(screen.queryByRole('button', { name: /simüle/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Onay kontrolünü durdur' }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(screen.getByText(grant.userCode)).toBeTruthy();
  });

  it('shows distinct expiry recovery without leaking a stale grant', () => {
    const { props } = mount({ state: 'expired', grant });
    expect(screen.getByRole('alert').textContent).toContain('Yetkilendirme kodunun süresi doldu.');
    expect(screen.queryByText(grant.userCode)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kendi hesabımla yenile' }));
    expect(props.onStart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Şimdilik kapat' }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('presents cancellation honestly and leaves retry and close to the parent', () => {
    const { props } = mount({ state: 'cancelled', grant });
    expect(screen.getByRole('status').textContent).toContain(
      'Kod, sağlayıcıda süresi dolana kadar geçerli kalabilir.',
    );
    expect(screen.queryByText(grant.userCode)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar başlat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kişisel medyama dön' }));
    expect(props.onStart).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Onay kontrolü durduruldu.' })).toBeTruthy();
  });

  it('dispatches connected library and remove actions without claiming local removal', () => {
    const { props } = mount({ state: 'connected', grant });
    expect(screen.getByRole('status').textContent).toContain('Real-Debrid bağlandı');
    expect(screen.queryByText(grant.userCode)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kütüphanemi aç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı kaldır' }));
    expect(props.onOpenLibrary).toHaveBeenCalledOnce();
    expect(props.onRemove).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toContain('Real-Debrid bağlandı');
  });

  it('renders the supplied error as text within the terminal error panel', () => {
    const { props, container } = mount({
      state: 'error',
      error: '<b>Sağlayıcı yanıt vermedi.</b>',
      grant,
    });
    expect(screen.getByRole('alert').textContent).toContain('<b>Sağlayıcı yanıt vermedi.</b>');
    expect(container.querySelector('b')).toBeNull();
    expect(screen.queryByText(grant.userCode)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Kendi Real-Debrid hesabını bağla' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kendi hesabımla yenile' }));
    expect(props.onStart).toHaveBeenCalledOnce();
  });

  it.each(['initial', 'waiting', 'connected', 'expired', 'cancelled', 'error'] as const)(
    'disables all panel actions with a visible reason while %s is busy',
    (state) => {
      const { props } = mount({ state, grant, busy: true });
      for (const button of screen.getAllByRole('button')) {
        expect(button.hasAttribute('disabled')).toBe(true);
        expect(button.getAttribute('title')).toBe('Devam eden işlemin tamamlanması bekleniyor.');
        fireEvent.click(button);
      }
      expect(screen.queryByRole('link')).toBeNull();
      expect(
        screen.getAllByText('Devam eden işlemin tamamlanması bekleniyor.').length,
      ).toBeGreaterThan(0);
      for (const callback of [
        props.onStart,
        props.onCancel,
        props.onClose,
        props.onOpenLibrary,
        props.onRemove,
      ])
        expect(callback).not.toHaveBeenCalled();
    },
  );

  it.each([
    'about:blank',
    'javascript:alert(1)',
    'https://example.test/device',
    'https://real-debrid.com.evil.test/device',
    'https://real-debrid.com/device?token=secret',
    'http://real-debrid.com/device',
  ])('does not create an external link for %s', (verificationUrl) => {
    mount({ state: 'waiting', grant: { ...grant, verificationUrl } });
    expect(screen.queryByRole('link')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Yetkilendirme sayfasını aç' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('Geçerli sağlayıcı yetkilendirme adresi alınamadı.')).toBeTruthy();
  });

  it.each([null, { ...grant, userCode: '' }, { ...grant, expiresAt: 'invalid' }])(
    'fails closed for missing or malformed grants: %j',
    (invalidGrant) => {
      mount({ state: 'waiting', grant: invalidGrant });
      expect(screen.getByRole('alert').textContent).toContain('Bağlantı kodu alınamadı.');
      expect(screen.queryByText(grant.userCode)).toBeNull();
      expect(screen.queryByRole('list', { name: 'Bağlantı adımları' })).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
    },
  );

  it('disables provider actions while allowing dismissal when desktop support is absent', () => {
    const { props } = mount({ available: false });
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı başlat' }));
    expect(props.onStart).not.toHaveBeenCalled();
    expect(
      screen.getByText('Real-Debrid bağlantısı için güncel masaüstü uygulaması gerekli.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi değil' }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('explains missing cancellation support without calling the parent', () => {
    const { props } = mount({ state: 'waiting', grant, canCancel: false });
    fireEvent.click(screen.getByRole('button', { name: 'Onay kontrolünü durdur' }));
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('Bu uygulama sürümü bağlantı denemesini iptal edemiyor.')).toBeTruthy();
  });

  it('includes the provider link in the existing Modal focus cycle and delegates Escape', () => {
    const onClose = vi.fn();
    const props: ReferenceRDConnectionProps = {
      state: 'waiting',
      grant,
      busy: false,
      available: true,
      canCancel: true,
      error: null,
      onStart: vi.fn(),
      onCancel: vi.fn(),
      onClose,
      onOpenLibrary: vi.fn(),
      onRemove: vi.fn(),
    };
    render(
      <Modal title="Kişisel Real-Debrid bağlantısı" onClose={onClose}>
        <ReferenceRDConnection {...props} />
      </Modal>,
    );
    const close = screen.getByRole('button', { name: 'Pencereyi kapat' });
    const cancel = screen.getByRole('button', { name: 'Onay kontrolünü durdur' });
    expect(document.activeElement).toBe(close);
    const link = screen.getByRole('link');
    link.focus();
    expect(document.activeElement).toBe(link);
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
