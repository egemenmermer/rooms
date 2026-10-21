import { afterEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  listRooms: vi.fn(),
  listParticipants: vi.fn(),
  updateParticipant: vi.fn(),
  getParticipant: vi.fn(),
}));
vi.mock('livekit-server-sdk', async () => ({
  ...(await vi.importActual<any>('livekit-server-sdk')),
  RoomServiceClient: class {
    listRooms = sdk.listRooms;
    listParticipants = sdk.listParticipants;
    updateParticipant = sdk.updateParticipant;
    getParticipant = sdk.getParticipant;
    removeParticipant = vi.fn(async () => {});
  },
}));
vi.mock('@rooms/stoat', async () => {
  const real = await vi.importActual<any>('@rooms/stoat');
  return {
    ...real,
    StoatClient: class {
      async getCurrentUser() {
        return { id: 'viewer', displayName: 'Viewer' };
      }
      async getChannel() {
        return { _id: 'room', channel_type: 'TextChannel', voice: {}, server: 'space' };
      }
      async getServer() {
        return {
          _id: 'space',
          owner: 'viewer',
          default_permissions: String((1n << 20n) | (1n << 22n)),
        };
      }
      async getMember() {
        return { _id: { server: 'space', user: 'viewer' }, roles: [] };
      }
    },
  };
});
import { createAccessServer, DEAFENED_ATTRIBUTE } from '../apps/services/access/server';
import { TrackSource } from 'livekit-server-sdk';
const config = {
  stoatUrl: 'http://test.local',
  livekitUrl: 'http://test.local',
  publicLivekitUrl: 'ws://test.local',
  apiKey: 'test',
  apiSecret: 'test-secret-key-at-least-32-characters',
};
afterEach(() => vi.clearAllMocks());
const deafen = (server: Awaited<ReturnType<typeof createAccessServer>>, deafened: boolean) =>
  server.inject({
    method: 'POST',
    url: '/v1/media/deafen',
    headers: { authorization: 'viewer-token' },
    payload: { channelId: 'room', deafened },
  });

it('publishes deafen as a server-owned attribute only for a joined member', async () => {
  const server = await createAccessServer(config);
  try {
    const before = await deafen(server, true);
    expect(before.statusCode).toBe(403);
    expect(sdk.updateParticipant).not.toHaveBeenCalled();
    const grant = await server.inject({
      method: 'POST',
      url: '/v1/media/grant',
      headers: { authorization: 'viewer-token' },
      payload: { channelId: 'room' },
    });
    expect(grant.statusCode).toBe(200);
    expect((await deafen(server, true)).json()).toEqual({ deafened: true });
    expect(sdk.updateParticipant).toHaveBeenLastCalledWith('stoat-channel-room', 'viewer', {
      attributes: { [DEAFENED_ATTRIBUTE]: '1' },
    });
    await deafen(server, false);
    expect(sdk.updateParticipant).toHaveBeenLastCalledWith('stoat-channel-room', 'viewer', {
      attributes: { [DEAFENED_ATTRIBUTE]: '' },
    });
    const other = await server.inject({
      method: 'POST',
      url: '/v1/media/deafen',
      headers: { authorization: 'another-token' },
      payload: { channelId: 'room', deafened: true },
    });
    expect(other.statusCode).toBe(403);
  } finally {
    await server.close();
  }
});

it('recognizes a member still in the room after the service restarts', async () => {
  // A fresh server has no grants; the member's LiveKit participant survived the restart.
  sdk.getParticipant.mockResolvedValue({ identity: 'viewer', tracks: [] });
  const server = await createAccessServer(config);
  try {
    expect((await deafen(server, true)).json()).toEqual({ deafened: true });
    expect(sdk.getParticipant).toHaveBeenCalledWith('stoat-channel-room', 'viewer');
    // The recovered grant is bound to the session that asked first.
    const other = await server.inject({
      method: 'POST',
      url: '/v1/media/deafen',
      headers: { authorization: 'another-token' },
      payload: { channelId: 'room', deafened: false },
    });
    expect(other.statusCode).toBe(403);
  } finally {
    await server.close();
    sdk.getParticipant.mockReset();
  }
});

it('reports deafened occupants in the voice directory', async () => {
  sdk.listRooms.mockResolvedValue([{ name: 'stoat-channel-room' }]);
  sdk.listParticipants.mockResolvedValue([
    {
      identity: 'friend',
      name: 'Friend',
      tracks: [{ source: TrackSource.MICROPHONE, muted: true }],
      attributes: { [DEAFENED_ATTRIBUTE]: '1' },
    },
  ]);
  const server = await createAccessServer(config);
  try {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/media/directory',
      headers: { authorization: 'viewer-token' },
      payload: { channelIds: ['room'] },
    });
    expect(response.json()).toEqual({
      rooms: [
        {
          channelId: 'room',
          participants: [{ id: 'friend', name: 'Friend', muted: true, deafened: true }],
        },
      ],
    });
  } finally {
    await server.close();
  }
});
