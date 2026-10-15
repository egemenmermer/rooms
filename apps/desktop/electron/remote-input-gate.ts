import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  remoteFrameBodySchema,
  remoteFrameSchema,
  remoteInputSchema,
  type RemoteLease,
  type RemoteInput,
} from '../../../packages/shared-contracts/src/remote-control';
/** Keys stay in main. The renderer transports signed packets and cannot mint a publisher approval. */
export class RemoteInputGate {
  private lease: RemoteLease | null = null;
  private verifiedAt = 0;
  private offset = 0;
  private role: 'publisher' | 'controller' | null = null;
  private tx = { motion: 0, control: 0 };
  private rx = { motion: -1, control: -1 };
  private second = 0;
  private count = 0;
  private pings = new Map<string, number>();
  latencyMs: number | null = null;
  constructor(private now = Date.now) {}
  clear() {
    this.pings.clear();
    this.latencyMs = null;
    this.lease = null;
    this.role = null;
    this.tx = { motion: 0, control: 0 };
    this.rx = { motion: -1, control: -1 };
  }
  activate(lease: RemoteLease, userId: string, captureEpoch: string | null, serverAt: number) {
    this.clear();
    const role =
      lease.source.publisherId === userId
        ? 'publisher'
        : lease.controllerId === userId
          ? 'controller'
          : null;
    if (
      !role ||
      (role === 'publisher' && lease.source.epoch !== captureEpoch) ||
      lease.expiresAt <= serverAt ||
      lease.expiresAt - serverAt > 6000
    )
      throw Error('REMOTE_APPROVAL_STALE');
    this.role = role;
    this.lease = structuredClone(lease);
    this.offset = serverAt - this.now();
    this.verifiedAt = this.now();
  }
  refresh(lease: RemoteLease | null, serverAt: number) {
    if (
      !this.lease ||
      !lease ||
      lease.leaseId !== this.lease.leaseId ||
      lease.inputKey !== this.lease.inputKey ||
      JSON.stringify(lease.source) !== JSON.stringify(this.lease.source) ||
      lease.controllerId !== this.lease.controllerId ||
      lease.controllerSid !== this.lease.controllerSid ||
      lease.expiresAt <= serverAt ||
      lease.expiresAt - serverAt > 6000
    ) {
      this.clear();
      return false;
    }
    this.lease = structuredClone(lease);
    this.offset = serverAt - this.now();
    this.verifiedAt = this.now();
    return true;
  }
  active() {
    return (
      !!this.lease &&
      this.now() >= this.verifiedAt &&
      this.now() - this.verifiedAt <= 2500 &&
      this.now() + this.offset < this.lease.expiresAt
    );
  }
  private mac(body: unknown) {
    return createHmac('sha256', Buffer.from(this.lease!.inputKey, 'hex'))
      .update(JSON.stringify(body))
      .digest('hex');
  }
  encode(value: RemoteInput, expectedLeaseId?: string) {
    if (
      this.role !== 'controller' ||
      !this.active() ||
      (expectedLeaseId && expectedLeaseId !== this.lease?.leaseId)
    )
      throw Error('REMOTE_CONTROL_INACTIVE');
    const input = remoteInputSchema.parse(value);
    if (input.type === 'pong') throw Error('REMOTE_CONTROL_INACTIVE');
    if (input.type === 'ping') {
      if (this.pings.size >= 10) this.pings.clear();
      this.pings.set(input.nonce, this.now());
    }
    return this.packet(input);
  }
  response(nonce: string) {
    if (this.role !== 'publisher' || !this.active()) throw Error('REMOTE_CONTROL_INACTIVE');
    return { ...this.packet({ type: 'pong', nonce }), destination: this.lease!.controllerId };
  }
  private packet(input: RemoteInput) {
    const channel = input.type === 'move' ? 'motion' : 'control';
    const body = remoteFrameBodySchema.parse({
      leaseId: this.lease!.leaseId,
      epoch: this.lease!.source.epoch,
      sequence: this.tx[channel]++,
      sentAt: this.now() + this.offset,
      input,
    });
    return {
      payload: JSON.stringify({ ...body, mac: this.mac(body) }),
      destination: this.lease!.source.publisherId,
      reliable: channel === 'control',
    };
  }
  decode(payload: string): RemoteInput | null {
    if (!this.role || !this.active() || Buffer.byteLength(payload) > 4096) return null;
    let frame;
    try {
      frame = remoteFrameSchema.parse(JSON.parse(payload));
    } catch {
      return null;
    }
    if (frame.leaseId !== this.lease!.leaseId || frame.epoch !== this.lease!.source.epoch)
      return null;
    const { mac, ...body } = frame;
    if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(this.mac(body), 'hex'))) return null;
    if (
      (this.role === 'controller' && frame.input.type !== 'pong') ||
      (this.role === 'publisher' && frame.input.type === 'pong')
    )
      return null;
    const channel = frame.input.type === 'move' ? 'motion' : 'control';
    if (frame.sequence <= this.rx[channel]) return null;
    const age = this.now() + this.offset - frame.sentAt;
    if (age > 2000 || age < -1000) {
      this.clear();
      return { type: 'release' };
    }
    const second = Math.floor(this.now() / 1000);
    if (second !== this.second) {
      this.second = second;
      this.count = 0;
    }
    if (++this.count > 240) {
      this.clear();
      return { type: 'release' };
    }
    this.rx[channel] = frame.sequence;
    if (frame.input.type === 'pong') {
      const start = this.pings.get(frame.input.nonce);
      if (start !== undefined) {
        this.latencyMs = Math.min(10_000, Math.max(0, this.now() - start));
        this.pings.delete(frame.input.nonce);
      }
    }
    return frame.input;
  }
}
