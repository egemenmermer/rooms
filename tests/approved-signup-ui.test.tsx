// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SocialPendingSignup, SocialSignupRequests } from '@rooms/social';
import { ConnectionPane } from '../apps/desktop/src/ConnectionPane';
import { SignupPendingScreen } from '../apps/desktop/src/SignupPending';
import { CommunitySignupRequestsTab } from '../apps/desktop/src/CommunitySignupRequestsTab';
import { signupScreenVisible, useSignup } from '../apps/desktop/src/signup-state';
import { useCommunity } from '../apps/desktop/src/community';
import { useRooms } from '../apps/desktop/src/store';

const user = { id: 'NEWUSER', username: 'friend', displayName: 'Friend', avatar: null };
const pending = (extra: Partial<SocialPendingSignup> = {}): SocialPendingSignup => ({
  serverUrl: 'https://friends.example',
  email: 'friend@example.test',
  username: 'friend',
  createdAt: '2026-10-20T10:00:00.000Z',
  status: 'pending',
  ready: false,
  passwordKnown: true,
  error: null,
  ...extra,
});
const session = {
  instanceUrl: 'https://friends.example',
  user,
  status: 'connected',
  remembered: true,
  sessionEpoch: 1,
};
beforeEach(() => {
  useRooms.getState().setPreference('serverUrl', '');
  useSignup.setState({ pending: null, hidden: false, checking: false, error: '' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as any).rooms;
  useCommunity.setState({ user: null, spaces: [], busy: false, error: null, serverUrl: '' });
});
/** Social bridge stub with the calls the sign-up screens and a fresh session use. */
const bridge = (extra: Record<string, unknown> = {}) => {
  const social = {
    signupAvailable: vi.fn(async () => true),
    requestSignup: vi.fn(async () => pending()),
    pendingSignup: vi.fn(async () => useSignup.getState().pending),
    checkSignup: vi.fn(async () => ({ pending: pending(), session: null })),
    completeSignup: vi.fn(async () => session),
    cancelSignup: vi.fn(async () => {}),
    session: vi.fn(async () => session),
    spaces: vi.fn(async () => []),
    dms: vi.fn(async () => []),
    readStates: vi.fn(async () => []),
    channels: vi.fn(async () => []),
    ...extra,
  };
  (window as any).rooms = { social };
  return social;
};

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

  it('sends a request that creates no account and no session', async () => {
    const social = bridge();
    const done = vi.fn();
    useCommunity.setState({ user: null, busy: false, error: null });
    render(
      <MemoryRouter>
        <ConnectionPane referenceMode="register" onAuthenticated={done} />
      </MemoryRouter>,
    );
    // The invitation-link path stays the default.
    expect(screen.getByLabelText('Davet bağlantısı')).toBeTruthy();
    fill();
    await waitFor(() =>
      expect(social.signupAvailable).toHaveBeenCalledWith('https://friends.example'),
    );
    await screen.findByText(/Hesabın, bir yönetici onaylayınca oluşur/);
    fireEvent.click(screen.getByRole('button', { name: /Kayıt isteği gönder/ }));
    await waitFor(() => expect(useSignup.getState().pending).not.toBeNull());
    expect(social.requestSignup).toHaveBeenCalledWith({
      serverUrl: 'https://friends.example',
      email: 'friend@example.test',
      password: 'unique-test-password',
      username: 'friend',
    });
    expect(useCommunity.getState().user).toBeNull();
    expect(done).not.toHaveBeenCalled();
  });

  it('explains a server without approved sign-up and keeps the button off', async () => {
    const social = bridge({ signupAvailable: vi.fn(async () => false) });
    useCommunity.setState({ user: null, busy: false, error: null });
    render(
      <MemoryRouter>
        <ConnectionPane referenceMode="register" />
      </MemoryRouter>,
    );
    fill();
    await screen.findByText(/Bu sunucu davetsiz kaydı açmamış/);
    const submit = screen.getByRole('button', { name: /Kayıt isteği gönder/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(social.requestSignup).not.toHaveBeenCalled();
  });
});

describe('waiting for approval', () => {
  it('never shows for a signed-in account, even one without communities', () => {
    const state = { ...useSignup.getState(), pending: pending() };
    expect(signupScreenVisible(state, true)).toBe(false);
    expect(signupScreenVisible(state, false)).toBe(true);
    expect(signupScreenVisible({ ...state, hidden: true }, false)).toBe(false);
    expect(signupScreenVisible({ ...state, pending: null }, false)).toBe(false);
  });

  it.each([
    pending(),
    pending({ status: 'approved', ready: true, passwordKnown: false }),
    pending({ status: 'expired' }),
    pending({ status: 'issued' }),
  ])('can always be left: %o', async (value) => {
    bridge({ checkSignup: vi.fn(async () => ({ pending: value, session: null })) });
    useSignup.setState({ pending: value });
    render(<SignupPendingScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Giriş ekranına dön/ }));
    expect(useSignup.getState().hidden).toBe(true);
  });

  it('polls and opens the new session once the approved account is created', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const social = bridge();
    useSignup.setState({ pending: pending() });
    render(<SignupPendingScreen />);
    await screen.findByRole('heading', { name: 'Onay bekliyor' });
    social.checkSignup.mockResolvedValue({ pending: null, session } as never);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    await waitFor(() => expect(useCommunity.getState().user?.id).toBe('NEWUSER'));
    expect(useSignup.getState().pending).toBeNull();
  });

  it('asks for the password after a restart and creates the account with it', async () => {
    const value = pending({ status: 'approved', ready: true, passwordKnown: false });
    const social = bridge({ checkSignup: vi.fn(async () => ({ pending: value, session: null })) });
    useSignup.setState({ pending: value });
    render(<SignupPendingScreen />);
    fireEvent.change(await screen.findByLabelText('Şifre'), {
      target: { value: 'unique-test-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hesabı oluştur ve katıl' }));
    await waitFor(() =>
      expect(social.completeSignup).toHaveBeenCalledWith({
        email: 'friend@example.test',
        password: 'unique-test-password',
      }),
    );
    await waitFor(() => expect(useCommunity.getState().user?.id).toBe('NEWUSER'));
  });

  it('tells a rejected person plainly and forgets the request on Tamam', async () => {
    const value = pending({ status: 'rejected' });
    const social = bridge({ checkSignup: vi.fn(async () => ({ pending: value, session: null })) });
    useSignup.setState({ pending: value });
    render(<SignupPendingScreen />);
    await screen.findByRole('heading', { name: 'Kayıt isteğin reddedildi' });
    fireEvent.click(screen.getByRole('button', { name: /Tamam/ }));
    await waitFor(() => expect(social.cancelSignup).toHaveBeenCalled());
    expect(useSignup.getState().pending).toBeNull();
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
        {
          id: 'a'.repeat(32),
          username: 'ayse',
          createdAt: '2026-10-20T10:00:00.000Z',
          state: 'pending',
        },
        {
          id: 'b'.repeat(32),
          username: 'mehmet',
          createdAt: '2026-10-20T11:00:00.000Z',
          state: 'pending',
        },
      ],
    };
    const tabBridge = {
      signupRequests: vi.fn(async () => value),
      decideSignupRequest: vi.fn(async (_space: string, id: string) => {
        value = { ...value, requests: value.requests.filter((item) => item.id !== id) };
      }),
    };
    render(
      <CommunitySignupRequestsTab spaceId="SPACE" capability={capability} bridge={tabBridge} />,
    );
    await screen.findByText('ayse');
    fireEvent.click(screen.getAllByRole('button', { name: /Onayla/ })[0]!);
    await waitFor(() =>
      expect(tabBridge.decideSignupRequest).toHaveBeenCalledWith(
        'SPACE',
        'a'.repeat(32),
        'approve',
      ),
    );
    await waitFor(() => expect(screen.queryByText('ayse')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Reddet/ }));
    expect(tabBridge.decideSignupRequest).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: 'İsteği reddet' }));
    await waitFor(() =>
      expect(tabBridge.decideSignupRequest).toHaveBeenCalledWith('SPACE', 'b'.repeat(32), 'reject'),
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
