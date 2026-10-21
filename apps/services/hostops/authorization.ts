import { StoatError } from '@rooms/stoat';
import type { StoatAuthorizationReader } from '../access/stoat-authorization';
import {
  stoatChannelPermissions,
  stoatCommunityAdmin,
  StoatPermissions,
  type StoatMember,
  type StoatServer,
} from '../access/stoat-permissions';

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

/**
 * Whether this member owns the community or is an owner-equivalent admin (`stoatCommunityAdmin`).
 * The membership store answers first; if it cannot be reached (a refusal is still a refusal) the
 * Stoat API answers instead, so an unreachable store never locks the owner out.
 */
export async function communityOwnership(
  reader: Pick<StoatAuthorizationReader, 'community'> | null,
  api: {
    getServer(id: string): Promise<{ owner?: unknown }>;
    getMember(serverId: string, userId: string): Promise<unknown>;
  },
  communityId: string,
  userId: string,
): Promise<boolean> {
  if (reader)
    try {
      const { server, member } = await reader.community(communityId, userId);
      return stoatCommunityAdmin(server, member, userId);
    } catch (error) {
      if (error instanceof StoatError) throw error;
    }
  const server = (await api.getServer(communityId)) as StoatServer;
  if (server.owner === userId) return true;
  const member = (await api.getMember(communityId, userId)) as StoatMember;
  return stoatCommunityAdmin(server, member, userId);
}
