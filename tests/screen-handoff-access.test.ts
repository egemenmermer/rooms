import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const media = vi.hoisted(() => ({
  participants: new Map<
    string,
    { identity: string; sid?: string; tracks: { source: number; sid?: string }[] }
  >(),
  publish: new Map<string, unknown>(),
  revoked: new Set<string>(),
  update: vi.fn(),
  send: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  event: {} as any,
}));
vi.mock('livekit-server-sdk', async () => {
  const real = await vi.importActual<any>('livekit-server-sdk');
  return {
    ...real,
    RoomServiceClient: class {
      listParticipants = media.list;
      getParticipant = media.get;
      updateParticipant = media.update;
      sendData = media.send;
      removeParticipant = vi.fn(async (_room: string, id: string) => {
        media.participants.delete(id);
      });
      deleteRoom = vi.fn();
    },
    WebhookReceiver: class {
      receive = async () => media.event;
    },
  };
});
vi.mock('@rooms/stoat', async () => {
  const real = await vi.importActual<any>('@rooms/stoat');
  return {
    ...real,
    StoatClient: class {
      constructor(
        _url: string,
        private token: string,
      ) {}
      async getCurrentUser() {
        return { id: this.token, displayName: this.token };
      }
      async getChannel(id: string) {
        return { _id: id, server: 'server', channel_type: 'TextChannel', voice: {} };
      }
      async getServer() {
        return {
          _id: 'server',
          owner: 'admin',
          default_permissions: String(
            (1n << 20n) | (1n << 30n) | (1n << 31n) | (1n << 32n) | (1n << 36n),
          ),
        };
      }
      async getMember(_server: string, id: string) {
        return { _id: { server: 'server', user: id }, can_publish: !media.revoked.has(id) };
      }
    },
  };
});
import { createAccessServer } from '../apps/services/access/server';
import { TrackSource } from 'livekit-server-sdk';
let server: Awaited<ReturnType<typeof createAccessServer>>,
  now = 100000;
type TestResponse = { statusCode: number; json(): Record<string, any> };
const post = async (
  path: string,
  user: string,
  payload: Record<string, unknown> = { channelId: 'channel' },
): Promise<TestResponse> => {
  const response = await server.inject({
    method: 'POST',
    url: `/v1/media/${path}`,
    headers: { authorization: `Bearer ${user}` },
    payload,
  });
  return response as unknown as TestResponse;
};
async function start() {
  const result = await post('screen/acquire', 'host');
  expect(result.statusCode).toBe(200);
  return result.json().leaseId as string;
}
async function request(leaseId: string, user = 'next') {
  const requestId = randomUUID();
  const result = await post('screen/request', user, { channelId: 'channel', leaseId, requestId });
  expect(result.statusCode).toBe(200);
  return { channelId: 'channel', leaseId, requestId };
}
async function approve(context: object) {
  const result = await post('screen/request/decide', 'host', { ...context, approve: true });
  expect(result.statusCode).toBe(200);
}
beforeEach(async () => {
  now = 100000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  media.participants.clear();
  media.revoked.clear();
  media.publish.clear();
  for (const identity of ['host', 'next', 'other'])
    media.participants.set(identity, { identity, tracks: [] });
  media.list.mockImplementation(async () => [...media.participants.values()]);
  media.get.mockImplementation(async (_room: string, id: string) => media.participants.get(id));
  media.update.mockImplementation(async (_room: string, id: string, options: unknown) => {
    media.publish.set(id, options);
  });
  server = await createAccessServer({
    stoatUrl: 'http://test.local',
    livekitUrl: 'http://test.local',
    publicLivekitUrl: 'ws://test.local',
    apiKey: 'test',
    apiSecret: 'test-secret-key-at-least-32-characters',
  });
  for (const user of ['host', 'next', 'other'])
    expect((await post('grant', user)).statusCode).toBe(200);
});
afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe('screen handoff access lease', () => {
  it('enables control data only after approval without clearing voice/screen permissions, and revokes on rejoin', async () => {
    for (const [id, p] of media.participants) p.sid = `PA_${id}`;
    expect((await post('screens/acquire', 'host')).statusCode).toBe(200);
    media.participants.get('host')!.tracks = [
      { source: TrackSource.SCREEN_SHARE, sid: 'TR_screen' },
    ];
    const epoch = randomUUID();
    expect(
      (await post('remote/register', 'host', { channelId: 'channel', trackId: 'TR_screen', epoch }))
        .statusCode,
    ).toBe(200);
    const requestId = (
      await post('remote/request', 'next', { channelId: 'channel', publisherId: 'host', epoch })
    ).json().requestId;
    expect((await post('remote/state', 'next')).json().lease).toBeNull();
    expect(
      (await post('remote/decide', 'other', { channelId: 'channel', requestId, approve: true }))
        .statusCode,
    ).not.toBe(200);
    expect(
      (await post('remote/decide', 'host', { channelId: 'channel', requestId, approve: true }))
        .statusCode,
    ).toBe(200);
    const publish = media.publish.get('host') as {
      permission: {
        canPublish: boolean;
        canSubscribe: boolean;
        canPublishData: boolean;
        canPublishSources: number[];
      };
    };
    expect(publish.permission.canPublish).toBe(true);
    expect(publish.permission.canSubscribe).toBe(true);
    expect(publish.permission.canPublishData).toBe(true);
    expect(publish.permission.canPublishSources).toContain(TrackSource.SCREEN_SHARE);
    const calls = media.update.mock.calls.length;
    expect((await post('remote/state', 'next')).json().lease.inputKey).toMatch(/^[a-f0-9]{64}$/);
    expect(media.update.mock.calls.length).toBe(calls);
    expect((await post('remote/state', 'other')).json().lease).toBeNull();
    expect((await post('grant', 'next')).statusCode).toBe(200);
    expect((await post('remote/state', 'host')).json().lease).toBeNull();
    // Data stays open after the lease: cursors and watch state use it, and input frames need the MAC.
    expect((media.publish.get('host') as any).permission.canPublishData).toBe(true);
    expect((media.publish.get('host') as any).permission.canPublishSources).toContain(
      TrackSource.SCREEN_SHARE,
    );
  });
  it('lets a member with Move Members move or disconnect someone in the room, and no one else', async () => {
    const moderate = (user: string, payload: Record<string, unknown>) =>
      post('moderate', user, { channelId: 'channel', ...payload });
    expect((await moderate('host', { userId: 'next', action: 'disconnect' })).json().error).toBe(
      'MOVE_MEMBERS_REQUIRED',
    );
    expect((await moderate('admin', { userId: 'admin', action: 'disconnect' })).statusCode).toBe(
      400,
    );
    expect((await moderate('admin', { userId: 'next', action: 'move' })).statusCode).toBe(400);
    expect((await moderate('admin', { userId: 'nobody', action: 'disconnect' })).json().error).toBe(
      'MEMBER_NOT_IN_ROOM',
    );
    media.send.mockClear();
    const moved = await moderate('admin', {
      userId: 'next',
      action: 'move',
      targetChannelId: 'lounge',
    });
    expect(moved.json()).toEqual({ moved: true });
    const [room, data, , options] = media.send.mock.calls[0]!;
    expect(room).toBe('stoat-channel-channel');
    expect(JSON.parse(new TextDecoder().decode(data))).toEqual({
      channelId: 'lounge',
      by: 'admin',
    });
    expect(options).toEqual({ destinationIdentities: ['next'], topic: 'rooms-move-v1' });
    expect(media.participants.has('next')).toBe(true);
    expect((await moderate('admin', { userId: 'next', action: 'disconnect' })).json()).toEqual({
      disconnected: true,
    });
    expect(media.participants.has('next')).toBe(false);
  });
  it('lets every member send room data such as whiteboard cursors and watch state', async () => {
    const result = await post('grant', 'other');
    expect(result.statusCode).toBe(200);
    const claims = JSON.parse(
      Buffer.from(result.json().token.split('.')[1], 'base64url').toString('utf8'),
    );
    expect(claims.video.canPublishData).toBe(true);
  });
  it('approval reserves but does not revoke the old presenter; release waits for old SFU tracks to disappear', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    media.participants.get('host')!.tracks = [{ source: TrackSource.SCREEN_SHARE }];
    const calls = media.update.mock.calls.length;
    await approve(context);
    expect(media.update.mock.calls.length).toBe(calls);
    expect((await post('screen/acquire', 'next')).json().error).toBe('SCREEN_HANDOFF_PENDING');
    expect((await post('screen/release', 'host')).statusCode).toBe(200);
    expect((await post('screen/acquire', 'other')).json().error).toBe('SCREEN_HANDOFF_PENDING');
    expect((await post('screen/acquire', 'next')).json().error).toBe('PRESENTER_BUSY');
    media.participants.get('host')!.tracks = [];
    const acquired = await post('screen/acquire', 'next');
    expect(acquired.statusCode).toBe(200);
    expect(acquired.json().leaseId).not.toBe(leaseId);
    const state = (await post('screen/state', 'next')).json();
    expect(state.presenter.userId).toBe('next');
    expect(state.reservation).toBeNull();
    expect(state.requests).toEqual([]);
    expect(JSON.stringify(state)).not.toContain('Bearer');
  });
  it('uses current media presenter ownership, validates UUIDs, and checks current VIDEO permission', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    expect(
      (await post('screen/request/decide', 'other', { ...context, approve: true })).statusCode,
    ).toBe(403);
    expect(
      (await post('screen/request', 'next', { ...context, leaseId: 'invalid' })).statusCode,
    ).toBe(400);
    media.revoked.add('next');
    expect(
      (await post('screen/request/decide', 'host', { ...context, approve: true })).statusCode,
    ).toBe(403);
    expect((await post('screen/state', 'host')).json().requests).toEqual([]);
  });
  it('requires connected grant membership and allows only owner cancellation', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    expect((await post('screen/request/cancel', 'other', context)).statusCode).toBe(403);
    expect((await post('screen/request/cancel', 'next', context)).statusCode).toBe(200);
    media.participants.delete('next');
    expect(
      (await post('screen/request', 'next', { ...context, requestId: randomUUID() })).statusCode,
    ).toBe(403);
    expect(
      (await post('screen/request', 'outsider', { ...context, requestId: randomUUID() }))
        .statusCode,
    ).toBe(403);
  });
  it('denies without disconnecting and expires pending requests/reservations', async () => {
    const leaseId = await start();
    let context = await request(leaseId);
    expect(
      (await post('screen/request/decide', 'host', { ...context, approve: false })).json().approved,
    ).toBe(false);
    expect(media.participants.has('next')).toBe(true);
    context = await request(leaseId);
    now += 60000;
    expect(
      (await post('screen/request/decide', 'host', { ...context, approve: true })).statusCode,
    ).toBe(409);
    context = await request(leaseId);
    await approve(context);
    await post('screen/release', 'host');
    now += 30000;
    expect((await post('screen/acquire', 'other')).statusCode).toBe(200);
  });
  it('invalidates requests on reconnect and requires a new lease context', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    media.event = {
      event: 'participant_joined',
      room: { name: 'stoat-channel-channel' },
      participant: { identity: 'host' },
    };
    expect((await post('webhook', 'host', {})).statusCode).toBe(200);
    expect(
      (await post('screen/request/decide', 'host', { ...context, approve: true })).json().error,
    ).toBe('SCREEN_LEASE_STALE');
    expect(await start()).not.toBe(leaseId);
  });
  it('clears reservation on requester leave and lets a first presenter acquire afterwards', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    await approve(context);
    await post('screen/release', 'host');
    await post('leave', 'next');
    expect((await post('screen/acquire', 'other')).statusCode).toBe(200);
  });
  it('does not release the lease or reservation when SFU permission removal fails', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    await approve(context);
    media.update.mockRejectedValueOnce(new Error('unavailable'));
    expect((await post('screen/release', 'host')).statusCode).toBe(503);
    expect((await post('screen/acquire', 'next')).json().error).toBe('SCREEN_HANDOFF_PENDING');
    const state = (await post('screen/state', 'host')).json();
    expect(state.presenter.leaseId).toBe(leaseId);
    expect(state.reservation.released).toBe(false);
  });
  it('keeps approved acquisition exclusive across concurrent calls', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    await approve(context);
    await post('screen/release', 'host');
    const results = await Promise.all([
      post('screen/acquire', 'next'),
      post('screen/acquire', 'other'),
    ]);
    expect(results[0].statusCode).toBe(200);
    expect(results[1].statusCode).toBe(409);
  });
  it('rechecks reserved requester permission and clears its consent on revocation', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    await approve(context);
    await post('screen/release', 'host');
    media.revoked.add('next');
    expect((await post('screen/acquire', 'next')).statusCode).toBe(403);
    expect((await post('screen/state', 'host')).json().reservation).toBeNull();
  });
  it('rejects a reservation that expires while checking SFU tracks and never grants publication', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    await approve(context);
    await post('screen/release', 'host');
    media.list.mockImplementationOnce(async () => {
      now += 30000;
      return [...media.participants.values()];
    });
    expect((await post('screen/acquire', 'next')).statusCode).toBe(409);
    const update = media.publish.get('next') as { permission: { canPublishSources: number[] } };
    expect(update.permission.canPublishSources).not.toContain(TrackSource.SCREEN_SHARE);
  });
  it('cancels an approved reservation only for its owner', async () => {
    const leaseId = await start(),
      context = await request(leaseId);
    await approve(context);
    await post('screen/release', 'host');
    expect((await post('screen/request/cancel', 'other', context)).statusCode).toBe(403);
    expect((await post('screen/request/cancel', 'next', context)).statusCode).toBe(200);
    expect((await post('screen/acquire', 'other')).statusCode).toBe(200);
  });
});

it('grants two connected members independent concurrent shares and releases only the caller', async () => {
  const results = await Promise.all([
    post('screens/acquire', 'host'),
    post('screens/acquire', 'next'),
  ]);
  expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
  expect(results[0].json().leaseId).not.toBe(results[1].json().leaseId);
  expect((media.publish.get('host') as any).permission.canPublishSources).toContain(
    TrackSource.SCREEN_SHARE,
  );
  expect((media.publish.get('next') as any).permission.canPublishSources).toContain(
    TrackSource.SCREEN_SHARE,
  );
  expect((await post('screens/release', 'host')).statusCode).toBe(200);
  expect((media.publish.get('host') as any).permission.canPublishSources).not.toContain(
    TrackSource.SCREEN_SHARE,
  );
  expect((media.publish.get('next') as any).permission.canPublishSources).toContain(
    TrackSource.SCREEN_SHARE,
  );
});
it('parallel sharing still requires current membership, a connected grant and VIDEO permission', async () => {
  expect((await post('screens/acquire', 'outsider')).statusCode).toBe(403);
  media.revoked.add('next');
  expect((await post('screens/acquire', 'next')).statusCode).toBe(403);
  expect((await post('screens/acquire', 'host')).statusCode).toBe(200);
  expect((media.publish.get('host') as any).permission.canPublishSources).toContain(
    TrackSource.SCREEN_SHARE,
  );
});
