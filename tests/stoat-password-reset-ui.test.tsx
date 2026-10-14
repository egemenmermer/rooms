// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetPane, type PasswordResetBridge } from '../apps/desktop/src/PasswordResetPane';
const handle = 'df5694c9-d74d-4eee-b390-e248fe92e18a';
function setup() {
  const bridge: PasswordResetBridge = {
    importPasswordRecoveryLink: vi.fn().mockResolvedValue({
      handle,
      expiresAt: Date.now() + 180000,
      serverOrigin: 'https://social.example',
    }),
    confirmPasswordRecovery: vi.fn().mockResolvedValue({ state: 'completed' }),
    cancelPasswordRecovery: vi.fn().mockResolvedValue(undefined),
  };
  const props = {
    serverUrl: 'https://social.example/api',
    scopeKey: 'signed-out:1',
    bridge,
    onBack: vi.fn(),
    onNewRequest: vi.fn(),
  };
  return { bridge, props };
}
async function importLink() {
  fireEvent.click(screen.getByRole('button', { name: 'Panodan kurtarma bağlantısını aktar' }));
  await screen.findByLabelText('Yeni şifre');
}
function draft(password = 'new-secret-password', repeat = password) {
  fireEvent.change(screen.getByLabelText('Yeni şifre'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Yeni şifreyi tekrar yaz'), { target: { value: repeat } });
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('S04 transient password reset pane (mocked bridge; no account acceptance)', () => {
  it('requires explicit import, matching passwords; sends opaque handle only and clears drafts before receipt', async () => {
    const f = setup(),
      before = localStorage.length;
    render(<PasswordResetPane {...f.props} />);
    expect(f.bridge.importPasswordRecoveryLink).not.toHaveBeenCalled();
    await importLink();
    expect(f.bridge.importPasswordRecoveryLink).toHaveBeenCalledWith({
      serverUrl: f.props.serverUrl,
    });
    draft('new-secret-password', 'different-password');
    expect(
      (screen.getByRole('button', { name: 'Şifreyi kaydet' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    draft();
    let finish: (value: { state: 'completed' }) => void = () => {};
    vi.mocked(f.bridge.confirmPasswordRecovery).mockReturnValue(
      new Promise((done) => {
        finish = done;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi kaydet' }));
    expect((screen.getByLabelText('Yeni şifre') as HTMLInputElement).value).toBe('');
    expect(f.bridge.confirmPasswordRecovery).toHaveBeenCalledWith({
      serverUrl: f.props.serverUrl,
      handle,
      password: 'new-secret-password',
    });
    await act(async () => finish({ state: 'completed' }));
    await screen.findByText('Şifre kaydedildi. Yeni şifrenle giriş yap.');
    expect(document.querySelector('input')).toBeNull();
    expect(localStorage.length).toBe(before);
    expect(f.props.onBack).not.toHaveBeenCalled();
  });
  it('cancels imported capability on unmount and discards late receipt', async () => {
    const f = setup();
    let finish: (value: {
      handle: string;
      expiresAt: number;
      serverOrigin: string;
    }) => void = () => {};
    vi.mocked(f.bridge.importPasswordRecoveryLink).mockReturnValue(
      new Promise((done) => {
        finish = done;
      }),
    );
    const r = render(<PasswordResetPane {...f.props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Panodan kurtarma bağlantısını aktar' }));
    r.unmount();
    await act(async () =>
      finish({ handle, expiresAt: Date.now() + 180000, serverOrigin: 'https://social.example' }),
    );
    expect(f.bridge.cancelPasswordRecovery).toHaveBeenCalledWith({ handle });
    expect(document.querySelector('input')).toBeNull();
  });
  it('clears password drafts and cancels selection on account/server changes', async () => {
    const f = setup(),
      r = render(<PasswordResetPane {...f.props} />);
    await importLink();
    draft();
    r.rerender(
      <PasswordResetPane {...f.props} scopeKey="signed-out:2" serverUrl="https://other.example" />,
    );
    expect(f.bridge.cancelPasswordRecovery).toHaveBeenCalledWith({ handle });
    expect(document.querySelector('input')).toBeNull();
  });
  it('sanitizes import failures and disables the browser-only control precisely', async () => {
    const f = setup();
    vi.mocked(f.bridge.importPasswordRecoveryLink).mockRejectedValue(
      new Error('private-reset-token'),
    );
    const r = render(<PasswordResetPane {...f.props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Panodan kurtarma bağlantısını aktar' }));
    await screen.findByRole('alert');
    expect(document.body.textContent).not.toContain('private-reset-token');
    r.rerender(<PasswordResetPane {...f.props} bridge={null} />);
    expect(
      (
        screen.getByRole('button', {
          name: 'Panodan kurtarma bağlantısını aktar',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Panodan kurtarma bağlantısını aktar' }).title,
    ).toContain('masaüstü');
  });
  it('offers a new request only after a real invalid-token outcome', async () => {
    const f = setup();
    vi.mocked(f.bridge.confirmPasswordRecovery).mockResolvedValue({ state: 'invalid-token' });
    render(<PasswordResetPane {...f.props} />);
    await importLink();
    draft();
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi kaydet' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni kurtarma isteği' }));
    expect(f.props.onNewRequest).toHaveBeenCalledOnce();
  });
  it('does not automatically retry or offer immediate mutation after uncertain failure', async () => {
    const f = setup();
    vi.mocked(f.bridge.confirmPasswordRecovery).mockRejectedValue(
      new Error('new-secret-password private-url'),
    );
    render(<PasswordResetPane {...f.props} />);
    await importLink();
    draft();
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi kaydet' }));
    await screen.findByText(/Şifre değişikliği doğrulanamadı/);
    expect(document.body.textContent).not.toContain('private-url');
    expect(
      screen.queryByRole('button', { name: 'Panodan kurtarma bağlantısını aktar' }),
    ).toBeNull();
    expect(f.bridge.confirmPasswordRecovery).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Giriş ekranına dön' }));
    expect(f.props.onBack).toHaveBeenCalledOnce();
  });
  it('distinguishes local selection expiry from upstream token validity', async () => {
    const f = setup();
    vi.mocked(f.bridge.importPasswordRecoveryLink).mockResolvedValue({
      handle,
      expiresAt: Date.now() + 1,
      serverOrigin: 'https://social.example',
    });
    render(<PasswordResetPane {...f.props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Panodan kurtarma bağlantısını aktar' }));
    await screen.findByText('Kurtarma işleminin süresi doldu. Bağlantıyı yeniden aktar.');
    expect(f.bridge.cancelPasswordRecovery).toHaveBeenCalledWith({ handle });
    expect(f.bridge.confirmPasswordRecovery).not.toHaveBeenCalled();
    expect(document.querySelector('input')).toBeNull();
  });
});
