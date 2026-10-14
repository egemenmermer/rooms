/** Real window publication, presenter exclusion, logout and membership revocation. */
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const config = JSON.parse(await readFile('.local/production/test-accounts.json', 'utf8'));
const clients = [],
  profiles = [],
  errors = [],
  launches = [],
  suffix = Date.now().toString(36);
const result = {
  at: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  actualClients: 2,
  packaged: false,
  permissionScope: 'development Electron identity',
  physicalTwoComputerVerified: false,
  syntheticMedia: false,
};
let revoked = false;
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
  for (const page of [owner, guest]) {
    page.setDefaultTimeout(20000);
    await page.evaluate(() => {
      const Original = window.RTCPeerConnection;
      window.qaPeers = [];
      window.RTCPeerConnection = class extends Original {
        constructor(...args) {
          super(...args);
          window.qaPeers.push(this);
        }
      };
    });
    await page.evaluate(() => (location.hash = '/voice'));
    await page.waitForSelector('.real-voice-channels');
    const channels = await page.evaluate(
      (space) => window.rooms.social.channels(space),
      config.spaceId,
    );
    const room = channels.find((ch) => ch.id === config.voiceId);
    assert(room);
    await page
      .locator('.real-voice-channels')
      .getByRole('button', { name: room.name, exact: true })
      .click();
  }
  await guest
    .locator('.real-voice-dock')
    .getByText(/2 kişi odada/)
    .waitFor({ timeout: 30000 });

  const permission = await owner.evaluate(() => window.rooms.media.captureStatus());
  assert.equal(permission.screen, 'granted');
  const select = async (page) => {
    await page.getByRole('button', { name: 'Ekran veya pencere paylaş', exact: true }).click();
    const source = page.locator('.capture-grid button').filter({ hasText: /ROOMS/i }).first();
    await source.waitFor();
    await source.click();
    await page.getByRole('button', { name: 'Seçili kaynağı paylaş', exact: true }).click();
  };
  const video = async (page) => {
    await page.waitForFunction(
      async () => {
        let packets = 0;
        for (const pc of window.qaPeers) {
          const stats = await pc.getStats();
          stats.forEach((stat) => {
            if (stat.type === 'inbound-rtp' && stat.kind === 'video')
              packets += stat.packetsReceived ?? 0;
          });
        }
        return packets > 10;
      },
      null,
      { timeout: 20000 },
    );
    await page.locator('.shared-stage-wrap').waitFor();
  };
  result.stage = 'initial-screen';
  await select(owner);
  await owner.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).waitFor();
  await video(guest);
  result.actualInitialPresenterReceived = true;
  result.stage = 'presenter-exclusion';
  await select(guest);
  await guest
    .getByRole('dialog')
    .getByText('Bu odada biri zaten ekranını paylaşıyor. Paylaşmadan önce durdurmasını iste.', {
      exact: true,
    })
    .waitFor();
  result.secondPresenterRejectedPrecisely = true;
  await guest.getByRole('dialog').getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await owner.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).click();
  await guest.locator('.shared-stage-wrap').waitFor({ state: 'detached' });
  await select(guest);
  await guest.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).waitFor();
  await video(owner);
  result.presenterHandoffReceived = true;
  result.stage = 'logout';
  await guest.evaluate(() => (location.hash = '/settings?tab=connections'));
  await guest.getByRole('button', { name: 'Çıkış yap', exact: true }).click();
  await guest.waitForSelector('.social-connection form');
  await owner.locator('.shared-stage-wrap').waitFor({ state: 'detached' });
  await owner
    .locator('.real-voice-dock')
    .getByText(/1 kişi odada/)
    .waitFor();
  assert.equal((await guest.evaluate(() => window.rooms.social.session())).user, null);
  result.logoutStopsPublicationAndSession = true;
  // Restore only the existing owned guest's session for an active membership-revocation exercise.
  await guest.locator('.social-connection input[type=url]').fill(config.base);
  await guest.locator('.social-connection input[type=email]').fill(config.guest.email);
  await guest.locator('.social-connection input[type=password]').fill(config.guest.password);
  await guest.locator('.social-connection button[type=submit]').click();
  await guest.waitForSelector('.signed-in-profile');
  await guest.evaluate(() => (location.hash = '/voice'));
  await guest.waitForSelector('.real-voice-channels');
  const channels = await guest.evaluate(
      (space) => window.rooms.social.channels(space),
      config.spaceId,
    ),
    channel = channels.find((item) => item.id === config.voiceId);
  assert(channel);
  await guest
    .locator('.real-voice-channels')
    .getByRole('button', { name: channel.name, exact: true })
    .click();
  await guest
    .locator('.real-voice-dock')
    .getByText(/2 kişi odada/)
    .waitFor();
  await select(guest);
  await guest.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).waitFor();
  await owner.locator('.shared-stage-wrap').waitFor();
  result.stage = 'active-revocation';
  const guestId = (await guest.evaluate(() => window.rooms.social.session())).user.id;
  const started = Date.now();
  await owner.evaluate(({ space, user }) => window.rooms.social.removeMember(space, user), {
    space: config.spaceId,
    user: guestId,
  });
  revoked = true;
  await owner.locator('.shared-stage-wrap').waitFor({ state: 'detached', timeout: 25000 });
  await owner
    .locator('.real-voice-dock')
    .getByText(/1 kişi odada/)
    .waitFor();
  result.activeRevocationStopsScreen = true;
  result.revocationElapsedMs = Date.now() - started;
  await guest
    .locator('.voice-error-notice')
    .getByText(/Ses bağlantısı kesildi/)
    .waitFor();
  assert(await guest.getByRole('button', { name: 'Mikrofonu aç', exact: true }).isDisabled());
  result.revokedClientShowsDisconnected = true;
  await assert.rejects(() =>
    guest.evaluate((channel) => window.rooms.media.grant(channel), config.voiceId),
  );
  result.revokedFreshGrantDenied = true;
  await select(owner);
  await owner.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).waitFor();
  await owner.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).click();
  result.revokedPresenterLeaseReleased = true;
  await guest.screenshot({ path: 'docs/screenshots/production/native-media-revoked.png' });
  result.rendererErrors = errors.length;
  assert.equal(errors.length, 0);
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.failure = error.message.slice(0, 240);
  if (clients[1])
    result.guestAlerts = await (
      await clients[1].firstWindow()
    )
      .locator('[role=alert]')
      .allTextContents()
      .catch(() => []);
} finally {
  if (revoked) {
    try {
      const owner = await clients[0].firstWindow(),
        guest = await clients[1].firstWindow();
      const invitation = await owner.evaluate(
        (channel) => window.rooms.social.createInvite(channel),
        config.textId,
      );
      await guest.evaluate((code) => window.rooms.social.acceptInvite(code), invitation.code);
      result.ownedGuestMembershipRestored = true;
    } catch {
      result.status = 'FAIL';
      result.ownedGuestMembershipRestored = false;
    }
  }
  for (const app of clients) {
    await (
      await app.firstWindow().catch(() => null)
    )
      ?.evaluate(() => window.rooms.social.logout())
      .catch(() => {});
    await app.close().catch(() => {});
  }
  for (const profile of profiles) await rm(profile, { recursive: true, force: true });
  await writeFile(
    'infra/production/NATIVE_MEDIA_LIFECYCLE_RESULTS.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
}
if (result.status !== 'PASS') process.exitCode = 1;
