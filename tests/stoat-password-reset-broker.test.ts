import { describe, expect, it, vi } from 'vitest';
import { StoatError } from '../packages/stoat-adapter/src/index';
import { PasswordRecoveryBroker } from '../apps/desktop/electron/password-recovery';
const token = 'a'.repeat(32), secret = 'new-secret-password';
function setup(text = `https://social.example/login/reset/${token}`) {
  let epoch = 1, now = 1000;
  const readClipboard = vi.fn(() => text), confirmPasswordRecovery = vi.fn().mockResolvedValue({ completed: true });
  const createClient = vi.fn(() => ({ confirmPasswordRecovery }));
  const broker = new PasswordRecoveryBroker({ readClipboard, createClient, sessionEpoch: () => epoch, now: () => now });
  return { broker, readClipboard, confirmPasswordRecovery, createClient, changeEpoch: () => ++epoch, expire: () => now += 180_001 };
}
const input = { serverUrl: 'https://social.example/api' };
describe('S04 main-only password-reset capability (local mock; no remote mutations)', () => {
  it('exposes only an opaque handle, origin and local expiry and confirms against selected API with session removal', async () => {
    const f = setup(), selection = await f.broker.importLink(input, 7);
    expect(selection).toEqual({ handle: expect.any(String), expiresAt: 181000, serverOrigin: 'https://social.example' });
    expect(JSON.stringify(selection)).not.toContain(token);
    await expect(f.broker.confirm({ ...input, handle: selection.handle, password: secret }, 7)).resolves.toEqual({ state: 'completed' });
    expect(f.createClient).toHaveBeenCalledWith(input.serverUrl);
    expect(f.confirmPasswordRecovery).toHaveBeenCalledWith({ token, password: secret, removeSessions: true });
    await expect(f.broker.confirm({ ...input, handle: selection.handle, password: secret }, 7)).resolves.toEqual({ state: 'selection-expired' });
    expect(f.confirmPasswordRecovery).toHaveBeenCalledTimes(1);
  });
  it.each([
    `https://attacker.example/login/reset/${token}`, `http://social.example/login/reset/${token}`,
    `https://social.example/login/reset/${token}?x=1`, `https://social.example/login/reset/${token}#x`,
    `https://name@social.example/login/reset/${token}`, `https://social.example/other/../login/reset/${token}`,
    `https://social.example/login/reset/%61${token.slice(1)}`, `https://social.example/login/reset/${token}/`,
    ` https://social.example/login/reset/${token}`, `https://social.example/login/reset/${token}\n`,
    `https://social.example/login/reset/${'a'.repeat(31)}`, 'a'.repeat(4097),
  ])('rejects URL variations without requesting any client', async text => {
    const f = setup(text); await expect(f.broker.importLink(input, 7)).rejects.toThrow(); expect(f.createClient).not.toHaveBeenCalled();
  });
  it('requires HTTPS selected origin, rejects extra fields before reading clipboard', async () => {
    const f = setup(); await expect(f.broker.importLink({ serverUrl: 'http://localhost' }, 7)).rejects.toThrow();
    await expect(f.broker.importLink({ ...input, token }, 7)).rejects.toThrow(); expect(f.readClipboard).not.toHaveBeenCalled();
  });
  it('binds handle to sender, selected server and session epoch without a network call', async () => {
    const f = setup(), s = await f.broker.importLink(input, 7);
    await expect(f.broker.confirm({ ...input, handle: s.handle, password: secret }, 8)).resolves.toEqual({ state: 'scope-changed' });
    await expect(f.broker.confirm({ serverUrl: 'https://other.example', handle: s.handle, password: secret }, 7)).resolves.toEqual({ state: 'scope-changed' });
    f.changeEpoch(); await expect(f.broker.confirm({ ...input, handle: s.handle, password: secret }, 7)).resolves.toEqual({ state: 'scope-changed' });
    expect(f.confirmPasswordRecovery).not.toHaveBeenCalled();
  });
  it('rejects expired, cancelled or replaced capabilities', async () => {
    const f = setup(), first = await f.broker.importLink(input, 7), second = await f.broker.importLink(input, 7);
    await expect(f.broker.confirm({ ...input, handle: first.handle, password: secret }, 7)).resolves.toEqual({ state: 'selection-expired' });
    f.broker.cancel({ handle: second.handle }, 8); f.expire();
    await expect(f.broker.confirm({ ...input, handle: second.handle, password: secret }, 7)).resolves.toEqual({ state: 'selection-expired' });
    const third = await f.broker.importLink(input, 7); f.broker.cancel({ handle: third.handle }, 7);
    await expect(f.broker.confirm({ ...input, handle: third.handle, password: secret }, 7)).resolves.toEqual({ state: 'selection-expired' });
    expect(f.confirmPasswordRecovery).not.toHaveBeenCalled();
  });
  it.each([
    [new StoatError(401, 'PASSWORD_RECOVERY_INVALID_TOKEN'), 'invalid-token'],
    [new StoatError(400, 'PASSWORD_RECOVERY_CONFIRMATION_FAILED'), 'rejected'],
    [new StoatError(503, 'PASSWORD_RECOVERY_NETWORK_UNAVAILABLE'), 'uncertain'],
    [new StoatError(500, 'PASSWORD_RECOVERY_CONFIRMATION_FAILED'), 'uncertain'],
    [new Error(`${token} ${secret}`), 'uncertain'],
  ])('returns sanitized %s outcome and consumes failed selections once', async (error, state) => {
    const f = setup(), s = await f.broker.importLink(input, 7); f.confirmPasswordRecovery.mockRejectedValueOnce(error);
    await expect(f.broker.confirm({ ...input, handle: s.handle, password: secret }, 7)).resolves.toEqual({ state });
    await expect(f.broker.confirm({ ...input, handle: s.handle, password: secret }, 7)).resolves.toEqual({ state: 'selection-expired' });
    expect(f.confirmPasswordRecovery).toHaveBeenCalledTimes(1);
  });
  it('fences a pending receipt and blocks duplicate submissions/imports', async () => {
    const f = setup(); let finish: (value: { completed: true }) => void = () => {};
    f.confirmPasswordRecovery.mockReturnValue(new Promise(done => { finish = done; }));
    const s = await f.broker.importLink(input, 7), next = await f.broker.importLink(input, 8);
    const pending = f.broker.confirm({ ...input, handle: s.handle, password: secret }, 7);
    await expect(f.broker.confirm({ ...input, handle: next.handle, password: secret }, 8)).rejects.toThrow('pending');
    await expect(f.broker.importLink(input, 8)).rejects.toThrow('pending'); f.changeEpoch(); finish({ completed: true });
    await expect(pending).resolves.toEqual({ state: 'scope-changed' }); expect(f.confirmPasswordRecovery).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed confirm fields without consuming a valid handle', async () => {
    const f = setup(), s = await f.broker.importLink(input, 7);
    await expect(f.broker.confirm({ ...input, handle: s.handle, password: 'short' }, 7)).rejects.toThrow();
    await expect(f.broker.confirm({ ...input, handle: s.handle, password: secret, token }, 7)).rejects.toThrow();
    expect(f.confirmPasswordRecovery).not.toHaveBeenCalled();
    await expect(f.broker.confirm({ ...input, handle: s.handle, password: secret }, 7)).resolves.toEqual({ state: 'completed' });
  });

  it('discards clipboard receipts after clear, auth changes or a newer import', async () => {
    let epoch = 1;
    const reads: ((value: string) => void)[] = [];
    const readClipboard = vi.fn(() => new Promise<string>(done => reads.push(done)));
    const broker = new PasswordRecoveryBroker({ readClipboard, sessionEpoch: () => epoch });
    const first = broker.importLink(input, 7); broker.clear(); reads[0](`https://social.example/login/reset/${token}`);
    await expect(first).rejects.toThrow('scope changed');
    const second = broker.importLink(input, 7); epoch++; reads[1](`https://social.example/login/reset/${token}`);
    await expect(second).rejects.toThrow('scope changed');
    const third = broker.importLink(input, 7), fourth = broker.importLink(input, 7);
    reads[2](`https://social.example/login/reset/${token}`); await expect(third).rejects.toThrow('scope changed');
    reads[3](`https://social.example/login/reset/${token}`); await expect(fourth).resolves.toMatchObject({ serverOrigin: 'https://social.example' }); broker.clear();
  });
  it('expires native token memory without requiring another operation', async () => {
    vi.useFakeTimers();
    try {
      const f = setup(), selected = await f.broker.importLink(input, 7);
      await vi.advanceTimersByTimeAsync(180000);
      await expect(f.broker.confirm({ ...input, handle: selected.handle, password: secret }, 7)).resolves.toEqual({ state: 'selection-expired' });
      expect(f.confirmPasswordRecovery).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

});
