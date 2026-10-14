// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '@rooms/contracts';
import { ReferenceOnboarding } from '../apps/desktop/src/ReferenceOnboarding';
import { useRooms } from '../apps/desktop/src/store';
import { useCommunity } from '../apps/desktop/src/community';
import S04RecoveryEntry from '../apps/desktop/src/dev/S04RecoveryEntry';
const previousPreferences = useRooms.getState().preferences,
  previousCommunity = useCommunity.getState();
const handle = 'df5694c9-d74d-4eee-b390-e248fe92e18a';
function runtime() {
  const social = {
    passwordRecoveryCapabilities: vi
      .fn()
      .mockResolvedValue({ emailEnabled: true, captcha: { required: false, siteKey: null } }),
    requestPasswordRecovery: vi.fn().mockResolvedValue({ accepted: true }),
    importPasswordRecoveryLink: vi.fn().mockResolvedValue({
      handle,
      expiresAt: Date.now() + 180000,
      serverOrigin: 'https://selected.example',
    }),
    confirmPasswordRecovery: vi.fn().mockResolvedValue({ state: 'completed' }),
    cancelPasswordRecovery: vi.fn().mockResolvedValue(undefined),
  };
  window.rooms = { social } as unknown as DesktopBridge;
  useRooms.setState({
    preferences: { ...previousPreferences, serverUrl: 'https://selected.example' },
  });
  useCommunity.setState({
    ...previousCommunity,
    user: null,
    serverUrl: '',
    error: null,
    status: 'not-configured',
  });
  return social;
}
afterEach(() => {
  cleanup();
  delete window.rooms;
  useRooms.setState({ preferences: previousPreferences });
  useCommunity.setState(previousCommunity);
});
describe('S04 integrated onboarding and exact DEV entry (local mocked components)', () => {
  it('switches request/reset locally and imports against saved server, ignoring query reset secrets', async () => {
    const social = runtime(),
      onNavigate = vi.fn();
    render(
      <MemoryRouter
        initialEntries={[
          '/setup/recovery?server=https://attacker.example&token=private-query-secret',
        ]}
      >
        <ReferenceOnboarding mode="recovery" onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(social.passwordRecoveryCapabilities).toHaveBeenCalledWith('https://selected.example'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kurtarma bağlantım var' }));
    fireEvent.click(screen.getByRole('button', { name: 'Panodan kurtarma bağlantısını aktar' }));
    await screen.findByLabelText('Yeni şifre');
    expect(social.importPasswordRecoveryLink).toHaveBeenCalledWith({
      serverUrl: 'https://selected.example',
    });
    expect(document.body.textContent).not.toContain('private-query-secret');
    expect(document.body.textContent).not.toContain('attacker');
    fireEvent.click(screen.getByRole('button', { name: 'Giriş ekranına dön' }));
    expect(onNavigate).toHaveBeenCalledWith('signin');
  });
  it('direct recovery with no selected server never contacts an implicit production host', async () => {
    const social = runtime();
    useRooms.getState().setPreference('serverUrl', '');
    render(
      <MemoryRouter>
        <ReferenceOnboarding mode="recovery" onNavigate={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText('Giriş ekranından sunucu adresini seç.');
    expect(social.passwordRecoveryCapabilities).not.toHaveBeenCalled();
    expect(social.requestPasswordRecovery).not.toHaveBeenCalled();
  });
  it('forgot-password hands off the displayed custom server without sending credentials', () => {
    const social = runtime(),
      onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <ReferenceOnboarding mode="signin" onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Sunucu adresi'), {
      target: { value: 'https://chosen.example/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Şifreni mi unuttun?' }));
    expect(useRooms.getState().preferences.serverUrl).toBe('https://chosen.example');
    expect(onNavigate).toHaveBeenCalledWith('recovery');
    expect(social.requestPasswordRecovery).not.toHaveBeenCalled();
  });
  it('uses actual AUTH_EXPIRED reason for S04 session-expired sign-in and preserves real submit', async () => {
    runtime();
    const onNavigate = vi.fn(),
      connect = vi.fn().mockImplementation(async () => {
        useCommunity.setState({
          user: { id: 'signed-in-user', username: 'Owner', displayName: 'Owner', avatar: null },
          status: 'connected',
          error: null,
        });
      });
    useCommunity.setState({
      status: 'error',
      user: null,
      error: 'Oturumunun süresi doldu. Çıkış yapıp yeniden giriş yap.',
      connect,
    });
    render(
      <MemoryRouter>
        <ReferenceOnboarding mode="signin" onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Yeniden giriş yap' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('E-posta adresi'), {
      target: { value: 'owner@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Şifre'), {
      target: { value: 'fixture-current-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap ve devam et' }));
    await waitFor(() =>
      expect(connect).toHaveBeenCalledWith({
        serverUrl: 'https://selected.example',
        email: 'owner@example.test',
        password: 'fixture-current-password',
      }),
    );
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('profile'));
  });
  it('does not reinterpret ordinary failures or expired query flags as an expired session', () => {
    runtime();
    useCommunity.setState({ status: 'error', error: 'Network unavailable' });
    render(
      <MemoryRouter initialEntries={['/setup/signin?expired=1']}>
        <ReferenceOnboarding mode="signin" onNavigate={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('heading', { name: 'Yeniden giriş yap' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Giriş yap' })).toBeTruthy();
  });
  it('exact reset DEV entry uses actual inputs but never calls native clipboard or confirmation', async () => {
    const social = runtime();
    render(
      <MemoryRouter>
        <S04RecoveryEntry variant="reset" />
      </MemoryRouter>,
    );
    expect(screen.getByText('DEMO · Yerel örnek')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Panodan kurtarma bağlantısını aktar' }));
    await screen.findByLabelText('Yeni şifre');
    fireEvent.change(screen.getByLabelText('Yeni şifre'), {
      target: { value: 'fixture-new-password' },
    });
    fireEvent.change(screen.getByLabelText('Yeni şifreyi tekrar yaz'), {
      target: { value: 'fixture-new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi kaydet' }));
    await screen.findByText(/Şifre değişikliği doğrulanamadı/);
    expect(social.importPasswordRecoveryLink).not.toHaveBeenCalled();
    expect(social.confirmPasswordRecovery).not.toHaveBeenCalled();
    expect(social.requestPasswordRecovery).not.toHaveBeenCalled();
  });
  it('exact sent DEV entry performs isolated actual form transition; expired entry renders sign-in', async () => {
    const social = runtime(),
      r = render(
        <MemoryRouter>
          <S04RecoveryEntry variant="sent" />
        </MemoryRouter>,
      );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Kurtarma isteği gönder' }) as HTMLButtonElement).title,
      ).toBe(''),
    );
    fireEvent.change(screen.getByLabelText('E-posta adresi'), {
      target: { value: 'demo@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kurtarma isteği gönder' }));
    await screen.findByText(/İstek kabul edildi/);
    expect(social.requestPasswordRecovery).not.toHaveBeenCalled();
    r.unmount();
    render(
      <MemoryRouter>
        <S04RecoveryEntry variant="expired" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Yeniden giriş yap' })).toBeTruthy();
    expect(screen.getByLabelText('E-posta adresi')).toBeTruthy();
  });
});
