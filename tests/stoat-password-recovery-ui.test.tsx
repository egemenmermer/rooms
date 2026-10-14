// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopBridge, SocialPasswordRecoveryCapabilities } from '@rooms/contracts';
import { PasswordRecoveryPane } from '../apps/desktop/src/ReferenceOnboarding';

const configured: SocialPasswordRecoveryCapabilities = {
  emailEnabled: true,
  captcha: { required: false, siteKey: null },
};
function bridge(capabilities = configured) {
  const social = {
    passwordRecoveryCapabilities: vi.fn().mockResolvedValue(capabilities),
    requestPasswordRecovery: vi.fn().mockResolvedValue({ accepted: true }),
  };
  window.rooms = { social } as unknown as DesktopBridge;
  return social;
}
afterEach(() => {
  cleanup();
  delete window.rooms;
});
describe('S04 request-only recovery (mocked native bridge)', () => {
  it('uses the selected server and returns generic acceptance without storing an email or secret', async () => {
    const social = bridge();
    const before = localStorage.length;
    render(<PasswordRecoveryPane serverUrl="https://selected.example" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Sunucu ayarları alınıyor…')).toBeNull());
    fireEvent.change(screen.getByLabelText('E-posta adresi'), {
      target: { value: 'friend@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kurtarma isteği gönder' }));
    await screen.findByText(/İstek kabul edildi/);
    expect(social.passwordRecoveryCapabilities).toHaveBeenCalledWith('https://selected.example');
    expect(social.requestPasswordRecovery).toHaveBeenCalledWith({
      serverUrl: 'https://selected.example',
      email: 'friend@example.com',
    });
    expect(screen.queryByLabelText('E-posta adresi')).toBeNull();
    expect(document.body.textContent).not.toContain('friend@example.com');
    expect(localStorage.length).toBe(before);
    expect(document.querySelector('input[type=password]')).toBeNull();
    expect(document.body.textContent).not.toContain('gönderildi');
  });
  it.each([
    { ...configured, emailEnabled: false },
    { ...configured, captcha: { required: true, siteKey: 'public-key' } },
  ])('blocks missing server prerequisites with precise reasons', async (capabilities) => {
    const social = bridge(capabilities);
    render(<PasswordRecoveryPane serverUrl="https://selected.example" onBack={vi.fn()} />);
    await screen.findByText(
      capabilities.emailEnabled
        ? 'Sunucu hCaptcha doğrulaması istiyor. Kurtarmayı Stoat web uygulamasından başlat.'
        : 'Sunucuda kurtarma e-postası yapılandırılmamış.',
    );
    fireEvent.change(screen.getByLabelText('E-posta adresi'), {
      target: { value: 'friend@example.com' },
    });
    expect(
      (screen.getByRole('button', { name: 'Kurtarma isteği gönder' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(social.requestPasswordRecovery).not.toHaveBeenCalled();
  });
  it('fails closed when public settings cannot be read and permits retry', async () => {
    const social = bridge();
    social.passwordRecoveryCapabilities.mockRejectedValueOnce(new Error('private server detail'));
    render(<PasswordRecoveryPane serverUrl="https://selected.example" onBack={vi.fn()} />);
    await screen.findByRole('alert');
    expect(document.body.textContent).not.toContain('private server detail');
    expect(
      (screen.getByRole('button', { name: 'Kurtarma isteği gönder' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden bağlan' }));
    await waitFor(() => expect(social.passwordRecoveryCapabilities).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
  it('discards a stale acceptance after changing server and clears the email draft', async () => {
    const social = bridge();
    let resolve: (value: { accepted: true }) => void = () => {};
    social.requestPasswordRecovery.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const r = render(<PasswordRecoveryPane serverUrl="https://first.example" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Sunucu ayarları alınıyor…')).toBeNull());
    fireEvent.change(screen.getByLabelText('E-posta adresi'), {
      target: { value: 'friend@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kurtarma isteği gönder' }));
    r.rerender(<PasswordRecoveryPane serverUrl="https://second.example" onBack={vi.fn()} />);
    await act(async () => resolve({ accepted: true }));
    expect(screen.queryByText(/İstek kabul edildi/)).toBeNull();
    expect((screen.getByLabelText('E-posta adresi') as HTMLInputElement).value).toBe('');
  });
  it('keeps return navigation functional', async () => {
    bridge();
    const onBack = vi.fn();
    render(<PasswordRecoveryPane serverUrl="https://selected.example" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Giriş ekranına dön' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
