import { expect, it } from 'vitest';
import { visibleHostRooms } from '../apps/services/hostops/authorization';
import { StoatPermissions } from '../apps/services/access/stoat-permissions';

it('rechecks channel visibility, community and membership without returning private context', async () => {
  let revoked = false;
  let missingMember = false;
  const reader = {
    async read(id: string, userId: string) {
      if (missingMember) throw Error('ROOM_ACCESS_DENIED');
      const server = {
        _id: id === 'foreign' ? 'other-space' : 'space',
        owner: 'owner',
        default_permissions: String(StoatPermissions.VIEW_CHANNEL),
      };
      return {
        server,
        channel: {
          _id: id,
          server: server._id,
          channel_type: 'TextChannel',
          default_permissions: revoked ? { d: String(StoatPermissions.VIEW_CHANNEL) } : {},
        },
        member: { _id: { server: server._id, user: userId } },
      };
    },
  };
  expect(await visibleHostRooms(reader, 'space', 'person', ['room', 'foreign'])).toEqual(['room']);
  revoked = true;
  expect(await visibleHostRooms(reader, 'space', 'person', ['room'])).toEqual([]);
  missingMember = true;
  expect(await visibleHostRooms(reader, 'space', 'owner', ['room'])).toEqual([]);
});
