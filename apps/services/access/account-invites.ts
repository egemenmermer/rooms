import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';

/** Where one-time Stoat account invitations are written; tests replace the database. */
export interface AccountInviteSink {
  insert(code: string): Promise<void>;
}

/** Stoat account invitations are single-use, so multi-use links seed a fresh one per signup. */
export async function seedAccountInvite(sink: AccountInviteSink) {
  const code = randomBytes(32).toString('base64url');
  await sink.insert(code);
  return code;
}

/** Insert-only sink over the delegated `account_invites` connection. */
export function mongoAccountInviteSink(client: MongoClient): AccountInviteSink {
  return {
    async insert(code) {
      await client
        .db('revolt')
        .collection<{ _id: string; used: boolean }>('account_invites')
        .insertOne({ _id: code, used: false });
    },
  };
}
