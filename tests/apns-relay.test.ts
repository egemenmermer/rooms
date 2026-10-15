import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ApnsClient, alertPayload, providerToken } from '../apps/services/apns/apns';
import { ApnsRelay, messageAlert } from '../apps/services/apns/relay';

const token = 'ab'.repeat(32);
const message = (channel: Record<string, unknown>, body = '<@01U> bak: <@01U>') => ({
  notification: {
    type: 'MessageNotification',
    data: {
      author: 'sems',
      icon: 'https://example.invalid/avatar',
      body,
      tag: '01CHANNEL',
      timestamp: 1,
      url: 'https://example.invalid/channel',
      message: {
        _id: '01MESSAGE',
        channel: '01CHANNEL',
        author: '01AUTHOR',
        content: 'hidden raw',
      },
      channel,
    },
  },
  user_id: '01USER',
  session_id: '01SESSION',
  token: token.toUpperCase(),
  extras: {},
});

describe('APNs provider token', () => {
  it('signs an ES256 JWT that verifies with the matching public key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwt = providerToken(privateKey, 'ABCDEFGHIJ', 'U95637XJ6C', 1_700_000_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'ABCDEFGHIJ',
    });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iss: 'U95637XJ6C',
      iat: 1_700_000_000,
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('rejects malformed device tokens before contacting Apple', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const client = new ApnsClient({
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      keyId: 'ABCDEFGHIJ',
      teamId: 'U95637XJ6C',
      topic: 'com.egemenmermer.rooms.mobile',
    });
    await expect(
      client.send('../3/device', { title: 't', body: 'b', threadId: 'c', data: {} }, 'sandbox'),
    ).resolves.toMatchObject({
      ok: false,
      unregistered: true,
    });
    client.close();
  });
});

describe('message alerts', () => {
  it('titles community messages with the channel and keeps only routing identifiers', () => {
    const result = messageAlert(
      message({ channel_type: 'TextChannel', name: 'bugs & features', server: '01S' }, '@sems bak'),
    );
    expect(result).toEqual({
      token,
      alert: {
        title: 'sems · #bugs & features',
        body: '@sems bak',
        threadId: '01CHANNEL',
        data: { channelId: '01CHANNEL', messageId: '01MESSAGE' },
      },
    });
    expect(alertPayload(result!.alert)).not.toContain('hidden raw');
  });

  it('uses the author alone for direct messages and describes attachment-only messages', () => {
    const result = messageAlert(message({ channel_type: 'DirectMessage', recipients: [] }, '  '));
    expect(result?.alert.title).toBe('sems');
    expect(result?.alert.body).toBe('Ek gönderdi');
  });

  it('skips payload kinds that are not message notifications', () => {
    expect(
      messageAlert({
        ...message({ channel_type: 'DirectMessage' }),
        notification: { type: 'BadgeUpdate', data: 3 },
      }),
    ).toBeNull();
  });
});

describe('relay environment selection', () => {
  it('retries a production BadDeviceToken on sandbox once and remembers the result', async () => {
    const calls: string[] = [];
    const relay = new ApnsRelay({
      send: async (_token, _alert, environment) => {
        calls.push(environment);
        return environment === 'sandbox'
          ? { ok: true }
          : { ok: false, status: 400, reason: 'BadDeviceToken', unregistered: true };
      },
    });
    const payload = message({ channel_type: 'DirectMessage' }, 'selam');
    await expect(relay.handle(payload)).resolves.toEqual({ ok: true });
    await relay.handle(payload);
    expect(calls).toEqual(['production', 'sandbox', 'sandbox']);
    expect(relay.stats).toEqual({ delivered: 2, rejected: 0, skipped: 0 });
  });

  it('does not fall back to sandbox when the environment is fixed', async () => {
    const calls: string[] = [];
    const relay = new ApnsRelay(
      {
        send: async (_token, _alert, environment) => {
          calls.push(environment);
          return { ok: false, status: 400, reason: 'BadDeviceToken', unregistered: true };
        },
      },
      'production',
    );
    await relay.handle(message({ channel_type: 'DirectMessage' }, 'selam'));
    expect(calls).toEqual(['production']);
    expect(relay.stats.rejected).toBe(1);
  });
});
