import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { stack } from '../support/env';
import { inviteDigest } from '../../../apps/services/access/registration';
import { issueSignupTicket, newcomerCredentials } from '../support/seed';

async function fillRegistration(
  page: Page,
  input: { code: string; username: string; email: string; password: string },
) {
  await expect(page.getByRole('heading', { name: 'Giriş', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await page.getByRole('button', { name: 'Davetle hesap oluştur', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hesap oluştur', exact: true })).toBeVisible();
  await page.getByLabel('Topluluk davet kodu', { exact: true }).fill(input.code);
  await page.getByLabel('Kullanıcı adı', { exact: true }).fill(input.username);
  await page.getByLabel('E-posta adresi').fill(input.email);
  await page.getByPlaceholder('En az 8 karakter').fill(input.password);
  const server = page.getByLabel('Sunucu adresi', { exact: true });
  if (!(await server.isVisible()))
    await page.getByText('Sunucu ve davet seçenekleri', { exact: true }).click();
  await server.fill(stack.serverUrl);
  await page.getByRole('button', { name: 'Hesap oluştur ve katıl' }).click();
}

const ledgerState = async (code: string) => {
  const ledger = JSON.parse(await readFile(stack.registrationLedger, 'utf8'));
  return ledger.invites[inviteDigest(code)]?.state as string | undefined;
};

test.describe('invite-only registration through the access broker', () => {
  test('a signup ticket creates an account that lands in the community', async ({
    clients,
    run,
  }) => {
    const ticket = await issueSignupTicket(run.space.inviteCode);
    const newcomer = newcomerCredentials(run.runId);
    const client = await clients.launch('newcomer');
    await fillRegistration(client.page, { code: ticket.code, ...newcomer });

    await expect(client.page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await client.page.getByRole('button', { name: 'Şimdilik atla', exact: true }).click();
    await client.enterCommunity();
    await expect(
      client.nav.getByRole('button', { name: run.channels.text.name, exact: true }),
    ).toBeVisible();
    expect(await ledgerState(ticket.code)).toBe('used');
  });

  test('a used ticket cannot create a second account', async ({ clients, run }) => {
    const ticket = await issueSignupTicket(run.space.inviteCode);
    const first = await clients.launch('firstclaim');
    await fillRegistration(first.page, { code: ticket.code, ...newcomerCredentials(run.runId) });
    await expect(first.page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible({
      timeout: 30000,
    });

    const second = await clients.launch('secondclaim');
    await fillRegistration(second.page, { code: ticket.code, ...newcomerCredentials(run.runId) });
    await expect(second.page.getByRole('alert').first()).toBeVisible();
    await expect(second.page.getByRole('heading', { name: 'Profil', exact: true })).toHaveCount(0);
    expect(await ledgerState(ticket.code)).toBe('used');
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
