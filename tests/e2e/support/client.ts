import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { repoRoot, stack } from './env';
import type { SeededAccount } from './stoat-api';

/**
 * Chromium switches for unattended media: a synthetic microphone/camera (beep + test pattern)
 * and auto-accepted capture prompts. Real hardware and macOS privacy prompts are never used.
 */
const mediaSwitches = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];

/** ROOMS_PROFILE accepts [a-zA-Z0-9-]{1,40}; each client gets its own userData directory. */
const profileName = (label: string) =>
  `e2e-${label.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}-${randomBytes(4).toString('hex')}`;

/** One real ROOMS desktop process (Electron main + renderer) with an isolated profile. */
export class RoomsClient {
  readonly errors: string[] = [];

  private constructor(
    readonly label: string,
    readonly profile: string,
    readonly app: ElectronApplication,
    readonly page: Page,
    readonly userData: string,
  ) {}

  static async launch(label: string, profile = profileName(label)): Promise<RoomsClient> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env))
      if (typeof value === 'string') env[key] = value;
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ROOMS_DEV_URL;
    env.ROOMS_PROFILE = profile;
    const app = await electron.launch({
      args: ['.', ...mediaSwitches],
      cwd: repoRoot,
      env,
      timeout: 60000,
    });
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    const client = new RoomsClient(label, profile, app, page, userData);
    page.on('pageerror', (error) => client.errors.push(error.message));
    await app.context().tracing.start({ screenshots: true, snapshots: true, title: label });
    return client;
  }

  /** Opens a hash route the way in-app navigation does. */
  async goto(route: string) {
    await this.page.evaluate((target) => (location.hash = target), route);
  }

  /** Main navigation sidebar (community rooms, messages, settings). */
  get nav() {
    return this.page.getByRole('complementary', { name: 'Odalar ve gezinme' });
  }

  /** Signs in and passes the first-run profile and device steps, ending in the main shell. */
  async signIn(account: Pick<SeededAccount, 'email' | 'password'>) {
    await this.submitSignIn(account);
    await this.page.getByRole('button', { name: 'Şimdilik atla', exact: true }).click();
    await this.enterCommunity();
  }

  /** Leaves the first-run device step (#/setup/devices) for the community shell. */
  async enterCommunity() {
    await this.page.getByRole('button', { name: 'Topluluğuma gir', exact: true }).click();
    await expect(this.nav).toBeVisible({ timeout: 30000 });
  }

  /** Signs in through the visible onboarding form and stops at the profile step. */
  async submitSignIn(account: Pick<SeededAccount, 'email' | 'password'>) {
    const page = this.page;
    await expect(page.getByRole('heading', { name: 'Giriş', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
    // The server panel starts open unless the build carries VITE_ROOMS_DEFAULT_SERVER.
    const server = page.getByLabel('Sunucu adresi', { exact: true });
    await page.getByLabel('E-posta adresi').waitFor();
    if (!(await server.isVisible()))
      await page.getByText('Sunucu ve davet seçenekleri', { exact: true }).click();
    await server.fill(stack.serverUrl);
    await page.getByLabel('E-posta adresi').fill(account.email);
    await page.getByPlaceholder('Şifren', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible({
      timeout: 30000,
    });
  }

  /** Native session snapshot from Electron main (no credentials are exposed to the page). */
  session() {
    return this.page.evaluate(() => (window as any).rooms.social.session());
  }

  async close(testInfo?: TestInfo, { keepProfile = false } = {}) {
    const failed = testInfo && testInfo.status !== testInfo.expectedStatus;
    try {
      if (failed && testInfo) {
        // Playwright's own error context shows one page; multi-client tests need every window.
        await testInfo.attach(`${this.label} screenshot`, {
          body: await this.page.screenshot(),
          contentType: 'image/png',
        });
        await testInfo.attach(`${this.label} aria snapshot`, {
          body: `${this.page.url()}\n${await this.page.locator('body').ariaSnapshot()}`,
          contentType: 'text/yaml',
        });
        const trace = testInfo.outputPath(`${this.label}-trace.zip`);
        await this.app.context().tracing.stop({ path: trace });
        await testInfo.attach(`${this.label} trace`, {
          path: trace,
          contentType: 'application/zip',
        });
        if (this.errors.length)
          await testInfo.attach(`${this.label} renderer errors`, {
            body: this.errors.join('\n'),
            contentType: 'text/plain',
          });
      } else await this.app.context().tracing.stop();
    } catch {
      // The window may already be gone; closing still matters more than the trace.
    }
    await this.app.close().catch(() => {});
    if (!keepProfile) await rm(this.userData, { recursive: true, force: true });
  }

  /** Quits and reopens the same profile, as a member restarting the app. */
  async restart(testInfo?: TestInfo) {
    await this.close(testInfo, { keepProfile: true });
    return RoomsClient.launch(this.label, this.profile);
  }
}

/** Tracks every client a test opens so each one is closed, traced and cleaned up. */
export class ClientPool {
  private readonly open = new Set<RoomsClient>();
  constructor(private readonly testInfo: TestInfo) {}

  async launch(label: string, profile?: string) {
    const client = await RoomsClient.launch(label, profile);
    this.open.add(client);
    return client;
  }

  async signedIn(label: string, account: Pick<SeededAccount, 'email' | 'password'>) {
    const client = await this.launch(label);
    await client.signIn(account);
    return client;
  }

  async restart(client: RoomsClient) {
    this.open.delete(client);
    const next = await client.restart(this.testInfo);
    this.open.add(next);
    return next;
  }

  async closeAll() {
    await Promise.all([...this.open].map((client) => client.close(this.testInfo)));
    this.open.clear();
  }
}
