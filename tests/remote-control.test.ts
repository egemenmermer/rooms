import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RemoteConsent } from '../apps/services/access/remote-control';
import { RemoteInputGate } from '../apps/desktop/electron/remote-input-gate';
import type { RemoteLease } from '../packages/shared-contracts/src/remote-control';
const source = () => ({
  channelId: 'room',
  publisherId: 'alice',
  participantSid: 'PA_alice',
  trackId: 'TR_screen',
  epoch: randomUUID(),
});
const publisher = () => ({
  userId: 'alice',
  participantSid: 'PA_alice',
  screens: ['TR_screen'],
  human: true,
});
const controller = () => ({ userId: 'bob', participantSid: 'PA_bob', screens: [], human: true });
it('requires explicit human publisher consent and fences reconnects, tracks, epochs and heartbeat expiry', async () => {
  let now = 1000;
  const consent = new RemoteConsent(() => now),
    s = source();
  consent.register(s);
  expect(() => consent.request(s, { ...controller(), human: false })).toThrowError(
    expect.objectContaining({ code: 'REMOTE_HUMAN_PEER_REQUIRED' }),
  );
  const request = consent.request(s, controller());
  expect(consent.state('room', 'bob').lease).toBeNull();
  expect(() =>
    consent.decide(request.id, { ...publisher(), participantSid: 'new-sid' }, controller(), true),
  ).toThrowError(expect.objectContaining({ code: 'REMOTE_REQUEST_STALE' }));
  consent.decide(request.id, publisher(), controller(), true);
  expect(consent.state('room', 'third-person').lease).toBeNull();
  expect(consent.state('room', 'bob').lease).not.toBeNull();
  now += 4000;
  consent.state('room', 'bob'); // Viewer traffic cannot keep unattended control alive.
  now += 1100;
  expect(consent.state('room', 'bob').lease).toBeNull();
  const next = consent.request(s, controller());
  consent.decide(next.id, publisher(), controller(), true);
  await consent.validate('room', async (id) =>
    id === 'alice' ? publisher() : { ...controller(), participantSid: 'reconnected' },
  );
  expect(consent.state('room', 'bob').lease).toBeNull();
  const again = consent.request(s, controller());
  consent.decide(again.id, publisher(), controller(), true);
  consent.register({ ...s, epoch: randomUUID() });
  expect(consent.state('room', 'bob').lease).toBeNull();
});
it('rejects tampering/replay and keeps reliable keys independent from lossy mouse ordering', () => {
  let now = 1000;
  const s = source(),
    lease: RemoteLease = {
      id: randomUUID(),
      leaseId: randomUUID(),
      source: s,
      controllerId: 'bob',
      controllerSid: 'PA_bob',
      createdAt: now,
      approvedAt: now,
      expiresAt: 6000,
      inputKey: 'b'.repeat(64),
    };
  const sender = new RemoteInputGate(() => now),
    receiver = new RemoteInputGate(() => now);
  expect(() => receiver.activate(lease, 'alice', randomUUID(), now)).toThrow(/STALE/);
  sender.activate(lease, 'bob', null, now);
  receiver.activate(lease, 'alice', s.epoch, now);
  const key = sender.encode({ type: 'key', code: 'KeyA', down: true });
  const motion = sender.encode({ type: 'move', x: 0.2, y: 0.4 });
  expect(motion.reliable).toBe(false);
  expect(key.reliable).toBe(true);
  expect(receiver.decode(motion.payload)?.type).toBe('move');
  expect(receiver.decode(key.payload)?.type).toBe('key');
  expect(receiver.decode(key.payload)).toBeNull();
  expect(receiver.decode(motion.payload.replace('0.2', '0.9'))).toBeNull();
  const release = sender.encode({ type: 'key', code: 'KeyA', down: false });
  now += 2100;
  expect(receiver.decode(release.payload)).toEqual({ type: 'release' });
  expect(receiver.active()).toBe(false);
  expect(() => sender.encode({ type: 'move', x: -1, y: 0 })).toThrow();
});
it('fails closed on stale validation and never auto activates a different approval', () => {
  let now = 1000;
  const s = source();
  const lease: RemoteLease = {
    id: randomUUID(),
    leaseId: randomUUID(),
    source: s,
    controllerId: 'bob',
    controllerSid: 'PA_bob',
    createdAt: now,
    approvedAt: now,
    expiresAt: 6000,
    inputKey: 'c'.repeat(64),
  };
  const gate = new RemoteInputGate(() => now);
  gate.activate(lease, 'alice', s.epoch, now);
  now += 2600;
  expect(gate.active()).toBe(false);
  expect(gate.refresh({ ...lease, leaseId: randomUUID() }, now)).toBe(false);
  expect(gate.active()).toBe(false);
});
it('measures authenticated data-channel round trip and rejects an old UI lease when signing', () => {
  let now = 1000;
  const s = source();
  const lease: RemoteLease = {
    id: randomUUID(),
    leaseId: randomUUID(),
    source: s,
    controllerId: 'bob',
    controllerSid: 'PA_bob',
    createdAt: now,
    approvedAt: now,
    expiresAt: 6000,
    inputKey: 'd'.repeat(64),
  };
  const sender = new RemoteInputGate(() => now),
    receiver = new RemoteInputGate(() => now);
  sender.activate(lease, 'bob', null, now);
  receiver.activate(lease, 'alice', s.epoch, now);
  expect(() => sender.encode({ type: 'move', x: 0, y: 0 }, randomUUID())).toThrow(/INACTIVE/);
  const nonce = randomUUID();
  const ping = sender.encode({ type: 'ping', nonce }, lease.leaseId);
  now += 25;
  expect(receiver.decode(ping.payload)).toEqual({ type: 'ping', nonce });
  const pong = receiver.response(nonce);
  expect(pong.destination).toBe('bob');
  now += 35;
  expect(sender.decode(pong.payload)).toEqual({ type: 'pong', nonce });
  expect(sender.latencyMs).toBe(60);
  expect(() => sender.encode({ type: 'pong', nonce })).toThrow(/INACTIVE/);
  receiver.clear();
  expect(() => receiver.response(nonce)).toThrow(/INACTIVE/);
});
it('keeps the remote-control runtime mounted by the app shell, outside any route', async () => {
  // ca2f134 removed the only mount (inside ScreenHandoffRuntime) and the feature went dead.
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../apps/desktop/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/<RemoteControlRuntime \/>/);
  expect(app).toMatch(/import \{ RemoteControlRuntime \} from '\.\/RemoteControl';/);
});
