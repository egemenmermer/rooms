import { expect, type Page } from '@playwright/test';
import type { RoomsClient } from '../client';

declare global {
  interface Window {
    __e2ePeers?: RTCPeerConnection[];
  }
}

/** Voice room controls plus WebRTC statistics that prove media actually flows. */
export class VoiceView {
  constructor(readonly client: RoomsClient) {}

  get page(): Page {
    return this.client.page;
  }

  /**
   * Records every RTCPeerConnection the renderer creates so tests can read inbound RTP
   * statistics. Install before joining; it only observes and never alters media.
   */
  async tapPeerConnections() {
    await this.page.evaluate(() => {
      if (window.__e2ePeers) return;
      const peers: RTCPeerConnection[] = [];
      window.__e2ePeers = peers;
      const Original = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Original {
        constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
          super(...args);
          peers.push(this);
        }
      } as typeof RTCPeerConnection;
    });
  }

  async join(roomName: string) {
    await this.client.nav.getByRole('button', { name: roomName, exact: true }).click();
    await expect(this.page.getByRole('button', { name: 'Odadan ayrıl' })).toBeVisible();
  }

  /** Participant tile; the accessible name starts with the display name. */
  participant(name: string) {
    return this.page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) });
  }

  async unmute() {
    await this.page.getByRole('button', { name: 'Mikrofonu aç' }).first().click();
    await expect(this.page.getByRole('button', { name: 'Mikrofonu kapat' }).first()).toBeVisible();
  }

  async mute() {
    await this.page.getByRole('button', { name: 'Mikrofonu kapat' }).first().click();
    await expect(this.page.getByRole('button', { name: 'Mikrofonu aç' }).first()).toBeVisible();
  }

  async leave() {
    await this.page.getByRole('button', { name: 'Odadan ayrıl' }).click();
    await expect(this.page.getByRole('button', { name: 'Odadan ayrıl' })).toHaveCount(0);
  }

  /** Sum of packetsReceived across inbound RTP streams of one kind. */
  inboundPackets(kind: 'audio' | 'video') {
    return this.page.evaluate(async (wanted) => {
      let packets = 0;
      for (const peer of window.__e2ePeers ?? []) {
        if (peer.connectionState === 'closed') continue;
        const stats = await peer.getStats();
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === wanted)
            packets += report.packetsReceived ?? 0;
        });
      }
      return packets;
    }, kind);
  }

  /** Waits until at least `minimum` more inbound packets of `kind` arrive than `baseline`. */
  async expectMediaFlowing(kind: 'audio' | 'video', baseline = 0, minimum = 25) {
    await expect
      .poll(() => this.inboundPackets(kind), {
        timeout: 30000,
        message: `${this.client.label} should receive remote ${kind} packets`,
      })
      .toBeGreaterThan(baseline + minimum);
  }
}
