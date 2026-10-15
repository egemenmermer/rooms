import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const f = vi.hoisted(() => ({
  active: false,
  begin: vi.fn(),
  apply: vi.fn(),
  end: vi.fn(),
  dialog: vi.fn(),
  on: vi.fn(),
  unregister: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/tmp/rooms-remote-fixture', on: vi.fn() },
  dialog: { showMessageBox: f.dialog },
  globalShortcut: { register: () => true, unregister: f.unregister },
  screen: {
    on: f.on,
    removeListener: vi.fn(),
    getAllDisplays: () => [
      { id: 1, label: 'QA monitor', bounds: { x: 0, y: 0, width: 100, height: 100 } },
    ],
  },
}));
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<object>('node:fs')),
  existsSync: () => true,
}));
vi.mock('node:module', async () => ({
  ...(await vi.importActual<object>('node:module')),
  createRequire: () => () => ({
    status: () => ({ supported: true, permission: true, active: f.active }),
    begin: f.begin,
    apply: f.apply,
    end: f.end,
  }),
}));
import { setupRemoteControl } from '../apps/desktop/electron/remote-control';
import { RemoteConsent } from '../apps/services/access/remote-control';
import { RemoteInputGate } from '../apps/desktop/electron/remote-input-gate';
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
let close: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  f.active = false;
  f.begin.mockReset().mockImplementation(() => {
    f.active = true;
    return true;
  });
  f.end.mockReset().mockImplementation(() => {
    f.active = false;
  });
  f.apply.mockReset().mockReturnValue(true);
  f.dialog.mockReset().mockResolvedValue({ response: 1 });
});
afterEach(() => {
  close?.();
  close = undefined;
  Object.defineProperty(process, 'platform', platform);
  vi.useRealTimers();
  vi.clearAllMocks();
});
function fixture() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const consent = new RemoteConsent();
  let capture = { epoch: randomUUID(), displayId: '1' };
  const source = {
    channelId: 'room',
    publisherId: 'alice',
    participantSid: 'PA_alice',
    trackId: 'TR_screen',
    epoch: capture.epoch,
  };
  const publisher = {
    userId: 'alice',
    participantSid: 'PA_alice',
    human: true,
    screens: ['TR_screen'],
  };
  const peer = { userId: 'bob', participantSid: 'PA_bob', human: true, screens: [] };
  consent.register(source);
  const request = consent.request(source, peer);
  const scope = {};
  const native = setupRemoteControl({
    handle: (name, action) => {
      handlers.set(name, action);
    },
    identity: () => ({ userId: 'alice', scope }),
    capture: () => capture,
    window: () => ({}) as Electron.BrowserWindow,
    broker: async (path, body: any) => {
      if (path === 'remote/state') return consent.state('room', 'alice');
      if (path === 'remote/decide') {
        consent.decide(body.requestId, publisher, peer, body.approve);
        return { decided: true };
      }
      if (path === 'remote/revoke') {
        consent.revoke('room', 'alice', body.source);
        return { revoked: true };
      }
      throw Error('Unexpected fixture route');
    },
  });
  close = native.dispose;
  return {
    consent,
    source,
    publisher,
    peer,
    request,
    invoke: (name: string, ...args: unknown[]) => handlers.get('rooms:remote-' + name)!(...args),
    changeCapture: () => {
      capture = { ...capture, epoch: randomUUID() };
    },
  };
}
it('injected native fixture requires local publisher approval and never exposes the input key', async () => {
  const fxt = fixture();
  await fxt.invoke('decide', 'room', fxt.request.id, true);
  expect(f.begin).toHaveBeenCalledTimes(1);
  const visible: any = await fxt.invoke('state', 'room');
  expect(visible.lease).not.toBeNull();
  expect(visible.lease.inputKey).toBeUndefined();
  expect(JSON.stringify(visible)).not.toContain('inputKey');
  const lease = fxt.consent.state('room', 'bob').lease!;
  const sender = new RemoteInputGate();
  sender.activate(lease, 'bob', null, Date.now());
  await fxt.invoke('receive', sender.encode({ type: 'move', x: 0.5, y: 0.5 }).payload);
  expect(f.apply).toHaveBeenCalledTimes(1);
  fxt.changeCapture();
  await fxt.invoke('receive', sender.encode({ type: 'key', code: 'KeyA', down: true }).payload);
  expect(f.apply).toHaveBeenCalledTimes(1);
  expect(f.active).toBe(false);
});
it('server-side approval alone cannot arm the publisher, and a delayed dialog cannot approve another source', async () => {
  const fxt = fixture();
  await fxt.invoke('state', 'room');
  fxt.consent.decide(fxt.request.id, fxt.publisher, fxt.peer, true);
  expect(((await fxt.invoke('state', 'room')) as any).lease).toBeNull();
  expect(f.begin).not.toHaveBeenCalled();
  fxt.consent.revoke('room', 'alice');
  const request = fxt.consent.request(fxt.source, fxt.peer);
  let answer!: (value: { response: number }) => void;
  f.dialog.mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const pending = fxt.invoke('decide', 'room', request.id, true) as Promise<unknown>;
  for (let i = 0; i < 20 && !answer; i++) await Promise.resolve();
  expect(answer).toBeTypeOf('function');
  fxt.changeCapture();
  answer({ response: 1 });
  await expect(pending).rejects.toThrow(/değişti/);
  expect(f.begin).not.toHaveBeenCalled();
});
it('stale verification releases the injected native fixture without waiting for another input packet', async () => {
  const fxt = fixture();
  await fxt.invoke('decide', 'room', fxt.request.id, true);
  expect(f.active).toBe(true);
  await vi.advanceTimersByTimeAsync(2600);
  expect(f.active).toBe(false);
  expect(fxt.consent.state('room', 'bob').lease).toBeNull();
});
