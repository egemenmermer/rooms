import { MongoClient } from 'mongodb';
import { StoatError } from '@rooms/stoat';
import { SOCIAL_ID_PATTERN } from '@rooms/social';
import type { StoatChannel, StoatMember, StoatServer } from './stoat-permissions';

/** Read-only schema adapter pinned to Stoat v0.15.5. Authentication stays upstream REST.
 * Every authorization reads current membership and permissions, without retaining them.
 * Avoids exhausting upstream's five server REST reads per ten seconds during activities.
 * The database role permits find only on channels, servers and server_members.
 */
export class StoatAuthorizationReader {
  private readonly mongo: MongoClient;
  constructor(url: string) {
    this.mongo = new MongoClient(url, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 5,
    });
  }
  async read(
    channelId: string,
    userId: string,
  ): Promise<{ channel: StoatChannel; server: StoatServer; member: StoatMember }> {
    if (!SOCIAL_ID_PATTERN.test(channelId) || !SOCIAL_ID_PATTERN.test(userId))
      throw new StoatError(400, 'INVALID_ID');
    const db = this.mongo.db('revolt');
    const channel = (await db
      .collection('channels')
      .findOne({ _id: channelId } as any)) as unknown as StoatChannel | null;
    if (!channel || typeof channel.server !== 'string' || !SOCIAL_ID_PATTERN.test(channel.server))
      throw new StoatError(403, 'ROOM_ACCESS_DENIED');
    const [server, member] = await Promise.all([
      db.collection('servers').findOne({ _id: channel.server } as any),
      db
        .collection('server_members')
        .findOne({
          '_id.server': channel.server,
          '_id.user': userId,
          pending_deletion_at: { $exists: false },
        }),
    ]);
    if (!server || !member) throw new StoatError(403, 'ROOM_ACCESS_DENIED');
    return {
      channel,
      server: server as unknown as StoatServer,
      member: member as unknown as StoatMember,
    };
  }
  close() {
    return this.mongo.close();
  }
}
