/** Administrator-only owned deployment task. Seeds an official account invite without modifying upstream code. */
import { open, readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const i = arg.indexOf('=');
    return [arg.slice(0, i), arg.slice(i + 1)];
  }),
);
const community = options['--community-code'];
if (!community || !/^[A-Za-z0-9_-]{2,128}$/.test(community))
  throw new Error('Supply --community-code=CODE from an authorized upstream community invitation.');
const seconds = Number(options['--expires-in'] ?? 86400);
if (!Number.isInteger(seconds) || seconds < 60 || seconds > 604800)
  throw new Error('Expiry must be 60–604800 seconds.');
const file = resolve(
  process.env.ROOMS_REGISTRATION_INVITES_FILE ?? '.local/stoat/registration-invites.json',
);
await mkdir(dirname(file), { recursive: true, mode: 0o700 });
const lock = await open(`${file}.lock`, 'wx', 0o600);
try {
  const accountCode = randomBytes(32).toString('base64url');
  const signupCode = randomBytes(32).toString('base64url');
  const digest = createHash('sha256').update(signupCode).digest('hex');
  // Credentials are sent through stdin, never interpolated into shell commands or tool output.
  const script = `db.account_invites.insertOne(${JSON.stringify({ _id: accountCode, used: false })});\n`;
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'database', 'mongosh', 'revolt', '--quiet'],
    { cwd: resolve('.local/stoat'), input: script, encoding: 'utf8', timeout: 15000 },
  );
  if (result.status !== 0)
    throw new Error(
      'Could not provision the official account invitation. Verify the owned Stoat database runtime.',
    );
  let ledger;
  try {
    ledger = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ledger = { version: 1, invites: {} };
  }
  if (ledger.version !== 1 || !ledger.invites)
    throw new Error('Invalid registration ledger. Existing data was preserved.');
  const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
  ledger.invites[digest] = {
    accountInviteCode: accountCode,
    communityInviteCode: community,
    createdAt: new Date().toISOString(),
    expiresAt,
    state: 'available',
  };
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(ledger) + '\n', { mode: 0o600 });
  await rename(temp, file);
  const delivery = resolve(`.local/stoat/signup-invite-${digest.slice(0, 12)}.json`);
  await writeFile(
    delivery,
    JSON.stringify(
      { serverUrl: 'http://127.0.0.1:3021', inviteCode: signupCode, expiresAt },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  console.log(`A single-use signup ticket was issued. Private delivery file: ${delivery}`);
} finally {
  await lock.close();
  await unlink(`${file}.lock`).catch(() => {});
}
