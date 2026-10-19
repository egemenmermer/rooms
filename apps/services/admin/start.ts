/**
 * Self-hosting administrator CLI. Runs inside the deployment network next to the
 * access service and talks to the private upstream API; upstream code is unchanged.
 *
 *   bootstrap  Create the owner account, community, voice channel and upstream invite.
 *              Reads `email=`, `password=`, `username=` and `communityName=` lines on stdin
 *              so the password never appears in process arguments.
 *   invite     Issue multi-use ROOMS invitation links (https://<domain>/davet/<token>) for the
 *              bootstrapped community. Each signup seeds its own account invitation.
 *   status     Print the non-secret bootstrap state.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MongoClient } from 'mongodb';
import { INVITE_LINKS_PER_SPACE, inviteShareLink } from '@rooms/social';
import { StoatError } from '@rooms/stoat';
import { issueRegistrationInvite } from '../access/registration';

interface AdminState {
  version: 1;
  ownerCreated?: boolean;
  ownerUserId?: string;
  spaceId?: string;
  textId?: string;
  voiceId?: string;
  communityCode?: string;
}

const env = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new AdminError(`Missing configuration: ${name}`);
  return value;
};
class AdminError extends Error {}

const apiUrl = () => env('STOAT_INTERNAL_URL', 'http://api:14702').replace(/\/+$/, '');
const statePath = () => env('ROOMS_ADMIN_STATE_FILE', '/state/admin-state.json');
const ledgerPath = () => env('ROOMS_REGISTRATION_INVITES_FILE', '/state/registration-invites.json');

async function loadState(): Promise<AdminState> {
  try {
    const value = JSON.parse(await readFile(statePath(), 'utf8'));
    if (value?.version !== 1) throw new AdminError('Unsupported admin state file.');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1 };
    throw error;
  }
}

async function saveState(state: AdminState) {
  const path = statePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const file = await open(temp, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(state, null, 2) + '\n');
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, path);
}

async function api<T = any>(path: string, method = 'GET', body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers['x-session-token'] = token;
  const response = await fetch(apiUrl() + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok)
    throw new AdminError(
      `Upstream ${method} ${path.replace(/[A-Z0-9]{26}/g, ':id')} failed: HTTP ${response.status} ${data?.type ?? ''}`.trim(),
    );
  return data as T;
}

async function seedAccountInvite() {
  const mongo = new MongoClient(env('ROOMS_ACCOUNT_INVITE_MONGO_URL'), {
    serverSelectionTimeoutMS: 10000,
  });
  try {
    await mongo.connect();
    const code = randomBytes(32).toString('base64url');
    await mongo
      .db('revolt')
      .collection('account_invites')
      .insertOne({ _id: code, used: false } as any);
    return code;
  } finally {
    await mongo.close();
  }
}

async function readStdinFields() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const fields: Record<string, string> = {};
  for (const line of Buffer.concat(chunks).toString('utf8').split('\n')) {
    const index = line.indexOf('=');
    if (index > 0) fields[line.slice(0, index)] = line.slice(index + 1).replace(/\r$/, '');
  }
  return fields;
}

async function bootstrap() {
  const input = await readStdinFields();
  const email = String(input.email ?? '').trim();
  const password = String(input.password ?? '');
  const username = String(input.username ?? '').trim();
  const communityName = String(input.communityName ?? '').trim() || 'ROOMS';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AdminError('Enter a valid email.');
  if (password.length < 8) throw new AdminError('Password must be at least 8 characters.');
  if (!/^[\p{L}\p{N}_.-]{2,32}$/u.test(username))
    throw new AdminError('Username must be 2–32 letters, digits, "_", "." or "-".');
  if (communityName.length > 32) throw new AdminError('Community name must be ≤32 characters.');

  const state = await loadState();
  if (state.communityCode) {
    console.log('Already bootstrapped. Existing community was preserved.');
    return;
  }
  if (!state.ownerCreated) {
    const invite = await seedAccountInvite();
    await api('/auth/account/create', 'POST', { email, password, invite });
    state.ownerCreated = true;
    await saveState(state);
    console.log('Owner account created.');
  }
  const session = await api<{ token?: string; result?: string }>('/auth/session/login', 'POST', {
    email,
    password,
    friendly_name: 'ROOMS self-host bootstrap',
  });
  if (typeof session?.token !== 'string')
    throw new AdminError('Login needs extra verification; complete it in the desktop app.');
  const token = session.token;
  try {
    const hello = await api<{ onboarding: boolean }>('/onboard/hello', 'GET', undefined, token);
    if (hello.onboarding) await api('/onboard/complete', 'POST', { username }, token);
    state.ownerUserId = (await api<{ _id: string }>('/users/@me', 'GET', undefined, token))._id;
    if (!state.spaceId) {
      const created = await api<{ server: { _id: string }; channels: { _id: string }[] }>(
        '/servers/create',
        'POST',
        { name: communityName },
        token,
      );
      state.spaceId = created.server._id;
      state.textId = created.channels[0]?._id;
      if (!state.textId) throw new AdminError('Upstream community has no default channel.');
      await saveState(state);
    }
    if (!state.voiceId) {
      const channel = await api<{ _id: string }>(
        `/servers/${state.spaceId}/channels`,
        'POST',
        { type: 'Text', name: 'Sohbet', voice: { max_users: 25 } },
        token,
      );
      state.voiceId = channel._id;
      await saveState(state);
    }
    const invitation = await api<{ _id?: string; code?: string }>(
      `/channels/${state.textId}/invites`,
      'POST',
      {},
      token,
    );
    const code = invitation?.code ?? invitation?._id;
    if (!code) throw new AdminError('Upstream invitation response has no code.');
    state.communityCode = code;
    await saveState(state);
  } finally {
    await api('/auth/session/logout', 'POST', undefined, token).catch(() => {});
  }
  console.log(`Community "${communityName}" is ready with a voice channel.`);
}

async function invite(args: Record<string, string>) {
  const state = await loadState();
  if (!state.communityCode) throw new AdminError('Run bootstrap first.');
  const publicUrl = env('ROOMS_PUBLIC_URL').replace(/\/+$/, '');
  const count = Number(args.count ?? 1);
  const days = Number(args.days ?? 7);
  const uses = Number(args.uses ?? 10);
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new AdminError('--count must be 1–20.');
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new AdminError('--days must be 1–7.');
  if (!Number.isInteger(uses) || uses < 1 || uses > 50)
    throw new AdminError('--uses must be 1–50.');
  for (let index = 0; index < count; index++) {
    const issued = await issueRegistrationInvite(ledgerPath(), {
      communityInviteCode: state.communityCode,
      spaceId: state.spaceId,
      source: 'admin',
      maxUses: uses,
      seconds: days * 86400,
    }).catch((error) => {
      if (error instanceof StoatError && error.code === 'INVITE_LIMIT_REACHED')
        throw new AdminError(
          `This community already has ${INVITE_LINKS_PER_SPACE} active invitation links. Cancel one in the app under Topluluk yönetimi → Davetler.`,
        );
      if (error instanceof StoatError && error.code === 'REGISTRATION_BUSY')
        throw new AdminError('Another signup is updating the invitation ledger. Try again.');
      throw error;
    });
    const link = inviteShareLink(publicUrl, issued.code);
    if (!link) throw new AdminError('ROOMS_PUBLIC_URL must be an https address.');
    const expires = new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(issued.expiresAt));
    console.log(`${link}\t(${days} gün · ${issued.maxUses} kişi · son geçerlilik: ${expires})`);
  }
}

async function status() {
  const state = await loadState();
  console.log(
    JSON.stringify(
      {
        bootstrapped: Boolean(state.communityCode),
        ownerUserId: state.ownerUserId ?? null,
        spaceId: state.spaceId ?? null,
        voiceId: state.voiceId ?? null,
      },
      null,
      2,
    ),
  );
}

const [command, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(
  rest
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, ...value] = arg.slice(2).split('=');
      return [key, value.join('=')];
    }),
);
const commands: Record<string, () => Promise<void>> = {
  bootstrap,
  invite: () => invite(args),
  status,
};
const run = commands[command ?? ''];
if (!run) {
  console.error('Usage: admin.cjs <bootstrap|invite|status> [--count=N] [--days=N] [--uses=N]');
  process.exitCode = 2;
} else {
  run().catch((error) => {
    console.error(error instanceof AdminError ? error.message : 'Admin command failed.');
    if (!(error instanceof AdminError) && process.env.ROOMS_ADMIN_DEBUG) console.error(error);
    process.exitCode = 1;
  });
}
