// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SocialSignupRequests, SocialSignupState } from '@rooms/social';
import { ConnectionPane } from '../apps/desktop/src/ConnectionPane';
import { SignupPendingScreen, useSignupGate } from '../apps/desktop/src/SignupPending';
import { CommunitySignupRequestsTab } from '../apps/desktop/src/CommunitySignupRequestsTab';
import { useCommunity } from '../apps/desktop/src/community';
import { useRooms } from '../apps/desktop/src/store';

const user = { id: 'NEWUSER', username: 'friend', displayName: 'Friend', avatar: null };
const state = (status: SocialSignupState['status'], enabled = true): SocialSignupState => ({
  status,
  enabled,
  createdAt: '2026-10-20T10:00:00.000Z',
  space: null,
});
beforeEach(() => {
  useRooms.getState().setPreference('serverUrl', '');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as any).rooms;
  useCommunity.setState({ user: null, spaces: [], busy: false, error: null, serverUrl: '' });
});

describe('Kayıt ol with approval instead of an invitation link', () => {
  const fill = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Onay isteğiyle' }));
    fireEvent.change(screen.getByLabelText('Sunucu adresi'), {
      target: { value: 'https://friends.example/ ' },
    });
    fireEvent.change(screen.getByLabelText('Kullanıcı adı'), { target: { value: 'friend' } });
    fireEvent.change(screen.getByLabelText('E-posta adresi'), {
      target: { value: 'friend@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'unique-test-password' } });
  };

  it('asks the server, then creates the account and signs in to wait for approval', async () => {
    const signupAvailable = vi.fn(async () => true);
    (window as any).rooms = { social: { signupAvailable } };
    const done = vi.fn();
    const requestSignup = vi.fn(async () => {
      useCommunity.setState({ user, busy: false });
    });
    useCommunity.setState({ user: null, busy: false, error: null, requestSignup });
    render(
      <MemoryRouter>
        <ConnectionPane referenceMode="register" onAuthenticated={done} />
      </MemoryRouter>,
    );
    // The invitation-link path stays the default.
    expect(screen.getByLabelText('Davet bağlantısı')).toBeTruthy();
    fill();
    expect(screen.queryByLabelText('Davet bağlantısı')).toBeNull();
    await waitFor(() => expect(signupAvailable).toHaveBeenCalledWith('https://friends.example'));
    await screen.findByText(/bir yönetici isteğini onaylayınca katılırsın/);
    fireEvent.click(screen.getByRole('button', { name: /Hesap oluştur ve onay iste/ }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(requestSignup).toHaveBeenCalledWith({
      serverUrl: 'https://friends.example',
      email: 'friend@example.test',
      password: 'unique-test-password',
      username: 'friend',
    });
    expect(useRooms.getState().preferences.serverUrl).toBe('https://friends.example');
  });

  it('explains a server without approved sign-up and keeps the button off', async () => {
    (window as any).rooms = { social: { signupAvailable: vi.fn(async () => false) } };
    const requestSignup = vi.fn();
    useCommunity.setState({ user: null, busy: false, error: null, requestSignup });
    render(
      <MemoryRouter>
        <ConnectionPane referenceMode="register" />
      </MemoryRouter>,
    );
    fill();
    await screen.findByText(/Bu sunucu davetsiz kaydı açmamış/);
    const submit = screen.getByRole('button', { name: /Hesap oluştur ve onay iste/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(requestSignup).not.toHaveBeenCalled();
  });
});

function Gate() {
  const gate = useSignupGate();
  return gate.blocking ? <SignupPendingScreen gate={gate} /> : <p>Uygulama</p>;
}
const bridge = (status: () => SocialSignupState, spaces: unknown[] = []) => {
  const social = {
    signupStatus: vi.fn(async () => status()),
    reapplySignup: vi.fn(async () => {}),
    spaces: vi.fn(async () => spaces),
    dms: vi.fn(async () => []),
    readStates: vi.fn(async () => []),
    channels: vi.fn(async () => []),
  };
  (window as any).rooms = { social };
  return social;
};

describe('waiting for approval', () => {
  it('shows the waiting screen with sign out, and opens the app once joined', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = state('pending');
    const social = bridge(() => current);
    useCommunity.setState({ user, serverUrl: 'https://friends.example', spaces: [] });
    render(<Gate />);
    await screen.findByRole('heading', { name: 'Onay bekliyor' });
    expect(screen.getByRole('button', { name: /Çıkış yap/ })).toBeTruthy();
    current = { ...state('joined'), space: { id: 'SPACE', name: 'Tayfa' } };
    social.spaces.mockResolvedValue([{ id: 'SPACE', name: 'Tayfa', icon: null }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    await screen.findByText('Uygulama');
  });

  it('tells a rejected person plainly', async () => {
    bridge(() => state('rejected'));
    useCommunity.setState({ user, serverUrl: 'https://friends.example', spaces: [] });
    render(<Gate />);
    await screen.findByRole('heading', { name: 'Kayıt isteğin reddedildi' });
    expect(screen.queryByRole('button', { name: /Durumu yenile/ })).toBeNull();
  });

  it('lets an expired request be sent again', async () => {
    let current = state('expired');
    const social = bridge(() => current);
    social.reapplySignup.mockImplementation(async () => {
      current = state('pending');
    });
    useCommunity.setState({ user, serverUrl: 'https://friends.example', spaces: [] });
    render(<Gate />);
    fireEvent.click(await screen.findByRole('button', { name: /Yeniden istek gönder/ }));
    await screen.findByRole('heading', { name: 'Onay bekliyor' });
    expect(social.reapplySignup).toHaveBeenCalledTimes(1);
  });

  it('never covers the app for an account that belongs to a community', async () => {
    const social = bridge(() => state('pending'), [{ id: 'SPACE', name: 'Tayfa', icon: null }]);
    useCommunity.setState({ user, serverUrl: 'https://friends.example', spaces: [] });
    render(<Gate />);
    await waitFor(() => expect(social.spaces).toHaveBeenCalled());
    expect(screen.getByText('Uygulama')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Onay bekliyor' })).toBeNull();
  });
});

describe('Kayıt istekleri in community management', () => {
  const capability = {
    source: 'rooms-broker',
    state: 'supported',
    managementSupported: true,
  } as const;
  it('approves at once and rejects only after confirmation', async () => {
    let value: SocialSignupRequests = {
      enabled: true,
      requests: [
        { userId: 'U1', username: 'ayse', createdAt: '2026-10-20T10:00:00.000Z', state: 'pending' },
        {
          userId: 'U2',
          username: 'mehmet',
          createdAt: '2026-10-20T11:00:00.000Z',
          state: 'pending',
        },
      ],
    };
    const tabBridge = {
      signupRequests: vi.fn(async () => value),
      decideSignupRequest: vi.fn(async (_space: string, userId: string) => {
        value = { ...value, requests: value.requests.filter((item) => item.userId !== userId) };
      }),
    };
    render(
      <CommunitySignupRequestsTab spaceId="SPACE" capability={capability} bridge={tabBridge} />,
    );
    await screen.findByText('ayse');
    fireEvent.click(screen.getAllByRole('button', { name: /Onayla/ })[0]!);
    await waitFor(() =>
      expect(tabBridge.decideSignupRequest).toHaveBeenCalledWith('SPACE', 'U1', 'approve'),
    );
    await waitFor(() => expect(screen.queryByText('ayse')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Reddet/ }));
    expect(tabBridge.decideSignupRequest).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: 'İsteği reddet' }));
    await waitFor(() =>
      expect(tabBridge.decideSignupRequest).toHaveBeenCalledWith('SPACE', 'U2', 'reject'),
    );
    await screen.findByText('Bekleyen kayıt isteği yok.');
  });

  it('explains when the server does not run approved sign-up for this community', async () => {
    const tabBridge = {
      signupRequests: vi.fn(async () => ({ enabled: false, requests: [] })),
      decideSignupRequest: vi.fn(),
    };
    render(
      <CommunitySignupRequestsTab spaceId="SPACE" capability={capability} bridge={tabBridge} />,
    );
    await screen.findByText('Bu topluluk için davetsiz kayıt kapalı');
  });

  it('stays closed to members who cannot manage the community', () => {
    render(
      <CommunitySignupRequestsTab
        spaceId="SPACE"
        capability={
          {
            source: 'rooms-broker',
            state: 'unsupported',
            managementSupported: false,
            reason: 'x',
          } as never
        }
        bridge={{ signupRequests: vi.fn(), decideSignupRequest: vi.fn() }}
      />,
    );
    expect(screen.getByText('Kayıt isteklerini burada yönetemezsin')).toBeTruthy();
  });
});
