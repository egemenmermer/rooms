import { StoatClient, StoatError } from '@rooms/stoat';
import { StoatAuthorizationReader } from '../access/stoat-authorization';
import {
  stoatChannelPermissions,
  StoatPermissions,
  type StoatChannel,
  type StoatMember,
  type StoatServer,
} from '../access/stoat-permissions';

export type CinemaIdentity = { userId: string; displayName: string };

export interface CinemaAuthority {
  /** Current member of the community; `isOwner` gates account changes. */
  community(token: string, communityId: string): Promise<CinemaIdentity & { isOwner: boolean }>;
  /** Someone who can see the channel; returns the community it belongs to. */
  channel(
    token: string,
    channelId: string,
  ): Promise<CinemaIdentity & { communityId: string; isOwner: boolean }>;
  close(): Promise<void>;
}

/** Same checks as Access and Activities: upstream REST for the user, the read-only Mongo reader for membership. */
export function stoatAuthority(options: { stoatUrl: string; mongoUrl?: string }): CinemaAuthority {
  const reader = options.mongoUrl ? new StoatAuthorizationReader(options.mongoUrl) : null;
  const client = (token: string) =>
    new StoatClient(options.stoatUrl, token, {
      trustedInternalOrigin: true,
      apiRoot: !new URL(options.stoatUrl).pathname.startsWith('/api'),
    });
  return {
    async community(token, communityId) {
      const stoat = client(token);
      const user = await stoat.getCurrentUser();
      const context = reader ? await reader.community(communityId, user.id) : null;
      const server = (context?.server ??
        (await stoat.getServer(communityId))) as unknown as StoatServer;
      if (!context) await stoat.getMember(communityId, user.id);
      return { userId: user.id, displayName: user.displayName, isOwner: server.owner === user.id };
    },
    async channel(token, channelId) {
      const stoat = client(token);
      const user = await stoat.getCurrentUser();
      const context = reader ? await reader.read(channelId, user.id) : null;
      const channel = (context?.channel ??
        (await stoat.getChannel(channelId))) as unknown as StoatChannel;
      if (typeof channel.server !== 'string') throw new StoatError(403, 'ROOM_ACCESS_DENIED');
      const [server, member] = context
        ? [context.server, context.member]
        : await Promise.all([
            stoat.getServer(channel.server),
            stoat.getMember(channel.server, user.id),
          ]);
      const permissions = stoatChannelPermissions(
        server as unknown as StoatServer,
        channel,
        member as unknown as StoatMember,
        user.id,
      );
      if (!(permissions & StoatPermissions.VIEW_CHANNEL))
        throw new StoatError(403, 'ROOM_ACCESS_DENIED');
      return {
        userId: user.id,
        displayName: user.displayName,
        communityId: channel.server,
        isOwner: (server as unknown as StoatServer).owner === user.id,
      };
    },
    async close() {
      await reader?.close();
    },
  };
}
