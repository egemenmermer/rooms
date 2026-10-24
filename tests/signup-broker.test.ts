import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialSignupPoll } from '@rooms/social';
import {
  PendingSignupBroker,
  SIGNUP_NOT_FOUND_LIMIT,
  type SecretStorage,
} from '../apps/desktop/electron/signup-broker';

const id = 'a'.repeat(32);
const secret = 'S'.repeat(43);
const code = 'f'.repeat(64);
const password = 'correct horse battery';
let directory: string;
let poll: SocialSignupPoll;
const client = {
  requestSignup: vi.fn(async () => ({ requestId: id, pollSecret: secret })),
  signupStatus: vi.fn(async () => poll),
  cancelSignup: vi.fn(async () => {}),
};
// A visible "encryption" so the test can read what reached the disk.
const storage = (available = true): SecretStorage => ({
  isEncryptionAvailable: () => available,
  encryptString: (value) => Buffer.from(`enc:${value}`),
  decryptString: (value) => value.toString().replace(/^enc:/, ''),
});
const broker = (available = true) =>
  new PendingSignupBroker({
    path: join(directory, 'signup.bin'),
    storage: storage(available),
    client: () => client,
  });
const form = {
  serverUrl: 'https://friends.example',
  email: 'friend@example.com',
  password,
  username: 'friend',
};
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'rooms-signup-broker-'));
  poll = { status: 'pending', inviteCode: null, createdAt: null, expiresAt: null };
  vi.clearAllMocks();
  // Tests below override these per case; start each one from the plain behaviour.
  client.signupStatus.mockReset().mockImplementation(async () => poll);
  client.requestSignup
    .mockReset()
    .mockImplementation(async () => ({ requestId: id, pollSecret: secret }));
  client.cancelSignup.mockReset().mockImplementation(async () => {});
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('pending sign-up in the main process', () => {
  it('sends no password with the request and never writes it to disk', async () => {
    const signups = broker();
    expect(await signups.request(form)).toMatchObject({
      status: 'pending',
      ready: false,
      passwordKnown: true,
    });
    expect(client.requestSignup).toHaveBeenCalledWith({ email: form.email, username: 'friend' });
    expect(await signups.check()).toMatchObject({ registration: null });
    poll = { status: 'approved', inviteCode: code, createdAt: null, expiresAt: null };
    const approved = await signups.check();
    expect(approved.registration).toEqual({ ...form, inviteCode: code });
    const onDisk = await readFile(join(directory, 'signup.bin'), 'utf8');
    expect(onDisk).toContain(secret);
    expect(onDisk).toContain(code);
    expect(onDisk).not.toContain(password);
  });

  it('asks for the password again after a restart and keeps the fetched code', async () => {
    await broker().request(form);
    poll = { status: 'approved', inviteCode: code, createdAt: null, expiresAt: null };
    // The service hands the code out once; the new process must not need it again.
    await broker().check();
    const restarted = broker();
    expect(restarted.snapshot()).toMatchObject({ ready: true, passwordKnown: false });
    expect((await restarted.check()).registration).toBeNull();
    expect(client.signupStatus).toHaveBeenCalledTimes(1);
    expect(restarted.registration({ password })).toEqual({ ...form, inviteCode: code });
    restarted.completed();
    expect(existsSync(join(directory, 'signup.bin'))).toBe(false);
    expect(broker().snapshot()).toBeNull();
  });

  it('reports a rejection without any registration', async () => {
    const signups = broker();
    await signups.request(form);
    poll = { status: 'rejected', inviteCode: null, createdAt: null, expiresAt: null };
    expect(await signups.check()).toMatchObject({
      pending: { status: 'rejected', ready: false },
      registration: null,
    });
  });

  it('withdraws on the server and forgets locally', async () => {
    const signups = broker();
    await signups.request(form);
    await signups.cancel();
    expect(client.cancelSignup).toHaveBeenCalledWith(id, secret);
    expect(signups.snapshot()).toBeNull();
    expect(existsSync(join(directory, 'signup.bin'))).toBe(false);
  });

  it('keeps the request in memory only without a keychain', async () => {
    const signups = broker(false);
    await signups.request(form);
    expect(existsSync(join(directory, 'signup.bin'))).toBe(false);
    expect(signups.snapshot()).toMatchObject({ status: 'pending' });
  });
});

const unknownRequest = () => Object.assign(new Error('SIGNUP_NOT_FOUND'), { status: 404 });

describe('A4-01: a request that is not stored says so', () => {
  it('reports persisted state: stored with a keychain, not without or after a failed write', async () => {
    expect((await broker().request(form)).persisted).toBe(true);
    expect((await broker(false).request(form)).persisted).toBe(false);
    const failing = new PendingSignupBroker({
      path: join(directory, 'missing-folder', 'signup.bin'),
      storage: storage(),
      client: () => client,
    });
    expect((await failing.request(form)).persisted).toBe(false);
    expect(failing.snapshot()).toMatchObject({ status: 'pending', persisted: false });
  });

  it('flags a code that could not be written, and recovers it after a restart from a service that repeats it', async () => {
    // The first write (the bare request) works; the write that would hold the code fails.
    const flaky: SecretStorage = {
      ...storage(),
      encryptString: (value) => {
        if (value.includes(code)) throw new Error('disk full');
        return Buffer.from(`enc:${value}`);
      },
    };
    const first = new PendingSignupBroker({
      path: join(directory, 'signup.bin'),
      storage: flaky,
      client: () => client,
    });
    await first.request(form);
    poll = { status: 'approved', inviteCode: code, createdAt: null, expiresAt: null };
    expect((await first.check()).pending).toMatchObject({ ready: true, persisted: false });
    // New services keep answering "approved" with the same code until the link is used.
    const restarted = broker();
    expect(restarted.snapshot()).toMatchObject({ ready: false, persisted: true });
    expect((await restarted.check()).pending).toMatchObject({ status: 'approved', ready: true });
    expect(restarted.registration({ password })).toEqual({ ...form, inviteCode: code });
  });

  it('does not poll again once the code is held, so "issued" after use never turns into a failure', async () => {
    const signups = broker();
    await signups.request(form);
    poll = { status: 'approved', inviteCode: code, createdAt: null, expiresAt: null };
    await signups.check();
    expect(client.signupStatus).toHaveBeenCalledTimes(1);
    // After the registration the service answers "issued" with no code; the held request is
    // not asked again and keeps its approved state until completed() forgets it.
    poll = { status: 'issued', inviteCode: null, createdAt: null, expiresAt: null };
    expect(await signups.check()).toMatchObject({
      pending: { status: 'approved', ready: true },
      registration: { inviteCode: code },
    });
    expect(client.signupStatus).toHaveBeenCalledTimes(1);
    signups.completed();
    expect(await signups.check()).toEqual({ pending: null, registration: null });
    expect(client.signupStatus).toHaveBeenCalledTimes(1);
  });

  it('still reports an old service that forgot the code as unusable', async () => {
    const signups = broker();
    await signups.request(form);
    poll = { status: 'issued', inviteCode: null, createdAt: null, expiresAt: null };
    expect(await signups.check()).toMatchObject({
      pending: { status: 'issued', ready: false },
      registration: null,
    });
  });
});

describe('A4-06: a request the service forgot ends instead of waiting for ever', () => {
  it(`closes after ${SIGNUP_NOT_FOUND_LIMIT} unknown answers in a row and stops asking`, async () => {
    const signups = broker();
    await signups.request(form);
    client.signupStatus.mockRejectedValue(unknownRequest());
    for (let i = 1; i < SIGNUP_NOT_FOUND_LIMIT; i++)
      expect((await signups.check()).pending).toMatchObject({ status: 'unknown' });
    const last = await signups.check();
    expect(last.pending).toMatchObject({ status: 'closed', ready: false, error: null });
    expect(last.registration).toBeNull();
    const calls = client.signupStatus.mock.calls.length;
    expect((await signups.check()).pending?.status).toBe('closed');
    expect(client.signupStatus).toHaveBeenCalledTimes(calls);
    // "Yeni istek gönder" forgets it and a fresh request starts waiting again.
    await signups.cancel();
    expect(signups.snapshot()).toBeNull();
    expect((await signups.request(form)).status).toBe('pending');
  });

  it('counts only consecutive answers: a success or a new request starts over', async () => {
    const signups = broker();
    await signups.request(form);
    for (let i = 1; i < SIGNUP_NOT_FOUND_LIMIT; i++) {
      client.signupStatus.mockRejectedValueOnce(unknownRequest());
      await signups.check();
    }
    poll = { status: 'pending', inviteCode: null, createdAt: null, expiresAt: null };
    expect((await signups.check()).pending?.status).toBe('pending');
    for (let i = 1; i < SIGNUP_NOT_FOUND_LIMIT; i++) {
      client.signupStatus.mockRejectedValueOnce(unknownRequest());
      expect((await signups.check()).pending?.status).toBe('unknown');
    }
  });

  it('does not close a request on network errors', async () => {
    const signups = broker();
    await signups.request(form);
    client.signupStatus.mockRejectedValue(
      Object.assign(new Error('NETWORK_UNAVAILABLE'), { status: 503 }),
    );
    for (let i = 0; i < SIGNUP_NOT_FOUND_LIMIT + 2; i++) await signups.check();
    expect(signups.snapshot()).toMatchObject({ status: 'pending', error: 'NETWORK_UNAVAILABLE' });
  });
});

describe('A4-07: a newer request withdraws the one this device followed', () => {
  const other = { requestId: 'b'.repeat(32), pollSecret: 'T'.repeat(43) };
  it('cancels the previous request on the server and follows the new one', async () => {
    const signups = broker();
    await signups.request(form);
    client.requestSignup.mockResolvedValueOnce(other);
    const next = await signups.request({ ...form, email: 'other@example.com', username: 'other' });
    expect(client.cancelSignup).toHaveBeenCalledWith(id, secret);
    expect(next).toMatchObject({ email: 'other@example.com', status: 'pending' });
    await signups.cancel();
    expect(client.cancelSignup).toHaveBeenLastCalledWith(other.requestId, other.pollSecret);
  });

  it('frees the address first when the service refuses a second request for it', async () => {
    const signups = broker();
    await signups.request(form);
    const order: string[] = [];
    client.requestSignup.mockImplementationOnce(async () => {
      order.push('request-refused');
      throw Object.assign(new Error('SIGNUP_ALREADY_REQUESTED'), { status: 409 });
    });
    client.cancelSignup.mockImplementationOnce(async () => {
      order.push('cancel-old');
    });
    client.requestSignup.mockImplementationOnce(async () => {
      order.push('request-again');
      return other;
    });
    await signups.request({ ...form, email: 'FRIEND@example.com' });
    expect(order).toEqual(['request-refused', 'cancel-old', 'request-again']);
    expect(client.cancelSignup).toHaveBeenCalledTimes(1);
    expect(client.cancelSignup).toHaveBeenCalledWith(id, secret);
  });

  it('keeps the previous request when the new one fails for another reason', async () => {
    const signups = broker();
    await signups.request(form);
    client.requestSignup.mockRejectedValueOnce(
      Object.assign(new Error('SIGNUP_BUSY'), { status: 429 }),
    );
    await expect(signups.request({ ...form, email: 'other@example.com' })).rejects.toThrow(
      'SIGNUP_BUSY',
    );
    expect(client.cancelSignup).not.toHaveBeenCalled();
    expect(signups.snapshot()).toMatchObject({ email: form.email });
  });

  it('does not fail the new request when the old one cannot be withdrawn', async () => {
    const signups = broker();
    await signups.request(form);
    client.requestSignup.mockResolvedValueOnce(other);
    client.cancelSignup.mockRejectedValueOnce(new Error('offline'));
    expect(await signups.request({ ...form, email: 'other@example.com' })).toMatchObject({
      status: 'pending',
      email: 'other@example.com',
    });
  });
});
