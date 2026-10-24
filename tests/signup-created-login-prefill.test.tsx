// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SocialPendingSignup } from '@rooms/social';
import { ConnectionPane } from '../apps/desktop/src/ConnectionPane';
import { useSignup } from '../apps/desktop/src/signup-state';
import { useCommunity } from '../apps/desktop/src/community';

// The main process translates this text; the form must not depend on its wording.
const CREATED = 'Your account was created but could not sign in. Sign in with friend@example.test.';
const approved: SocialPendingSignup = {
  serverUrl: 'https://friends.example',
  email: 'friend@example.test',
  username: 'friend',
  createdAt: '2026-10-20T10:00:00.000Z',
  status: 'approved',
  ready: true,
  passwordKnown: true,
  error: null,
};
const bridge = (social: Record<string, unknown>) => {
  (window as any).rooms = {
    social: { signupAvailable: vi.fn(async () => true), ...social },
  };
};
const pane = (mode: 'signin' | 'register') =>
  render(
    <MemoryRouter>
      <ConnectionPane referenceMode={mode} onAuthenticated={() => {}} />
    </MemoryRouter>,
  );
const emailField = () => screen.getByLabelText('E-posta adresi') as HTMLInputElement;
beforeEach(() => {
  useSignup.setState({ pending: approved, hidden: false, checking: false, error: '' });
  useCommunity.setState({ user: null, busy: false, error: null });
});
afterEach(() => {
  cleanup();
  delete (window as any).rooms;
  useSignup.setState({ pending: null, hidden: false, checking: false, error: '' });
});

it('creating the account without a session leaves sign-in with the address filled in', async () => {
  bridge({
    completeSignup: vi.fn(async () => {
      throw new Error(CREATED);
    }),
    // The request is gone once the account exists.
    pendingSignup: vi.fn(async () => null),
  });
  await expect(
    useSignup.getState().complete({ password: 'unique-test-password' }),
  ).rejects.toThrow();
  expect(useSignup.getState().pending).toBeNull();
  pane('signin');
  expect(emailField().value).toBe('friend@example.test');
  // The waiting screen closed with the request; the session error still says what happened.
  expect(screen.getByRole('alert').textContent).toContain(CREATED);
});

it('a failed check followed by "Giriş ekranına dön" also fills the address in', async () => {
  bridge({
    checkSignup: vi.fn(async () => {
      throw new Error(CREATED);
    }),
  });
  await useSignup.getState().check();
  useSignup.getState().hide();
  pane('signin');
  expect(emailField().value).toBe('friend@example.test');
});

it('leaves the address empty without a failed sign-up and on Kayıt ol', () => {
  bridge({});
  pane('signin');
  expect(emailField().value).toBe('');
  cleanup();
  useSignup.setState({ pending: null, error: CREATED });
  pane('register');
  expect(emailField().value).toBe('');
});
