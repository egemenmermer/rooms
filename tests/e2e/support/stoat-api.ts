import { stack } from './env';

/**
 * Minimal upstream Stoat REST client for arranging and asserting state outside the app.
 * It deliberately does not reuse @rooms/stoat so a client adapter bug cannot hide itself.
 */
export class StoatApi {
  constructor(
    readonly token?: string,
    readonly base = stack.rawApi,
  ) {}

  async request<T = Record<string, unknown>>(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(this.token ? { 'x-session-token': this.token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      // Upstream rate limits auth and messaging buckets; arrangement waits rather than flakes.
      if (response.status === 429 && attempt < 6) {
        const retry = Number(response.headers.get('x-ratelimit-reset-after') ?? '1000');
        await new Promise((done) => setTimeout(done, Math.min(Math.max(retry, 250), 10000)));
        continue;
      }
      const text = await response.text();
      if (!response.ok) throw new StoatApiError(method, path, response.status, text.slice(0, 300));
      return (text ? JSON.parse(text) : {}) as T;
    }
  }

  withToken(token: string) {
    return new StoatApi(token, this.base);
  }
}

export class StoatApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${method} ${path} -> ${status} ${body}`);
  }
}

export interface SeededAccount {
  email: string;
  password: string;
  username: string;
  /** Upstream discriminator; friend requests use `username#discriminator`. */
  discriminator: string;
  userId: string;
  token: string;
}

/** Account creation, sign-in and onboarding through the raw upstream API. */
export async function createAccount(
  api: StoatApi,
  input: { email: string; password: string; username: string; invite: string },
): Promise<SeededAccount> {
  await api.request('/auth/account/create', 'POST', {
    email: input.email,
    password: input.password,
    invite: input.invite,
  });
  const session = await api.request<{ result?: string; token: string; user_id: string }>(
    '/auth/session/login',
    'POST',
    { email: input.email, password: input.password, friendly_name: 'rooms-e2e-seed' },
  );
  if (!session.token) throw new Error('Seed login did not return a session.');
  const authed = api.withToken(session.token);
  const hello = await authed.request<{ onboarding: boolean }>('/onboard/hello');
  if (hello.onboarding)
    await authed.request('/onboard/complete', 'POST', { username: input.username });
  const me = await authed.request<{ username: string; discriminator: string }>('/users/@me');
  return {
    email: input.email,
    password: input.password,
    username: me.username,
    discriminator: me.discriminator,
    userId: session.user_id,
    token: session.token,
  };
}

export const userTag = (account: Pick<SeededAccount, 'username' | 'discriminator'>) =>
  `${account.username}#${account.discriminator}`;
