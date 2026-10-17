import { test, expect } from '../support/fixtures';
import { stack } from '../support/env';

const grant = (token: string, channelId: string) =>
  fetch(`${stack.accessUrl}/v1/media/grant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: token },
    body: JSON.stringify({ channelId }),
  });

const activity = (token: string, roomId: string) =>
  fetch(`${stack.activitiesUrl}/v1/rooms/${roomId}/activity`, {
    headers: { authorization: `Bearer ${token}` },
  });

test.describe('membership boundaries', () => {
  test('an outsider sees no community rooms in the client', async ({ clients, run }) => {
    const outsider = await clients.signedIn('outsider', run.outsider);
    await expect(
      outsider.nav.getByRole('button', { name: run.channels.text.name, exact: true }),
    ).toHaveCount(0);
    const spaces = await outsider.page.evaluate(() => (window as any).rooms.social.spaces());
    expect(spaces.map((space: { id: string }) => space.id)).not.toContain(run.space.id);
  });

  test('media and activity services refuse non-members', async ({ run }) => {
    expect((await grant(run.outsider.token, run.channels.voice.id)).status).toBeGreaterThanOrEqual(
      400,
    );
    expect((await activity(run.outsider.token, run.channels.voice.id)).status).toBe(403);
    expect((await grant('not-a-session', run.channels.voice.id)).status).toBeGreaterThanOrEqual(
      400,
    );
  });

  test('members receive short-lived media grants for voice rooms only', async ({ run }) => {
    const voice = await grant(run.guest.token, run.channels.voice.id);
    expect(voice.status).toBe(200);
    const body = await voice.json();
    expect(body.serverUrl).toBe('ws://127.0.0.1:7880');
    expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000 + 5000);
    expect((await grant(run.guest.token, run.channels.text.id)).status).toBeGreaterThanOrEqual(400);
  });

  test('a native renderer cannot reach Node or forge IPC', async ({ clients }) => {
    const client = await clients.launch('isolation');
    expect(await client.page.evaluate(() => typeof (window as any).require)).toBe('undefined');
    await expect(
      client.page.evaluate(() => (window as any).rooms.windowAction('invalid')),
    ).rejects.toThrow();
  });
});
