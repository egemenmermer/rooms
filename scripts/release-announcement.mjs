import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

export function announcementContent(version, notes) {
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw Error('Invalid release version');
  if (
    notes?.version !== version ||
    !Array.isArray(notes.changes) ||
    !notes.changes.length ||
    notes.changes.length > 15
  )
    throw Error('Release notes must match the published version and contain 1–15 changes');
  const changes = notes.changes.map((value) => {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > 240 ||
      /[\x00-\x1f]|@everyone|@online|<@/i.test(value)
    )
      throw Error('Invalid release note');
    return `• ${value.trim()}`;
  });
  const content = `Tayfa ${version} yayınlandı\n\n${changes.join('\n')}\n\nUygulamadaki Ayarlar → Güncelleme ve hakkında bölümünden güncellemeyi kontrol edebilirsin.`;
  if (content.length > 2000) throw Error('Release announcement exceeds 2000 characters');
  return content;
}
/** Called only after artifact/feed publication. State and credentials never enter release assets. */
export async function announceRelease({ version, notes, config, stateDirectory, request = fetch }) {
  const content = announcementContent(version, notes);
  const origin = new URL(config.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw Error('Announcement origin must be an HTTPS origin');
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(config.channelId) ||
    !['session', 'bot'].includes(config.tokenType)
  )
    throw Error('Invalid announcement channel or token type');
  const token = (await readFile(config.tokenFile, 'utf8')).trim();
  if (!token || token.length > 8192 || /[\r\n\0]/.test(token))
    throw Error('Invalid announcement credential file');
  const key = createHash('sha256')
    .update(`${origin.origin}:${config.channelId}:${version}`)
    .digest('hex');
  const deliveryKey = `rooms-release-v2-${key.slice(0, 32)}`;
  const ledger = join(stateDirectory, `${key}.json`),
    lock = ledger + '.lock';
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  try {
    await mkdir(lock);
  } catch {
    throw Error('Announcement already running; inspect the release receipt before retrying');
  }
  const save = async (record) => {
    await writeFile(ledger + '.stage', JSON.stringify(record), { mode: 0o600 });
    await rename(ledger + '.stage', ledger);
  };
  const call = async (path, options = {}) => {
    const response = await request(`${origin.origin}/api${path}`, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        [config.tokenType === 'bot' ? 'x-bot-token' : 'x-session-token']: token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok)
      throw Error(
        `Announcement request failed (${response.status}); published artifacts are unchanged`,
      );
    return response.json();
  };
  try {
    let prior;
    try {
      prior = JSON.parse(await readFile(ledger, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (prior?.status === 'sent') return { status: 'already-sent' };
    const history = await call(`/channels/${config.channelId}/messages?limit=100`);
    if (!Array.isArray(history)) throw Error('Invalid announcement history');
    const existing = history.find(
      (message) =>
        message.nonce === deliveryKey ||
        // Versions before the rename were announced as ROOMS.
        (typeof message.content === 'string' &&
          [`Tayfa ${version} yayınlandı\n`, `ROOMS ${version} yayınlandı\n`].some((prefix) =>
            message.content.startsWith(prefix),
          )),
    );
    if (existing) {
      await save({ version, status: 'sent', messageId: existing._id });
      return { status: 'already-sent' };
    }
    if (prior?.status === 'pending')
      throw Error('Announcement delivery is uncertain; inspect channel history before retrying');
    await save({ version, status: 'pending' });
    const result = await call(`/channels/${config.channelId}/messages`, {
      method: 'POST',
      // Stoat consumes the header before the legacy body nonce. Sending both
      // with the same value makes the first delivery look like a duplicate.
      headers: { 'Idempotency-Key': deliveryKey },
      body: JSON.stringify({ content }),
    });
    if (typeof result?._id !== 'string')
      throw Error('Announcement delivery is uncertain; inspect channel history');
    await save({ version, status: 'sent', messageId: result._id });
    return { status: 'sent' };
  } finally {
    await rmdir(lock);
  }
}
export async function prepareReleaseAnnouncement(output, env = process.env) {
  const configPath =
    env.ROOMS_RELEASE_ANNOUNCEMENT_CONFIG ??
    join(homedir(), '.config/rooms/release-announcements.json');
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' && !env.ROOMS_RELEASE_ANNOUNCEMENT_CONFIG) return null;
    throw e;
  }
  const manifest = JSON.parse(await readFile(join(output, 'release-manifest.json'), 'utf8'));
  const notes = JSON.parse(await readFile(join(output, 'release-notes.json'), 'utf8'));
  announcementContent(manifest.version, notes);
  const origin = new URL(config.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(config.channelId) ||
    !['session', 'bot'].includes(config.tokenType)
  )
    throw Error('Invalid release announcement configuration');
  const token = (await readFile(config.tokenFile, 'utf8')).trim();
  if (!token || token.length > 8192 || /[\r\n\0]/.test(token))
    throw Error('Invalid announcement credential file');
  return {
    version: manifest.version,
    notes,
    config,
    stateDirectory: resolve(dirname(configPath), 'announcement-receipts'),
  };
}
export async function announcePublishedRelease(output, env = process.env) {
  const prepared = await prepareReleaseAnnouncement(output, env);
  return prepared ? announceRelease(prepared) : { status: 'not-configured' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  throw Error(
    'Announcements run from the successful release publication hook, not from candidate packaging',
  );
