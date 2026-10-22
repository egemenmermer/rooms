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
const me = () => json({ _id: 'NEWUSER', username: 'friend', display_name: 'Friend' });

describe('approved sign-up in the Stoat adapter', () => {
  it('reports whether the server accepts requests, treating old brokers as closed', async () => {
    stubFetch({ '/rooms-access/v1/auth/signup': () => json({ enabled: true }) });
    expect(await new StoatClient('https://friends.example').signupAvailable()).toBe(true);
    stubFetch({});
    expect(await new StoatClient('https://friends.example').signupAvailable()).toBe(false);
  });

  it('sends only the form to the broker and keeps the returned session', async () => {
    const calls = stubFetch({
      '/rooms-access/v1/auth/signup-requests': () =>
        json({ token: 'session-token', status: 'pending' }),
      '/users/@me': me,
    });
    const client = new StoatClient('https://friends.example');
    const user = await client.requestSignup({
      email: 'friend@example.com',
      password: 'correct horse battery',
      username: 'friend',
    });
    expect(user.id).toBe('NEWUSER');
    expect(client.getToken()).toBe('session-token');
    expect(calls[0]).toMatchObject({
      url: 'https://friends.example/rooms-access/v1/auth/signup-requests',
      method: 'POST',
      body: { email: 'friend@example.com', password: 'correct horse battery', username: 'friend' },
    });
  });

  it('surfaces broker refusals with their codes', async () => {
    stubFetch({
      '/rooms-access/v1/auth/signup-requests': () => json({ error: 'SIGNUP_QUEUE_FULL' }, 503),
    });
    const failure = await new StoatClient('https://friends.example')
      .requestSignup({ email: 'a@example.com', password: 'longenough', username: 'ab' })
      .catch((error) => error);
    expect(failure).toBeInstanceOf(StoatError);
    expect(failure.code).toBe('SIGNUP_QUEUE_FULL');
    expect(failure.message).toMatch(/waiting for approval/);
  });

  it('reads the request status with the session and refreshes after joining', async () => {
    const calls = stubFetch({
      '/rooms-access/v1/auth/signup-requests/me': () =>
        json({ status: 'joined', enabled: true, space: { id: 'SPACE', name: 'Tayfa' } }),
    });
    const client = new StoatClient('https://friends.example', 'session-token');
    const events: string[] = [];
    client.subscribe((event) => events.push(event.type));
    expect(await client.signupStatus()).toEqual({
      status: 'joined',
      enabled: true,
      createdAt: null,
      space: { id: 'SPACE', name: 'Tayfa' },
    });
    expect(calls[0]!.auth).toBe('Bearer session-token');
    expect(events).toContain('SOCIAL_REFRESH');
    // A broker without approved sign-up answers 404: nothing to wait for.
    stubFetch({});
    expect((await client.signupStatus()).status).toBe('none');
  });

  it('lists and decides requests for admins and rejects malformed lists', async () => {
    const calls = stubFetch({
      '/rooms-access/v1/spaces/SPACE/signup-requests': () =>
        json({
          enabled: true,
          requests: [
            { userId: 'U1', username: 'friend', createdAt: '2026-10-20T10:00:00.000Z', state: 'x' },
          ],
        }),
      '/rooms-access/v1/spaces/SPACE/signup-requests/U1/approve': () => json({ state: 'approved' }),
    });
    const client = new StoatClient('https://friends.example', 'admin-token');
    expect(await client.listSignupRequests('SPACE')).toEqual({
      enabled: true,
      requests: [
        {
          userId: 'U1',
          username: 'friend',
          createdAt: '2026-10-20T10:00:00.000Z',
          state: 'pending',
        },
      ],
    });
    await client.decideSignupRequest('SPACE', 'U1', 'approve');
    expect(calls[1]).toMatchObject({ method: 'POST', auth: 'Bearer admin-token' });
    stubFetch({
      '/rooms-access/v1/spaces/SPACE/signup-requests': () =>
        json({ enabled: true, requests: [{ userId: '../x', username: 1 }] }),
    });
    await expect(client.listSignupRequests('SPACE')).rejects.toMatchObject({
      code: 'INVALID_SIGNUP_RESPONSE',
    });
  });
});
