import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { stack } from '../support/env';
import {
  RegistrationGate,
  inviteDigest,
  inviteId,
} from '../../../apps/services/access/registration';
import { issueSignupTicket, newcomerCredentials } from '../support/seed';

async function fillRegistration(
  page: Page,
  input: { link: string; username: string; email: string; password: string },
) {
  // First launch opens the start tabs on Kayıt ol.
  await page.getByRole('tab', { name: 'Kayıt ol', exact: true }).click({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Hesap oluştur', exact: true })).toBeVisible();
  await expect(page.getByLabel('Sunucu adresi', { exact: true })).toHaveCount(0);
  await page.getByLabel('Davet bağlantısı', { exact: true }).fill(input.link);
  await page.getByLabel('Kullanıcı adı', { exact: true }).fill(input.username);
  await page.getByLabel('E-posta adresi').fill(input.email);
  await page.getByPlaceholder('En az 8 karakter').fill(input.password);
  await page.getByRole('button', { name: 'Hesap oluştur ve katıl' }).click();
}

const ledgerText = () => readFile(stack.registrationLedger, 'utf8');
const usedClaims = async (code: string) => {
  const ledger = JSON.parse(await ledgerText());
  const claims = ledger.invites[inviteDigest(code)]?.claims ?? {};
  return Object.values(claims as Record<string, { state: string }>).filter(
    (claim) => claim.state === 'used',
  ).length;
};
const profile = (page: Page) => page.getByRole('heading', { name: 'Profil', exact: true });

test.describe('invitation-link registration through the access broker', () => {
  test('one link signs up several friends who land in the community', async ({ clients, run }) => {
    const ticket = await issueSignupTicket(run.space.inviteCode);
    const first = await clients.launch('newcomer');
    await fillRegistration(first.page, { link: ticket.link, ...newcomerCredentials(run.runId) });
    await expect(profile(first.page)).toBeVisible({ timeout: 30000 });
    await first.page.getByRole('button', { name: 'Şimdilik atla', exact: true }).click();
    await first.enterCommunity();
    await expect(
      first.nav.getByRole('button', { name: run.channels.text.name, exact: true }),
    ).toBeVisible();

    const second = await clients.launch('secondfriend');
    await fillRegistration(second.page, { link: ticket.link, ...newcomerCredentials(run.runId) });
    await expect(profile(second.page)).toBeVisible({ timeout: 30000 });
    expect(await usedClaims(ticket.code)).toBe(2);
  });

  test('a full link refuses the next person', async ({ clients, run }) => {
    const ticket = await issueSignupTicket(run.space.inviteCode, { maxUses: 1 });
    const first = await clients.launch('firstclaim');
    await fillRegistration(first.page, { link: ticket.link, ...newcomerCredentials(run.runId) });
    await expect(profile(first.page)).toBeVisible({ timeout: 30000 });

    const second = await clients.launch('secondclaim');
    await fillRegistration(second.page, { link: ticket.link, ...newcomerCredentials(run.runId) });
    await expect(second.page.getByRole('alert').first()).toBeVisible();
    await expect(profile(second.page)).toHaveCount(0);
    expect(await usedClaims(ticket.code)).toBe(1);
  });

  test('a cancelled link refuses signup', async ({ clients, run }) => {
    const ticket = await issueSignupTicket(run.space.inviteCode, { spaceId: run.space.id });
    await new RegistrationGate(stack.registrationLedger).revoke(
      run.space.id,
      inviteId(inviteDigest(ticket.code)),
    );
    const client = await clients.launch('cancelled');
    await fillRegistration(client.page, { link: ticket.link, ...newcomerCredentials(run.runId) });
    await expect(client.page.getByRole('alert').first()).toBeVisible();
    await expect(profile(client.page)).toHaveCount(0);
  });

  test('an app opened from the link hides the link field', async ({ clients, run }) => {
    const ticket = await issueSignupTicket(run.space.inviteCode);
    const client = await clients.launch('deeplink');
    const params = new URLSearchParams({ server: stack.serverUrl, invite: ticket.code });
    await client.page.evaluate(
      (search) => (location.hash = `/setup/register?${search}`),
      `${params}`,
    );
    await expect(client.page.getByRole('heading', { name: run.space.name })).toBeVisible({
      timeout: 30000,
    });
    await expect(client.page.getByLabel('Davet bağlantısı', { exact: true })).toHaveCount(0);
  });

  test('the landing page is served without spending the link', async ({ run }) => {
    const ticket = await issueSignupTicket(run.space.inviteCode);
    const before = await ledgerText();
    for (let i = 0; i < 5; i++) {
      const response = await fetch(ticket.link);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toContain('rooms://invite?');
    }
    expect(await ledgerText()).toBe(before);
  });

  test('the public proxy refuses direct upstream account creation', async () => {
    const response = await fetch(`${stack.serverUrl}/api/auth/account/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'direct@e2e.rooms.test', password: 'Direct-create-1' }),
    });
    expect(response.status).toBe(403);
  });
});
