import { test, expect } from '../support/fixtures';
import { StoatApi } from '../support/stoat-api';
import { stack } from '../support/env';
import { joinSpace, provisionAccount } from '../support/seed';

test.describe('sign-in, first-run setup and sessions', () => {
  test('first sign-in saves the profile and reaches the community', async ({ clients, run }) => {
    const member = await provisionAccount(run.runId, 'profile');
    await joinSpace(member, run.space.inviteCode);
    const client = await clients.launch('profile');
    await client.submitSignIn(member);

    const displayName = `Profil ${run.runId}`;
    await client.page.getByRole('textbox', { name: 'Görünen ad' }).fill(displayName);
    await client.page.getByRole('textbox', { name: 'Durum' }).fill('E2E durumu');
    await client.page.getByRole('button', { name: 'Devam et', exact: true }).click();
    await expect(client.page.getByRole('heading', { name: 'Cihazlar' })).toBeVisible();
    await client.enterCommunity();
    await expect(
      client.nav.getByRole('button', { name: run.channels.text.name, exact: true }),
    ).toBeVisible();

    // The change reached the upstream account, not only local state.
    await expect
      .poll(async () => {
        const me = await new StoatApi(member.token).request<{ display_name?: string }>(
          '/users/@me',
        );
        return me.display_name;
      })
      .toBe(displayName);
  });

  test('a wrong password is rejected without signing in', async ({ clients, run }) => {
    const client = await clients.launch('wrongpassword');
    const page = client.page;
    await page.getByRole('tab', { name: 'Giriş yap', exact: true }).click();
    const server = page.getByLabel('Sunucu adresi', { exact: true });
    await page.getByLabel('E-posta adresi').waitFor();
    if (!(await server.isVisible())) await page.locator('details.ref-auth-server summary').click();
    await server.fill(stack.serverUrl);
    await page.getByLabel('E-posta adresi').fill(run.owner.email);
    await page.getByPlaceholder('Şifren', { exact: true }).fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toHaveCount(0);
    expect((await client.session()).user ?? null).toBeNull();
  });

  test('the session is restored after restarting the app', async ({ clients, owner }) => {
    const reopened = await clients.restart(owner);
    await expect(reopened.nav).toBeVisible({ timeout: 30000 });
    await expect(reopened.page.getByRole('tablist', { name: 'Başlangıç' })).toHaveCount(0);
  });

  test('signing out forgets the session across restarts', async ({ clients, guest }) => {
    await guest.goto('/settings?tab=profile');
    await guest.page.getByRole('button', { name: 'Oturumu kapat', exact: true }).click();
    const confirm = guest.page.getByRole('dialog');
    await confirm.getByRole('button', { name: 'Çıkış yap', exact: true }).click();
    await expect(guest.page.getByRole('tablist', { name: 'Başlangıç' })).toBeVisible({
      timeout: 30000,
    });

    const reopened = await clients.restart(guest);
    await expect(reopened.page.getByRole('tablist', { name: 'Başlangıç' })).toBeVisible({
      timeout: 30000,
    });
  });
});
