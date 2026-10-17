import { test, expect } from '../support/fixtures';
import { VoiceView } from '../support/pages/voice';

// Media comes from Chromium's synthetic devices (a beep and a test pattern) through the real
// access grant, LiveKit SFU and WebRTC transport. This is not two-computer hardware acceptance.
test.describe('voice rooms through LiveKit', () => {
  test('two members see each other and hear the microphone', async ({ owner, guest, run }) => {
    const ownerVoice = new VoiceView(owner);
    const guestVoice = new VoiceView(guest);
    await guestVoice.tapPeerConnections();
    await ownerVoice.join(run.channels.voice.name);
    await guestVoice.join(run.channels.voice.name);

    await expect(ownerVoice.participant(run.guest.username)).toBeVisible();
    await expect(guestVoice.participant(run.owner.username)).toBeVisible();
    await expect(guestVoice.participant(run.owner.username)).toHaveAccessibleName(
      /mikrofon kapalı/,
    );

    const before = await guestVoice.inboundPackets('audio');
    await ownerVoice.unmute();
    await guestVoice.expectMediaFlowing('audio', before);
    await expect(guestVoice.participant(run.owner.username)).not.toHaveAccessibleName(
      /mikrofon kapalı/,
    );

    await ownerVoice.mute();
    await expect(guestVoice.participant(run.owner.username)).toHaveAccessibleName(
      /mikrofon kapalı/,
    );
  });

  test('camera video reaches the other member', async ({ owner, guest, run }) => {
    const ownerVoice = new VoiceView(owner);
    const guestVoice = new VoiceView(guest);
    await guestVoice.tapPeerConnections();
    await ownerVoice.join(run.channels.voice.name);
    await guestVoice.join(run.channels.voice.name);
    await expect(guestVoice.participant(run.owner.username)).toBeVisible();

    const before = await guestVoice.inboundPackets('video');
    await owner.page.getByRole('button', { name: 'Kamerayı aç' }).first().click();
    await expect(owner.page.getByRole('button', { name: 'Kamerayı kapat' }).first()).toBeVisible();
    await guestVoice.expectMediaFlowing('video', before);
    await owner.page.getByRole('button', { name: 'Kamerayı kapat' }).first().click();
  });

  test('the call survives navigating to other pages', async ({ owner, guest, run }) => {
    const ownerVoice = new VoiceView(owner);
    const guestVoice = new VoiceView(guest);
    await ownerVoice.join(run.channels.voice.name);
    await guestVoice.join(run.channels.voice.name);
    await expect(ownerVoice.participant(run.guest.username)).toBeVisible();

    for (const route of ['/home', '/messages', '/friends', '/games', '/together']) {
      await owner.goto(route);
      await expect(owner.page.getByRole('button', { name: 'Sesten ayrıl' }).first()).toBeVisible();
    }
    await owner.nav.getByRole('button', { name: run.channels.voice.name, exact: true }).click();
    await expect(ownerVoice.participant(run.guest.username)).toBeVisible();
  });

  test('leaving removes the member for everyone else', async ({ owner, guest, run }) => {
    const ownerVoice = new VoiceView(owner);
    const guestVoice = new VoiceView(guest);
    await ownerVoice.join(run.channels.voice.name);
    await guestVoice.join(run.channels.voice.name);
    await expect(ownerVoice.participant(run.guest.username)).toBeVisible();
    await guestVoice.leave();
    await expect(ownerVoice.participant(run.guest.username)).toHaveCount(0, { timeout: 20000 });
  });

  test('screen sharing needs a real macOS capture grant', async () => {
    test.skip(
      true,
      'Screen capture uses desktopCapturer and the macOS Screen Recording permission; synthetic ' +
        'devices cannot stand in for it. Covered by physical acceptance (docs/E2E_TESTING.md).',
    );
  });
});
