import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const config = JSON.parse(await readFile('.local/production/test-accounts.json', 'utf8'));
const clients = [],
  profiles = [],
  errors = [],
  launches = [];
const suffix = Date.now().toString(36),
  content = `Owned native production check ${suffix}`;
let delivered;
await mkdir('docs/screenshots/production', { recursive: true });
try {
  for (const role of ['owner', 'guest']) {
    const profile = await mkdtemp(join(tmpdir(), 'rooms-production-ui-'));
    profiles.push(profile);
    const env = { ...process.env, ROOMS_PROFILE: `production-${role}-${suffix}` };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = { args: ['.', `--user-data-dir=${profile}`], env };
    launches.push(launch);
    const app = await electron.launch(launch);
    clients.push(app);
    profiles.push(await app.evaluate(({ app }) => app.getPath('userData')));
    const page = await app.firstWindow();
    page.on('pageerror', () => errors.push('renderer-error'));
    await page.waitForSelector('.hero');
    await page.evaluate(() => (location.hash = '/settings?tab=connections'));
    await page.waitForSelector('.social-connection form');
    await page.locator('.social-connection input[type=url]').fill(config.base);
    await page.locator('.social-connection input[type=email]').fill(config[role].email);
    await page.locator('.social-connection input[type=password]').fill(config[role].password);
    await page.locator('.social-connection button[type=submit]').click();
    await page.waitForSelector('.signed-in-profile', { timeout: 30000 });
    assert.equal(await page.locator('.social-connection .error-pane').count(), 0);
    await page.evaluate(() => (location.hash = '/chat'));
    await page.waitForSelector('.chat-transcript');
  }
  const owner = await clients[0].firstWindow(),
    guest = await clients[1].firstWindow();
  await owner.locator('.chat-page textarea').fill(content);
  await owner.locator('.chat-page textarea').press('Enter');
  await guest.getByText(content, { exact: true }).waitFor({ timeout: 20000 });
  const messages = await owner.evaluate(
    (channel) => window.rooms.social.messages(channel),
    config.textId,
  );
  delivered = messages.find((x) => x.content === content);
  assert(delivered);
  await owner.screenshot({ path: 'docs/screenshots/production/owner-chat.png' });
  await guest.screenshot({ path: 'docs/screenshots/production/guest-chat.png' });
  await owner.evaluate(() => (location.hash = '/home'));
  await owner.waitForSelector('.hero');
  await owner.screenshot({ path: 'docs/screenshots/production/home.png' });
  await owner.evaluate(() => (location.hash = '/chat'));
  await owner.waitForSelector('.chat-transcript');
  const row = owner.locator('article.message').filter({ hasText: content });
  await row.hover();
  await row.getByRole('button', { name: 'Mesajını düzenle', exact: true }).click();
  await owner.locator('.edit-textarea').fill(content + ' edited');
  await owner.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();

  try {
    await guest.getByText(content + ' edited', { exact: true }).waitFor({ timeout: 20000 });
  } catch (error) {
    const detail = {
      ownerAlerts: await owner.locator('[role=alert],.toast').allTextContents(),
      editModalOpen: await owner.locator('.edit-textarea').count(),
      guestStillOriginal: await guest.getByText(content, { exact: true }).count(),
      nativeEdited: (
        await owner.evaluate((channel) => window.rooms.social.messages(channel), config.textId)
      ).some((m) => m.id === delivered.id && m.content === content + ' edited'),
    };
    console.log(JSON.stringify({ editFailure: detail }));
    throw error;
  }
  assert(
    (await owner.evaluate(() => window.rooms.social.session())).remembered,
    'OS encryption must persist session',
  );
  await clients[0].close();
  clients[0] = await electron.launch(launches[0]);
  const restored = await clients[0].firstWindow();
  await restored.waitForSelector('.hero');
  await restored.evaluate(() => (location.hash = '/settings?tab=connections'));
  await restored.waitForSelector('.signed-in-profile', { timeout: 30000 });
  assert.equal(
    (await restored.evaluate(() => window.rooms.social.session())).user.id,
    config.owner.userId,
  );
  await restored.evaluate(() => (location.hash = '/chat'));
  await restored.waitForSelector('.chat-transcript');
  const restoredRow = restored.locator('article.message').filter({ hasText: content + ' edited' });
  await restoredRow.hover();
  await restoredRow.getByRole('button', { name: 'Mesajını sil', exact: true }).click();
  await restored.getByRole('dialog').locator('button.danger').click();
  await guest
    .getByText(content + ' edited', { exact: true })
    .waitFor({ state: 'detached', timeout: 20000 });
  delivered = null;
  const invitation = await restored.evaluate(
    (channel) => window.rooms.social.createInvite(channel),
    config.textId,
  );
  const registration = {
    email: `egemenmermerroomsnative${suffix}@gmail.com`,
    password: randomUUID() + randomUUID(),
    username: `native_${suffix}`,
    inviteCode: invitation.code,
  };
  await writeFile(
    `.local/production/native-registration-${suffix}.json`,
    JSON.stringify(registration),
    { mode: 0o600 },
  );
  const signupProfile = `production-signup-${suffix}`,
    signupEnv = { ...process.env, ROOMS_PROFILE: signupProfile };
  delete signupEnv.ELECTRON_RUN_AS_NODE;
  const signupApp = await electron.launch({ args: ['.'], env: signupEnv });
  clients.push(signupApp);
  profiles.push(await signupApp.evaluate(({ app }) => app.getPath('userData')));
  const signup = await signupApp.firstWindow();
  await signup.waitForSelector('.hero');
  await signup.evaluate(
    ({ base, code }) =>
      (location.hash = `/settings?tab=connections&server=${encodeURIComponent(base)}&invite=${code}&access=register`),
    { base: config.base, code: invitation.code },
  );
  await signup
    .getByRole('textbox', { name: 'Kullanıcı adı', exact: true })
    .fill(registration.username);
  await signup.locator('.social-connection input[type=email]').fill(registration.email);
  await signup.locator('.social-connection input[type=password]').fill(registration.password);
  await signup.locator('.social-connection button[type=submit]').click();
  await signup.waitForSelector('.signed-in-profile', { timeout: 60000 });
  assert(
    (await signup.evaluate(() => window.rooms.social.spaces())).some(
      (space) => space.id === config.spaceId,
    ),
  );
  await assert.rejects(() =>
    signup.evaluate(({ base, code }) => window.rooms.social.inspectInvite(base, code), {
      base: config.base,
      code: invitation.code,
    }),
  );
  await signup.evaluate(() => (location.hash = '/chat'));
  await signup.waitForSelector('.chat-transcript');
  await signup.screenshot({ path: 'docs/screenshots/production/registered-friend.png' });
  await restored.evaluate(() => (location.hash = '/settings?tab=connections'));
  await restored.waitForSelector('.signed-in-profile');
  await restored.getByRole('button', { name: 'Çıkış yap', exact: true }).click();
  await restored.waitForSelector('.social-connection form');
  assert.equal((await restored.evaluate(() => window.rooms.social.session())).remembered, false);
  assert.equal(errors.length, 0);
  const result = {
    at: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    realPublicStoatLogin: true,
    actualClients: 2,
    uiMessageSendAndDelivery: true,
    rendererErrors: errors.length,
    nativeDevicesVerified: false,
    sessionRestartVerified: true,
    uiEditAndDeleteDelivered: true,
    logoutClearsSession: true,
    nativeInvitationRegistration: true,
    consumedInvitationRejected: true,
  };
  await writeFile('infra/production/DESKTOP_RESULTS.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
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
}
