import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { VoiceView } from '../support/pages/voice';
import type { RoomsClient } from '../support/client';
import { PERSONAL_SOUND_POLICY } from '../../../packages/shared-contracts/src/personal-sounds';

declare global {
  interface Window {
    __e2eCues?: { volume: number; bytes: number }[];
  }
}

/**
 * Records every cue the renderer actually starts, with the size of the clip behind its blob URL
 * (the app's CSP blocks fetching blob URLs back). Personal clips play at `personalGain`, classic
 * cues at `classicGain` (effects level 100%).
 */
async function tapCues(page: Page) {
  await page.evaluate(() => {
    if (window.__e2eCues) return;
    const cues: { volume: number; bytes: number }[] = [],
      sizes = new Map<string, number>();
    window.__e2eCues = cues;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      if (object instanceof Blob) sizes.set(url, object.size);
      return url;
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const started = play.call(this);
      void started
        .then(() => cues.push({ volume: this.volume, bytes: sizes.get(this.src) ?? -1 }))
        .catch(() => {});
      return started;
    };
  });
}
const personalCues = (page: Page) =>
  page.evaluate(
    (gain) => (window.__e2eCues ?? []).filter((cue) => Math.abs(cue.volume - gain) < 0.001),
    PERSONAL_SOUND_POLICY.personalGain,
  );
/** Size of a preset as the server serves it, read through the member's own bridge. */
const presetBytes = (client: RoomsClient, id: string) =>
  client.page.evaluate(
    async (sound) => atob(await window.rooms!.personalSounds!.preview(sound)).length,
    id,
  );

// Real access service and LiveKit v1.9.12: the chosen sound travels as a server-owned participant
// attribute and is fetched by the listener. Audibility on physical devices is level 4.
test.describe('personal entrance and leave sounds', () => {
  test('others hear the sound a member picked, and a change applies while in the room', async ({
    owner,
    guest,
    run,
  }) => {
    test.setTimeout(180000);
    await owner.goto('/settings?tab=audio');
    const section = owner.page.getByRole('heading', { name: 'Giriş ve çıkış sesin' });
    await expect(section).toBeVisible();
    await owner.page.getByRole('button', { name: 'Giriş sesini değiştir' }).click();
    const picker = owner.page.getByRole('dialog', { name: 'Giriş sesi seç' });
    await picker
      .getByRole('list', { name: 'ROOMS sesleri' })
      .getByRole('button', { name: /^Fanfar \d/ })
      .click();
    await expect(
      picker
        .getByRole('list', { name: 'ROOMS sesleri' })
        .getByRole('button', { name: /^Fanfar \d/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await owner.page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await owner.goto('/home');
    await owner.page.evaluate(() =>
      window.rooms!.personalSounds!.assign({ enter: 'p.fanfar', leave: 'p.kapanis' }),
    );
    const fanfar = await presetBytes(owner, 'p.fanfar'),
      goodbye = await presetBytes(owner, 'p.hoscakal');
    expect(fanfar).not.toBe(goodbye);

    const ownerVoice = new VoiceView(owner);
    const guestVoice = new VoiceView(guest);
    await guestVoice.join(run.channels.voice.name);
    await tapCues(guest.page);
    await ownerVoice.join(run.channels.voice.name);
    const joinedAt = Date.now();
    await expect(guestVoice.participant(run.owner.username)).toBeVisible();
    await expect
      .poll(() => personalCues(guest.page), { timeout: 15000 })
      .toEqual([{ volume: PERSONAL_SOUND_POLICY.personalGain, bytes: fanfar }]);

    // A change while connected reaches the others through a live attribute update.
    await owner.page.evaluate(() =>
      window.rooms!.personalSounds!.assign({ enter: 'p.fanfar', leave: 'p.hoscakal' }),
    );
    // Leaving within the short-stay window would play the classic cue instead.
    const stay = PERSONAL_SOUND_POLICY.shortStayClassicMs + 2000 - (Date.now() - joinedAt);
    if (stay > 0) await owner.page.waitForTimeout(stay);
    await ownerVoice.leave();
    await expect(guestVoice.participant(run.owner.username)).toHaveCount(0, { timeout: 20000 });
    await expect
      .poll(async () => (await personalCues(guest.page)).map((cue) => cue.bytes), {
        timeout: 15000,
      })
      .toEqual([fanfar, goodbye]);
  });

  test('a listener who turned personal sounds off hears the classic cue', async ({
    owner,
    guest,
    run,
  }) => {
    await owner.page.evaluate(() =>
      window.rooms!.personalSounds!.assign({ enter: 'p.arcade', leave: null }),
    );
    await guest.goto('/settings?tab=audio');
    await guest.page.getByRole('switch', { name: 'Kişisel giriş sesleri' }).click();
    const unsaved = guest.page.getByRole('region', { name: 'Kaydedilmemiş ayarlar' });
    if (await unsaved.isVisible())
      await unsaved.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(guest.page.getByRole('switch', { name: 'Kişisel giriş sesleri' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await guest.goto('/home');

    const ownerVoice = new VoiceView(owner);
    const guestVoice = new VoiceView(guest);
    await guestVoice.join(run.channels.voice.name);
    await tapCues(guest.page);
    await ownerVoice.join(run.channels.voice.name);
    await expect(guestVoice.participant(run.owner.username)).toBeVisible();
    await expect
      .poll(
        () =>
          guest.page.evaluate(
            (gain) => (window.__e2eCues ?? []).some((cue) => Math.abs(cue.volume - gain) < 0.001),
            PERSONAL_SOUND_POLICY.classicGain,
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    expect(await personalCues(guest.page)).toEqual([]);
  });
});
