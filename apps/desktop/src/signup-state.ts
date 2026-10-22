import { create } from 'zustand';
import type { SocialPendingSignup } from '@rooms/social';
import { startSession } from './community';
import { uiError } from './i18n';

/** How often the waiting screen asks whether an admin decided. */
export const SIGNUP_POLL_MS = 30000;

export interface SignupState {
  /** The sign-up this device started; null when there is none. */
  pending: SocialPendingSignup | null;
  /** Hidden for now; the request keeps going and can be shown again. */
  hidden: boolean;
  checking: boolean;
  error: string;
  load(): Promise<void>;
  request(input: {
    serverUrl: string;
    email: string;
    password: string;
    username: string;
  }): Promise<void>;
  /** Asks the server; creates the account when approved and the password is still known. */
  check(): Promise<void>;
  complete(input: { email?: string; password: string }): Promise<void>;
  cancel(): Promise<void>;
  hide(): void;
  show(): void;
}
const social = () => {
  if (!window.rooms?.social?.pendingSignup)
    throw new Error('Kayıt isteği için masaüstü uygulamasını aç.');
  return window.rooms.social;
};

/**
 * Approved sign-up as this device follows it. It never involves a signed-in account: it exists
 * only before the account does, and every screen built on it can be dismissed.
 */
export const useSignup = create<SignupState>((set, get) => ({
  pending: null,
  hidden: false,
  checking: false,
  error: '',
  load: async () => {
    if (!window.rooms?.social?.pendingSignup) return;
    try {
      set({ pending: await social().pendingSignup() });
    } catch {
      set({ pending: null });
    }
  },
  request: async (input) => {
    const pending = await social().requestSignup(input);
    set({ pending, hidden: false, error: '' });
  },
  check: async () => {
    if (get().checking || !get().pending) return;
    set({ checking: true, error: '' });
    try {
      const result = await social().checkSignup();
      if (result.session) {
        const session = result.session;
        await startSession(async () => session);
      }
      set({ pending: result.pending });
    } catch (failure) {
      set({ error: uiError(failure) });
    } finally {
      set({ checking: false });
    }
  },
  complete: async (input) => {
    set({ error: '' });
    try {
      await startSession(() => social().completeSignup(input));
      set({ pending: null });
    } catch (failure) {
      set({
        error: uiError(failure),
        pending: await social()
          .pendingSignup()
          .catch(() => null),
      });
      throw failure;
    }
  },
  cancel: async () => {
    await social()
      .cancelSignup()
      .catch(() => {});
    set({ pending: null, error: '' });
  },
  hide: () => set({ hidden: true }),
  show: () => set({ hidden: false }),
}));

/** The waiting screen shows only while signed out, for this device's own request, unless hidden. */
export const signupScreenVisible = (state: SignupState, signedIn: boolean) =>
  !signedIn && !!state.pending && !state.hidden;
