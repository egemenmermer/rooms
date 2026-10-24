// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SocialPendingSignup, SocialSignupRequests } from '@rooms/social';
import { SignupPendingScreen } from '../apps/desktop/src/SignupPending';
import { CommunitySignupRequestsTab } from '../apps/desktop/src/CommunitySignupRequestsTab';
import { useSignup } from '../apps/desktop/src/signup-state';

const pending = (extra: Partial<SocialPendingSignup> = {}): SocialPendingSignup => ({
  serverUrl: 'https://friends.example',
  email: 'friend@example.test',
  username: 'friend',
  createdAt: '2026-10-20T10:00:00.000Z',
  status: 'pending',
  ready: false,
  passwordKnown: true,
  persisted: true,
  error: null,
  ...extra,
});
const bridge = (value: SocialPendingSignup) => {
  const social = {
    pendingSignup: vi.fn(async () => value),
    checkSignup: vi.fn(async () => ({ pending: value, session: null })),
    cancelSignup: vi.fn(async () => {}),
  };
  (window as any).rooms = { social };
  return social;
};
beforeEach(() => {
  useSignup.setState({ pending: null, hidden: false, checking: false, error: '' });
});
afterEach(() => {
  cleanup();
  delete (window as any).rooms;
});

describe('A4-06: the waiting screen for a request the service forgot', () => {
  it('shows a closed state with "Yeni istek gönder" and stops polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const value = pending({ status: 'closed' });
      const social = bridge(value);
      useSignup.setState({ pending: value });
      render(<SignupPendingScreen />);
      await screen.findByRole('heading', { name: 'İsteğin kapandı' });
      expect(screen.queryByRole('heading', { name: 'Onay bekliyor' })).toBeNull();
      const calls = social.checkSignup.mock.calls.length;
      await vi.advanceTimersByTimeAsync(120000);
      expect(social.checkSignup).toHaveBeenCalledTimes(calls);
      fireEvent.click(screen.getByRole('button', { name: /Yeni istek gönder/ }));
      await waitFor(() => expect(social.cancelSignup).toHaveBeenCalled());
      expect(useSignup.getState().pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A4-01: warns when the request is not stored on this device', () => {
  it('warns while waiting and again once approved, and stays quiet when stored', async () => {
    const waiting = pending({ persisted: false });
    bridge(waiting);
    useSignup.setState({ pending: waiting });
    const view = render(<SignupPendingScreen />);
    await screen.findByText(/Bu cihaz isteğini saklayamıyor/);
    view.unmount();
    const approved = pending({ status: 'approved', ready: true, persisted: false });
    bridge(approved);
    useSignup.setState({ pending: approved });
    render(<SignupPendingScreen />);
    await screen.findByText(/Bu cihaz onay bağlantını saklayamıyor/);
    cleanup();
    const stored = pending();
    bridge(stored);
    useSignup.setState({ pending: stored });
    render(<SignupPendingScreen />);
    await screen.findByRole('heading', { name: 'Onay bekliyor' });
    expect(screen.queryByText(/saklayamıyor/)).toBeNull();
  });
});

describe('A4-03: Hepsini reddet', () => {
  const capability = {
    source: 'rooms-broker',
    state: 'supported',
    managementSupported: true,
  } as const;
  const request = (letter: string, state: 'pending' | 'approved' = 'pending') => ({
    id: letter.repeat(32),
    username: `user-${letter}`,
    createdAt: '2026-10-20T10:00:00.000Z',
    state,
  });
  const setup = (initial: SocialSignupRequests, failFor: string[] = []) => {
    let value = initial;
    const tab = {
      signupRequests: vi.fn(async () => value),
      decideSignupRequest: vi.fn(async (_space: string, id: string) => {
        if (failFor.includes(id)) throw new Error('SIGNUP_UNAVAILABLE');
        value = { ...value, requests: value.requests.filter((item) => item.id !== id) };
      }),
    };
    render(<CommunitySignupRequestsTab spaceId="SPACE" capability={capability} bridge={tab} />);
    return tab;
  };

  it('rejects every waiting request after confirmation and leaves approved ones alone', async () => {
    const tab = setup({
      enabled: true,
      requests: [request('a'), request('b'), request('c'), request('d', 'approved')],
    });
    await screen.findByText('user-a');
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini reddet' }));
    // Nothing happens until the dialog is confirmed.
    expect(tab.decideSignupRequest).not.toHaveBeenCalled();
    await screen.findByText('3 bekleyen istek reddedilsin mi?');
    fireEvent.click(screen.getAllByRole('button', { name: 'Hepsini reddet' }).at(-1)!);
    await waitFor(() => expect(tab.decideSignupRequest).toHaveBeenCalledTimes(3));
    expect(tab.decideSignupRequest.mock.calls.map((call) => call.slice(1))).toEqual([
      ['a'.repeat(32), 'reject'],
      ['b'.repeat(32), 'reject'],
      ['c'.repeat(32), 'reject'],
    ]);
    await waitFor(() => expect(screen.queryByText('user-a')).toBeNull());
    expect(screen.getByText('user-d')).toBeTruthy();
    // Nothing left to reject in bulk.
    expect(screen.queryByRole('button', { name: 'Hepsini reddet' })).toBeNull();
  });

  it('is offered only for several waiting requests and can be cancelled', async () => {
    const tab = setup({ enabled: true, requests: [request('a'), request('d', 'approved')] });
    await screen.findByText('user-a');
    expect(screen.queryByRole('button', { name: 'Hepsini reddet' })).toBeNull();
    cleanup();
    const second = setup({ enabled: true, requests: [request('a'), request('b')] });
    await screen.findByText('user-a');
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini reddet' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Vazgeç' }));
    expect(second.decideSignupRequest).not.toHaveBeenCalled();
    expect(tab.decideSignupRequest).not.toHaveBeenCalled();
  });

  it('keeps going past a failure and reports how many could not be rejected', async () => {
    const tab = setup({ enabled: true, requests: [request('a'), request('b'), request('c')] }, [
      'b'.repeat(32),
    ]);
    await screen.findByText('user-a');
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini reddet' }));
    await screen.findByText('3 bekleyen istek reddedilsin mi?');
    fireEvent.click(screen.getAllByRole('button', { name: 'Hepsini reddet' }).at(-1)!);
    await waitFor(() => expect(tab.decideSignupRequest).toHaveBeenCalledTimes(3));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('1 istek reddedilemedi');
    expect(screen.getByText('user-b')).toBeTruthy();
    expect(screen.queryByText('user-a')).toBeNull();
    expect(screen.queryByText('user-c')).toBeNull();
  });
});
