import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoatClient, StoatError } from '@rooms/stoat';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
/** Routes by path suffix; every call is recorded with its method and Authorization header. */
function stubFetch(routes: Record<string, () => Response>) {
  const calls: { url: string; method: string; auth: string | null; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const headers = new Headers(init.headers);
      calls.push({
        url,
        method: init.method ?? 'GET',
        auth: headers.get('Authorization'),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const route = Object.keys(routes).find((path) => new URL(url).pathname.endsWith(path));
      if (!route) return json({ type: 'NotFound' }, 404);
      return routes[route]!();
    }),
  );
  return calls;
}
const id = 'a'.repeat(32);
const secret = 'S'.repeat(43);

describe('approved sign-up in the Stoat adapter', () => {
  it('reports whether the server accepts requests, treating old brokers as closed', async () => {
    stubFetch({ '/rooms-access/v1/auth/signup': () => json({ enabled: true }) });
    expect(await new StoatClient('https://friends.example').signupAvailable()).toBe(true);
    stubFetch({});
    expect(await new StoatClient('https://friends.example').signupAvailable()).toBe(false);
  });

  it('sends only the email and name, and receives no session', async () => {
    const calls = stubFetch({
      '/rooms-access/v1/auth/signup-requests': () =>
        json({ requestId: id, pollSecret: secret, status: 'pending' }),
    });
    const client = new StoatClient('https://friends.example');
    expect(await client.requestSignup({ email: 'friend@example.com', username: 'friend' })).toEqual(
      { requestId: id, pollSecret: secret },
    );
    expect(client.getToken()).toBeFalsy();
    expect(calls[0]).toMatchObject({
      method: 'POST',
      auth: null,
      body: { email: 'friend@example.com', username: 'friend' },
    });
  });

  it('surfaces broker refusals with their codes', async () => {
    stubFetch({
      '/rooms-access/v1/auth/signup-requests': () => json({ error: 'SIGNUP_QUEUE_FULL' }, 503),
    });
    const failure = await new StoatClient('https://friends.example')
      .requestSignup({ email: 'a@example.com', username: 'ab' })
      .catch((error) => error);
    expect(failure).toBeInstanceOf(StoatError);
    expect(failure.code).toBe('SIGNUP_QUEUE_FULL');
    expect(failure.message).toMatch(/waiting for approval/);
  });

  it('polls with the secret and reads the one-time code on approval', async () => {
    const code = 'f'.repeat(64);
    const calls = stubFetch({
      [`/rooms-access/v1/auth/signup-requests/${id}`]: () =>
        json({ status: 'approved', inviteCode: code, createdAt: '2026-10-20T10:00:00.000Z' }),
    });
    const client = new StoatClient('https://friends.example');
    expect(await client.signupStatus(id, secret)).toEqual({
      status: 'approved',
      inviteCode: code,
      createdAt: '2026-10-20T10:00:00.000Z',
      expiresAt: null,
    });
    expect(calls[0]!.auth).toBe(`Bearer ${secret}`);
    stubFetch({
      [`/rooms-access/v1/auth/signup-requests/${id}`]: () => json({ status: 'approved' }),
    });
    await expect(client.signupStatus(id, secret)).rejects.toMatchObject({
      code: 'INVALID_SIGNUP_RESPONSE',
    });
  });

  it('says plainly that an email already has an account when registration hits it', async () => {
    // Upstream 500 OperationFailed reaches the client as the broker's 409 OperationFailed.
    stubFetch({
      '/rooms-access/v1/auth/register': () => json({ error: 'OperationFailed' }, 409),
    });
    const failure = await new StoatClient('https://friends.example')
      .register({
        email: 'taken@example.com',
        password: 'correct horse battery',
        username: 'friend',
        inviteCode: 'f'.repeat(64),
      })
      .catch((error) => error);
    expect(failure.status).toBe(409);
    expect(failure.message).toBe(
      'This email address already has an account. Sign in with it, or use a different email address.',
    );
  });

  it('lists and decides requests for admins and rejects malformed lists', async () => {
    const calls = stubFetch({
      '/rooms-access/v1/spaces/SPACE/signup-requests': () =>
        json({
          enabled: true,
          requests: [{ id, username: 'friend', createdAt: '2026-10-20T10:00:00.000Z', state: 'x' }],
        }),
      [`/rooms-access/v1/spaces/SPACE/signup-requests/${id}/approve`]: () =>
        json({ state: 'approved' }),
    });
    const client = new StoatClient('https://friends.example', 'admin-token');
    expect(await client.listSignupRequests('SPACE')).toEqual({
      enabled: true,
      requests: [
        { id, username: 'friend', createdAt: '2026-10-20T10:00:00.000Z', state: 'pending' },
      ],
    });
    await client.decideSignupRequest('SPACE', id, 'approve');
    expect(calls[1]).toMatchObject({ method: 'POST', auth: 'Bearer admin-token' });
    stubFetch({
      '/rooms-access/v1/spaces/SPACE/signup-requests': () =>
        json({ enabled: true, requests: [{ id: '../x', username: 1 }] }),
    });
    await expect(client.listSignupRequests('SPACE')).rejects.toMatchObject({
      code: 'INVALID_SIGNUP_RESPONSE',
    });
  });
});
