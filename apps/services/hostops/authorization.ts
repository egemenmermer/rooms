import type { StoatAuthorizationReader } from '../access/stoat-authorization';
import { stoatChannelPermissions, StoatPermissions } from '../access/stoat-permissions';

/** Private, find-only boundary. The Agent receives only visible IDs, never Core credentials. */
export async function visibleHostRooms(
  reader: Pick<StoatAuthorizationReader, 'read'>,
  communityId: string,
  userId: string,
  roomIds: string[],
): Promise<string[]> {
  const visible: string[] = [];
  // Bound concurrent database work even for the maximum static room policy.
  for (let offset = 0; offset < roomIds.length; offset += 5) {
    const ids = await Promise.all(
      roomIds.slice(offset, offset + 5).map(async (id) => {
        try {
          const { channel, server, member } = await reader.read(id, userId);
          return server._id === communityId &&
            !!(
              stoatChannelPermissions(server, channel, member, userId) &
              StoatPermissions.VIEW_CHANNEL
            )
            ? id
            : null;
        } catch {
          return null;
        }
      }),
    );
    visible.push(...ids.filter((id): id is string => id !== null));
  }
  return visible;
}
