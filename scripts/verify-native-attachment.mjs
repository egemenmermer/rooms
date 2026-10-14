/** Select the owned QA file through the real macOS dialog using cua_repl; never stub it. */
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const config = JSON.parse(await readFile('.local/production/test-accounts.json', 'utf8'));
const clients = [],
  profiles = [],
  errors = [];
const suffix = Date.now().toString(36),
  filename = `rooms-native-qa-${suffix}.txt`,
  path = resolve('.local/production', filename),
  content = `Owned native attachment QA ${suffix}`,
  bytes = Buffer.from(content + '\n');
const result = {
  at: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  packaged: false,
  actualClients: 2,
  nativePickerStubbed: false,
};
let delivered;
await writeFile(path, bytes, { mode: 0o600 });
try {
  for (const role of ['owner', 'guest']) {
    const profile = await mkdtemp(join(tmpdir(), 'rooms-attachment-'));
    profiles.push(profile);
    const env = { ...process.env, ROOMS_PROFILE: `attachment-${role}-${suffix}` };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env });
    clients.push(app);
    profiles.push(await app.evaluate(({ app }) => app.getPath('userData')));
    const page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    page.on('pageerror', () => errors.push('renderer-error'));
    await page.waitForSelector('.hero');
    await page.evaluate(() => (location.hash = '/settings?tab=connections'));
    await page.waitForSelector('.social-connection form');
    await page.locator('.social-connection input[type=url]').fill(config.base);
    await page.locator('.social-connection input[type=email]').fill(config[role].email);
    await page.locator('.social-connection input[type=password]').fill(config[role].password);
    await page.locator('.social-connection button[type=submit]').click();
    await page.waitForSelector('.signed-in-profile');
    await page.evaluate(() => (location.hash = '/chat'));
    await page.waitForSelector('.chat-transcript');
  }
  const owner = await clients[0].firstWindow(),
    guest = await clients[1].firstWindow();
  await clients[0].evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setTitle('ROOMS — Attachment QA');
    win.focus();
  });
  await owner.locator('.chat-page textarea').fill(content);
  await owner.getByRole('button', { name: 'Dosya ekle', exact: true }).click();
  console.log(JSON.stringify({ phase: 'cancel-real-native-dialog', ownedQaFile: path }));
  await owner.getByRole('button', { name: 'Dosya ekle', exact: true }).waitFor({ timeout: 120000 });
  assert.equal(await owner.locator('.chat-page textarea').inputValue(), content);
  assert.equal(await owner.locator('.pending-attachments').count(), 0);
  result.cancelPreservesDraft = true;
  await owner.getByRole('button', { name: 'Dosya ekle', exact: true }).click();
  console.log(JSON.stringify({ phase: 'select-real-native-dialog', ownedQaFile: path }));
  await owner
    .locator('.pending-attachments')
    .getByText(filename, { exact: false })
    .waitFor({ timeout: 120000 });
  result.actualNativePickerAndUpload = true;
  await owner.getByRole('button', { name: 'Topluluk mesajını gönder', exact: true }).click();
  await guest.getByText(content, { exact: true }).waitFor();
  const link = guest
    .locator('article.message')
    .filter({ hasText: content })
    .locator('.message-attachment');
  await link.waitFor();
  assert.equal(await link.locator('strong').innerText(), filename);
  result.actualUiAttachmentReceived = true;
  const messages = await owner.evaluate(
    (channel) => window.rooms.social.messages(channel),
    config.textId,
  );
  delivered = messages.find((message) => message.content === content);
  assert(delivered);
  const url = await link.getAttribute('href');
  assert(url);
  const downloaded = await fetch(url);
  assert(downloaded.ok);
  assert(Buffer.from(await downloaded.arrayBuffer()).equals(bytes));
  result.downloadedBytesMatch = true;
  await guest.screenshot({ path: 'docs/screenshots/production/native-attachment.png' });
  result.rendererErrors = errors.length;
  assert.equal(errors.length, 0);
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.failure = error.message.slice(0, 240);
} finally {
  if (delivered && clients[0])
    await (
      await clients[0].firstWindow()
    )
      .evaluate(({ channel, id }) => window.rooms.social.delete(channel, id), {
        channel: config.textId,
        id: delivered.id,
      })
      .catch(() => {});
  for (const app of clients) {
    await (
      await app.firstWindow().catch(() => null)
    )
      ?.evaluate(() => window.rooms.social.logout())
      .catch(() => {});
    await app.close().catch(() => {});
  }
  for (const profile of profiles) await rm(profile, { recursive: true, force: true });
  await rm(path, { force: true });
  await writeFile(
    'infra/production/NATIVE_ATTACHMENT_RESULTS.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
}
if (result.status !== 'PASS') process.exitCode = 1;
