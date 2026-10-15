import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';

export type ApnsEnvironment = 'production' | 'sandbox';
export interface ApnsConfig {
  /** Contents of the Apple `.p8` authentication key (PEM). */
  privateKey: string;
  keyId: string;
  teamId: string;
  /** iOS bundle identifier; APNs rejects tokens issued for another topic. */
  topic: string;
}
export interface ApnsAlert {
  title: string;
  body: string;
  threadId: string;
  data: Record<string, string>;
}
export type ApnsResult =
  { ok: true } | { ok: false; status: number; reason: string; unregistered: boolean };

const hosts: Record<ApnsEnvironment, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};
const deviceToken = /^[0-9a-f]{64,200}$/;
export const isDeviceToken = (value: string) => deviceToken.test(value);

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

/** Builds the provider JWT; APNs accepts a token for up to an hour, so callers cache it. */
export function providerToken(key: KeyObject, keyId: string, teamId: string, now = Date.now()) {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${claims}.${base64url(signature)}`;
}

export function alertPayload(alert: ApnsAlert) {
  return JSON.stringify({
    aps: {
      alert: { title: alert.title, body: alert.body },
      sound: 'default',
      'thread-id': alert.threadId,
    },
    ...alert.data,
  });
}

export class ApnsClient {
  private readonly key: KeyObject;
  private token: { value: string; issuedAt: number } | null = null;
  private sessions = new Map<ApnsEnvironment, ClientHttp2Session>();
  constructor(private readonly config: ApnsConfig) {
    if (!/^[A-Z0-9]{10}$/.test(config.keyId) || !/^[A-Z0-9]{10}$/.test(config.teamId))
      throw new Error('APNs key and team identifiers must be 10 characters');
    if (!/^[A-Za-z0-9.-]+$/.test(config.topic)) throw new Error('APNs topic is invalid');
    this.key = createPrivateKey(config.privateKey);
  }
  private bearer(now = Date.now()) {
    // Refresh well before the one-hour limit; Apple rejects refreshes more often than every 20 minutes.
    if (!this.token || now - this.token.issuedAt > 40 * 60_000)
      this.token = {
        value: providerToken(this.key, this.config.keyId, this.config.teamId, now),
        issuedAt: now,
      };
    return this.token.value;
  }
  private session(environment: ApnsEnvironment) {
    const current = this.sessions.get(environment);
    if (current && !current.closed && !current.destroyed) return current;
    const session = connect(hosts[environment]);
    session.on('error', () => this.sessions.delete(environment));
    session.on('close', () => this.sessions.delete(environment));
    session.unref();
    this.sessions.set(environment, session);
    return session;
  }
  send(token: string, alert: ApnsAlert, environment: ApnsEnvironment): Promise<ApnsResult> {
    if (!isDeviceToken(token))
      return Promise.resolve({
        ok: false,
        status: 400,
        reason: 'BadDeviceToken',
        unregistered: true,
      });
    const body = alertPayload(alert);
    return new Promise((resolve, reject) => {
      const request = this.session(environment).request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${this.bearer()}`,
        'apns-topic': this.config.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 86_400),
        'content-type': 'application/json',
      });
      let status = 0;
      let response = '';
      request.setTimeout(15_000, () => request.close());
      request.on('response', (headers) => (status = Number(headers[':status'])));
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        if (response.length < 4096) response += chunk;
      });
      request.on('error', reject);
      request.on('end', () => {
        if (status === 200) return resolve({ ok: true });
        if (!status) return reject(new Error('APNs request ended without a response'));
        let reason = 'Unknown';
        try {
          reason = String((JSON.parse(response) as { reason?: unknown }).reason ?? reason);
        } catch {
          /* Apple always sends JSON for errors; keep the status if it does not. */
        }
        resolve({
          ok: false,
          status,
          reason,
          unregistered: status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered',
        });
      });
      request.end(body);
    });
  }
  close() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}
