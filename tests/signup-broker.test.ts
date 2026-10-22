import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialSignupPoll } from '@rooms/social';
import { PendingSignupBroker, type SecretStorage } from '../apps/desktop/electron/signup-broker';

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
