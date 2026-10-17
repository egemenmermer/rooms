import { randomBytes, randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { issueRegistrationInvite } from '../../../apps/services/access/registration';
import { stack } from './env';
import { createAccount, StoatApi, type SeededAccount } from './stoat-api';

export interface SeededChannel {
  id: string;
  name: string;
}

/** Everything a spec needs about the disposable community created for one suite run. */
export interface RunFixture {
  runId: string;
  createdAt: string;
  serverUrl: string;
  owner: SeededAccount;
  guest: SeededAccount;
  /** Signed-up account that never joins the community. */
  outsider: SeededAccount;
  space: { id: string; name: string; inviteCode: string };
  channels: { text: SeededChannel; voice: SeededChannel };
}

export const newRunId = () => randomBytes(3).toString('hex');

const password = () => `E2e-${randomBytes(12).toString('base64url')}`;

/** Inserts an upstream account invitation, the same object the access broker consumes. */
export async function issueAccountInvite(): Promise<string> {
  const code = randomBytes(24).toString('base64url');
  const mongo = new MongoClient(stack.mongoUrl, { serverSelectionTimeoutMS: 5000 });
  try {
    await mongo.connect();
    await mongo
      .db('revolt')
      .collection<{ _id: string; used: boolean }>('account_invites')
      .insertOne({ _id: code, used: false });
  } finally {
    await mongo.close();
  }
  return code;
}

/** A fresh, onboarded account with a unique username for this run. */
export async function provisionAccount(runId: string, label: string): Promise<SeededAccount> {
  const suffix = randomBytes(2).toString('hex');
  return createAccount(new StoatApi(), {
    email: `${label}.${runId}.${suffix}@e2e.rooms.test`,
    password: password(),
    username: `${label}${runId}${suffix}`.slice(0, 32),
    invite: await issueAccountInvite(),
  });
}

/** Single-use ROOMS signup ticket bound to the community invite, as an administrator issues it. */
export async function issueSignupTicket(communityInviteCode: string) {
  return issueRegistrationInvite(
    stack.registrationLedger,
    await issueAccountInvite(),
    communityInviteCode,
    3600,
  );
}

/** Credentials for an account that does not exist yet; used to drive UI registration. */
export function newcomerCredentials(runId: string) {
  const suffix = randomBytes(2).toString('hex');
  return {
    email: `newcomer.${runId}.${suffix}@e2e.rooms.test`,
    password: password(),
    username: `new${runId}${suffix}`,
  };
}

export async function joinSpace(account: SeededAccount, inviteCode: string) {
  await new StoatApi(account.token).request(`/invites/${encodeURIComponent(inviteCode)}`, 'POST');
}

export async function createChannel(
  owner: SeededAccount,
  spaceId: string,
  name: string,
  voice = false,
): Promise<SeededChannel> {
  const channel = await new StoatApi(owner.token).request<{ _id: string; name: string }>(
    `/servers/${spaceId}/channels`,
    'POST',
    { type: 'Text', name, ...(voice ? { voice: {} } : {}) },
  );
  return { id: channel._id, name: channel.name };
}

export async function seedRun(runId = newRunId()): Promise<RunFixture> {
  const owner = await provisionAccount(runId, 'owner');
  const guest = await provisionAccount(runId, 'guest');
  const outsider = await provisionAccount(runId, 'outsider');
  const ownerApi = new StoatApi(owner.token);
  const spaceName = `E2E ${runId}`;
  const created = await ownerApi.request<{
    server: { _id: string; name: string };
    channels: { _id: string; name: string }[];
  }>('/servers/create', 'POST', { name: spaceName });
  const spaceId = created.server._id;
  const text = created.channels[0]
    ? { id: created.channels[0]._id, name: created.channels[0].name }
    : await createChannel(owner, spaceId, 'genel');
  const voice = await createChannel(owner, spaceId, 'Ses Odası', true);
  const invite = await ownerApi.request<{ _id?: string; code?: string }>(
    `/channels/${text.id}/invites`,
    'POST',
  );
  const inviteCode = invite._id ?? invite.code;
  if (!inviteCode) throw new Error('Seed invite creation returned no code.');
  await joinSpace(guest, inviteCode);
  return {
    runId,
    createdAt: new Date().toISOString(),
    serverUrl: stack.serverUrl,
    owner,
    guest,
    outsider,
    space: { id: spaceId, name: spaceName, inviteCode },
    channels: { text, voice },
  };
}

export const uniqueText = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;
