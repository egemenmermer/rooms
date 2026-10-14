import { expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerMusicGateway } from '../apps/services/access/music-gateway';
const secret = 'a'.repeat(40);
const state = {
  channelId: 'room',
  identity: 'rooms-music-room',
  status: 'paused',
  queue: [],
  currentId: null,
  positionSec: 0,
  error: null,
};
it('requires fresh joined control and issues only a publish-only bot grant', async () => {
  const server = Fastify();
  let allowed = true;
  let sent: any;
  const roomService = {
    getParticipant: vi.fn(async () => ({ identity: 'self' })),
    listParticipants: vi.fn(async () => [{ identity: 'self' }]),
    removeParticipant: vi.fn(async () => {}),
    updateParticipant: vi.fn(async () => {}),
  };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    sent = options?.body ? JSON.parse(String(options.body)) : null;
    return new Response(JSON.stringify(state));
  });
  const gateway = registerMusicGateway(server, {
    url: 'http://worker',
    secret,
    apiKey: 'devkey',
    apiSecret: 'development-secret-at-least-32-characters',
    livekitUrl: 'ws://livekit:7880',
    roomService: roomService as any,
    authorize: async () => ({ userId: 'self', canControl: allowed }),
  });
  try {
    const denied = await server.inject({
      method: 'POST',
      url: '/v1/music/room',
      payload: { type: 'play' },
    });
    expect(denied.statusCode).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    const result = await server.inject({
      method: 'POST',
      url: '/v1/music/room',
      headers: { authorization: 'user-session' },
      payload: { type: 'play' },
    });
    expect(result.statusCode).toBe(200);
    const jwt = JSON.parse(Buffer.from(sent.lease.token.split('.')[1], 'base64url').toString());
    expect(jwt.sub).toBe('rooms-music-room');
    expect(jwt.video.canSubscribe).toBe(false);
    expect(jwt.video.canPublishData).toBe(false);
    expect(jwt.video.canPublishSources).toHaveLength(1);
    const leaseId = sent.lease.leaseId;
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/v1/music/internal/lease',
          headers: { authorization: 'Bearer wrong' },
          payload: { channelId: 'room', leaseId },
        })
      ).statusCode,
    ).toBe(401);
    await gateway.webhook('room', 'rooms-music-room', JSON.stringify({ musicLeaseId: leaseId }));
    expect(roomService.updateParticipant).toHaveBeenCalled();
    allowed = false;
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/v1/music/internal/lease',
          headers: { authorization: `Bearer ${secret}` },
          payload: { channelId: 'room', leaseId },
        })
      ).statusCode,
    ).toBe(403);
    expect(roomService.removeParticipant).toHaveBeenCalledWith(
      'stoat-channel-room',
      'rooms-music-room',
    );
  } finally {
    await server.close();
    fetcher.mockRestore();
  }
});
it('rejects a bot identity without a live matching lease and rejects commands by a user outside the voice room', async () => {
  const server = Fastify(),
    remove = vi.fn(async () => {}),
    fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not run'));
  const gateway = registerMusicGateway(server, {
    url: 'http://worker',
    secret,
    apiKey: 'key',
    apiSecret: 'secret',
    livekitUrl: 'ws://livekit',
    roomService: {
      getParticipant: async () => {
        throw new Error('not joined');
      },
      listParticipants: async () => [],
      removeParticipant: remove,
      updateParticipant: async () => {},
    } as any,
    authorize: async () => ({ userId: 'self', canControl: true }),
  });
  try {
    await gateway.webhook('room', 'rooms-music-room', '{}');
    expect(remove).toHaveBeenCalled();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/music/room',
      headers: { authorization: 'user-session' },
      payload: { type: 'play' },
    });
    expect(response.statusCode).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    await server.close();
    fetcher.mockRestore();
  }
});

it('requires joined control for search, rechecks access, and never returns private worker fields', async () => {
  const server = Fastify();
  let joined = true,
    allowed = true;
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify([{ id: 'w2BTr6qsLFc', title: 'Song', durationSec: 200 }])),
    );
  registerMusicGateway(server, {
    url: 'http://worker',
    secret,
    apiKey: 'key',
    apiSecret: 'secret',
    livekitUrl: 'ws://livekit',
    roomService: {
      getParticipant: async () => {
        if (!joined) throw new Error('not joined');
        return { identity: 'self' };
      },
      listParticipants: async () => [],
      removeParticipant: async () => {},
      updateParticipant: async () => {},
    } as any,
    authorize: async () => ({ userId: 'self', canControl: allowed }),
  });
  const request = () =>
    server.inject({
      method: 'POST',
      url: '/v1/music/room/search',
      headers: { authorization: 'user-session' },
      payload: { query: 'Diyar Pala' },
    });
  try {
    joined = false;
    expect((await request()).statusCode).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    joined = true;
    const result = await request();
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual([{ id: 'w2BTr6qsLFc', title: 'Song', durationSec: 200 }]);
    fetcher.mockImplementationOnce(async () => {
      allowed = false;
      return new Response(JSON.stringify([{ id: 'w2BTr6qsLFc', title: 'Song', durationSec: 200 }]));
    });
    expect((await request()).statusCode).toBe(403);
  } finally {
    await server.close();
    fetcher.mockRestore();
  }
});

it('rejects malformed search text and invalid seek positions before contacting the worker', async () => {
  const server = Fastify(),
    fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('must not run'));
  registerMusicGateway(server, {
    url: 'http://worker',
    secret,
    apiKey: 'key',
    apiSecret: 'secret',
    livekitUrl: 'ws://livekit',
    roomService: {
      getParticipant: async () => ({ identity: 'self' }),
      listParticipants: async () => [],
      removeParticipant: async () => {},
      updateParticipant: async () => {},
    } as any,
    authorize: async () => ({ userId: 'self', canControl: true }),
  });
  try {
    await server.inject({
      method: 'POST',
      url: '/v1/music/room/search',
      headers: { authorization: 'user-session' },
      payload: { query: '\n' },
    });
    await server.inject({
      method: 'POST',
      url: '/v1/music/room',
      headers: { authorization: 'user-session' },
      payload: { type: 'seek', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', positionSec: -1 },
    });
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    await server.close();
    fetcher.mockRestore();
  }
});
