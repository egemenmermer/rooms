import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const config = JSON.parse(await readFile('.local/production/test-accounts.json', 'utf8'));
const clients = [],
  profiles = [],
  errors = [],
  launches = [];
const suffix = Date.now().toString(36),
  content = `Owned native production check ${suffix}`;
let createdItemId;
const result = {
  at: new Date().toISOString(),
  actualDesktopClients: 2,
  platform: process.platform,
  arch: process.arch,
  officialPlayers: true,
  sharedPlayback: false,
  pauseDelivered: false,
  rendererErrors: 0,
};
try {
  for (const role of ['owner', 'guest']) {
    const profile = await mkdtemp(join(tmpdir(), 'rooms-production-ui-'));
    profiles.push(profile);
    const env = { ...process.env, ROOMS_PROFILE: `production-${role}-${suffix}` };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch =
      process.env.ROOMS_QA_PACKAGED === '1'
        ? {
            executablePath: resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),
            args: [`--user-data-dir=${profile}`],
            env,
          }
        : { args: ['.', `--user-data-dir=${profile}`], env };
    launches.push(launch);
    const app = await electron.launch(launch);
    clients.push(app);
    result.packaged = await app.evaluate(({ app }) => app.isPackaged);
    result.appVersion = await app.evaluate(({ app }) => app.getVersion());
    profiles.push(await app.evaluate(({ app }) => app.getPath('userData')));
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
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
  for (const page of [owner, guest]) {
    await page.evaluate(() => (location.hash = '/youtube'));
    await page.waitForSelector('.youtube-page');
  }
  const initialQueue = (
    await owner.evaluate((roomId) => window.rooms.activity.snapshot(roomId), config.textId)
  ).room.queue.map((item) => item.id);
  await owner.locator('.shared-queue input').first().fill('M7lc1UVf-VE');
  const sampleTitle = `QA YouTube sample ${suffix}`;
  await owner.locator('.shared-queue input').nth(1).fill(sampleTitle);
  result.stage = 'queue-add';
  result.initialQueueCount = initialQueue.length;
  result.initialUiQueueCount = await owner.locator('.shared-queue-item').count();
  await owner.getByRole('button', { name: 'Ortak sıraya ekle', exact: true }).click();
  await owner.getByText(sampleTitle, { exact: true }).waitFor({ timeout: 30000 });
  const added = (
    await owner.evaluate((roomId) => window.rooms.activity.snapshot(roomId), config.textId)
  ).room.queue.filter((item) => !initialQueue.includes(item.id));
  assert.equal(added.length, 1);
  createdItemId = added[0].id;
  await owner.locator('.shared-queue-item').last().locator('button').first().click();
  const getPlayer = (page) =>
    page.frames().find((f) => f.url().includes('/rooms-activities/player/youtube'));
  for (const page of [owner, guest]) {
    await page.waitForFunction(() => document.querySelector('.youtube-stage iframe'));
    await page.waitForTimeout(4000);
    const official = page
      .frames()
      .find((f) => f.url().startsWith('https://www.youtube.com/embed/'));
    assert(official, 'Official embedded player must exist');
    const play = official.getByRole('button', { name: /^Play/ }).first();
    if (await play.isVisible()) await play.click();
  }
  const everyonePlay = owner.getByRole('button', { name: 'Herkes için oynat', exact: true });
  if (await everyonePlay.isVisible()) await everyonePlay.click();
  await owner
    .getByRole('button', { name: 'Herkes için duraklat', exact: true })
    .waitFor({ timeout: 30000 });
  for (const page of [owner, guest])
    await getPlayer(page).waitForFunction(
      () => player.getPlayerState() === 1 && player.getCurrentTime() > 1,
      null,
      { timeout: 30000 },
    );
  result.sharedPlayback = true;
  await owner.getByRole('button', { name: 'Herkes için duraklat', exact: true }).click();
  for (const page of [owner, guest])
    await getPlayer(page).waitForFunction(() => player.getPlayerState() === 2, null, {
      timeout: 30000,
    });
  result.pauseDelivered = true;
  await owner.waitForTimeout(2500);
  const seek = owner.getByRole('slider', { name: 'Ortak oynatma konumu', exact: true });
  const box = await seek.boundingBox();
  assert(box);
  const duration = Number(await seek.getAttribute('max'));
  assert(duration > 15);
  await seek.click({ position: { x: 8 + ((box.width - 16) * 14) / duration, y: box.height / 2 } });
  for (const page of [owner, guest])
    await getPlayer(page).waitForFunction(
      () => player.getCurrentTime() >= 10 && player.getPlayerState() === 2,
      null,
      { timeout: 30000 },
    );
  result.seekDelivered = true;
  result.stage = 'keyboard-seek';
  await clients[0].evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
  await owner.waitForFunction(() => !document.querySelector('.youtube-timeline input').disabled);
  await seek.focus();
  const keyboardTarget = Math.min(duration, Number(await seek.inputValue()) + 10);
  await seek.press('Shift+ArrowRight');
  await getPlayer(guest).waitForFunction(
    (target) => Math.abs(player.getCurrentTime() - target) < 1,
    keyboardTarget,
    { timeout: 30000 },
  );
  result.keyboardSeekDelivered = true;
  const membership = await owner.evaluate(
    (roomId) => window.rooms.activity.snapshot(roomId),
    config.textId,
  );
  assert(membership.room.participants.some((p) => p.userId === config.guest.userId));
  result.bothViewersJoinedAuthoritatively = true;
  result.stage = 'late-rejoin';
  await owner.getByRole('button', { name: 'Herkes için oynat', exact: true }).click();
  await getPlayer(owner).waitForFunction(
    () => player.getPlayerState() === 1 && player.getCurrentTime() > 13,
  );
  await guest.evaluate(() => (location.hash = '/home'));
  await guest.waitForSelector('.hero');
  await owner.waitForTimeout(3500);
  await guest.evaluate(() => (location.hash = '/youtube'));
  await guest.waitForSelector('.youtube-stage iframe');
  await guest.waitForTimeout(5000);
  const official = guest.frames().find((f) => f.url().startsWith('https://www.youtube.com/embed/'));
  assert(official);
  const play = official.getByRole('button', { name: /^Play/ }).first();
  if (await play.isVisible()) await play.click();
  await guest.getByRole('button', { name: 'Şimdi eşitle', exact: true }).first().click();
  await getPlayer(guest).waitForFunction(() => player.getPlayerState() === 1, null, {
    timeout: 30000,
  });
  const positions = await Promise.all(
    [owner, guest].map((page) => getPlayer(page).evaluate(() => player.getCurrentTime())),
  );
  result.lateRejoinDriftSec = Math.abs(positions[0] - positions[1]);
  assert(result.lateRejoinDriftSec < 3);
  result.lateRejoinSynchronized = true;
  await owner.getByRole('button', { name: 'Herkes için duraklat', exact: true }).click();
  await owner.getByRole('button', { name: 'Herkes için oynat', exact: true }).waitFor();
  await owner.screenshot({ path: 'docs/screenshots/production/youtube-shared-controls.png' });
  result.rendererErrors = errors.length;
  assert.equal(errors.length, 0);
} catch (error) {
  result.failure = error.message.slice(0, 240);
  if (clients[0]) {
    const page = await clients[0].firstWindow().catch(() => null);
    if (page) {
      result.uiErrors = await page.locator('[role=alert],.toast').allTextContents();
      result.finalUiQueueCount = await page.locator('.shared-queue-item').count();
      await page
        .screenshot({ path: 'docs/screenshots/production/youtube-shared-failure.png' })
        .catch(() => {});
    }
  }
} finally {
  if (createdItemId && clients[0]) {
    try {
      const page = await clients[0].firstWindow();
      await page.evaluate(
        async ({ roomId, itemId, commandId }) => {
          const snapshot = await window.rooms.activity.snapshot(roomId);
          await window.rooms.activity.command(roomId, {
            protocolVersion: 1,
            commandId,
            expectedRevision: snapshot.room.revision,
            command: { type: 'queue.remove', itemId },
          });
        },
        { roomId: config.textId, itemId: createdItemId, commandId: randomUUID() },
      );
      result.qaQueueItemRemoved = true;
    } catch {
      result.qaQueueItemRemoved = false;
    }
  }
  await writeFile(
    'infra/production/YOUTUBE_SHARED_RESULTS.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
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

if (result.failure) process.exitCode = 1;
