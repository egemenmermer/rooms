/** Actual configured upstream verification. Never substitute a mock server or emit credentials. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const file = process.env.ROOMS_STOAT_TEST_ACCOUNTS ?? '.local/stoat/test-accounts.json';
let config;
try {
  config = JSON.parse(await readFile(file, 'utf8'));
} catch {
  console.error(
    'Actual Stoat verification blocked: provide an owned test-accounts JSON file. No fixtures were treated as upstream evidence.',
  );
  process.exit(1);
}
await mkdir('.local/stoat-verification', { recursive: true });
await build({
  entryPoints: ['packages/stoat-adapter/src/index.ts'],
  outfile: '.local/stoat-verification/adapter.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
const { StoatClient } = await import(
  pathToFileURL(resolve('.local/stoat-verification/adapter.mjs'))
);
const results = [];
const clients = [];
async function check(name, run) {
  try {
    await run();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({
      name,
      status: 'FAIL',
      code: typeof error?.code === 'string' ? error.code : 'ASSERTION_FAILED',
    });
  }
}
const assert = (value) => {
  if (!value) throw new Error('Verification assertion failed');
};
const events = [];
const waiter = (predicate, timeout = 10000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const event = events.find(predicate);
      if (event) {
        clearInterval(timer);
        resolve(event);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('Actual gateway event missing'));
      }
    }, 50);
  });
try {
  const owner = new StoatClient(config.base),
    guest = new StoatClient(config.base);
  clients.push(owner, guest);
  await check('two actual accounts sign in and receive Ready', async () => {
    await owner.login(config.owner.email, config.owner.password);
    await guest.login(config.guest.email, config.guest.password);
    guest.subscribe((e) => events.push(e));
    await Promise.all([owner.connect(), guest.connect()]);
    assert(owner.status === 'connected' && guest.status === 'connected');
  });
  await check('actual memberships and channel IDs', async () => {
    assert((await owner.listSpaces()).some((s) => s.id === config.spaceId));
    assert((await guest.listSpaces()).some((s) => s.id === config.spaceId));
    assert((await guest.listChannels(config.spaceId)).some((c) => c.id === config.textId));
  });
  let message;
  await check('actual send and other client gateway receipt', async () => {
    message = await owner.sendMessage(
      config.textId,
      `ROOMS actual Stoat verification ${crypto.randomUUID()}`,
    );
    await waiter((e) => e.type === 'MESSAGE_CREATE' && e.data.id === message.id);
  });
  await check('actual edit propagated to other client', async () => {
    assert(message);
    await owner.editMessage(config.textId, message.id, 'ROOMS actual Stoat edit verification');
    await waiter(
      (e) =>
        e.type === 'MESSAGE_UPDATE' &&
        e.data.id === message.id &&
        e.data.content === 'ROOMS actual Stoat edit verification',
    );
  });
  await check('actual user presence update observed by other client', async () => {
    guest.subscribePresence(config.spaceId);
    const user = await owner.getCurrentUser();
    await owner.updatePresence('idle');
    await waiter(
      (e) => e.type === 'PRESENCE_UPDATE' && e.data.userId === user.id && e.data.status === 'idle',
    );
    await owner.updatePresence('online');
  });
  await check('actual delete propagated', async () => {
    assert(message);
    await owner.deleteMessage(config.textId, message.id);
    await waiter((e) => e.type === 'MESSAGE_DELETE' && e.data.id === message.id);
  });
  await check('actual session can restore authenticated REST', async () => {
    const restored = new StoatClient(config.base, guest.getToken());
    assert((await restored.getCurrentUser()).id === (await guest.getCurrentUser()).id);
    await restored.disconnect();
  });
  if (config.outsider) {
    await check('third actual nonmember denied channel access', async () => {
      const outsider = new StoatClient(config.base);
      clients.push(outsider);
      await outsider.login(config.outsider.email, config.outsider.password);
      try {
        await outsider.getChannel(config.textId);
        throw new Error('Access unexpectedly allowed');
      } catch (error) {
        assert(error.status === 403 || error.status === 404);
      }
    });
  } else
    results.push({
      name: 'third actual nonmember denied channel access',
      status: 'UNVERIFIED',
      reason: 'No outsider account configured.',
    });
} finally {
  for (const client of clients) await client.disconnect();
}
await writeFile(
  'infra/stoat/INTEGRATION_RESULTS.json',
  JSON.stringify({ kind: 'actual-upstream', at: new Date().toISOString(), results }, null, 2) +
    '\n',
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
