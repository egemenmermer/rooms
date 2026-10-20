import { z } from 'zod';
import type { ApnsAlert, ApnsClient, ApnsEnvironment, ApnsResult } from './apns';

/**
 * Upstream pushd routes sessions subscribed with endpoint "apn" to this routing key, but its own
 * APNs consumer hardcodes the Revolt app topic. Tayfa consumes the same routed payload instead of
 * forking pushd, and leaves pushd's APNs keys unset so the two never compete.
 */
export const APNS_EXCHANGE = 'revolt.notifications';
export const APNS_ROUTING_KEY = 'notifications.outbound.apn';
export const APNS_QUEUE = 'rooms.apns-relay';

const channelSchema = z
  .object({
    channel_type: z.string(),
    name: z.string().max(200).optional(),
  })
  .passthrough();
const notificationSchema = z
  .object({
    author: z.string().max(200),
    body: z.string(),
    image: z.string().optional(),
    tag: z.string().max(64),
    message: z.object({ _id: z.string().max(64), channel: z.string().max(64) }).passthrough(),
    channel: channelSchema,
  })
  .passthrough();
const payloadSchema = z
  .object({
    notification: z.object({ type: z.string(), data: z.unknown() }),
    user_id: z.string().max(64),
    session_id: z.string().max(64),
    token: z.string().max(256),
  })
  .passthrough();

const clip = (value: string, limit: number) =>
  value.length > limit ? `${[...value].slice(0, limit - 1).join('')}…` : value;

/** Returns null for payload kinds Tayfa does not deliver to iPhone (friend requests, badges, calls). */
export function messageAlert(raw: unknown): { token: string; alert: ApnsAlert } | null {
  const payload = payloadSchema.parse(raw);
  if (payload.notification.type !== 'MessageNotification') return null;
  const notification = notificationSchema.parse(payload.notification.data);
  const author = clip(notification.author.trim() || 'Tayfa', 80);
  const place = notification.channel.name ? clip(notification.channel.name, 60) : null;
  const title =
    notification.channel.channel_type === 'TextChannel' && place
      ? `${author} · #${place}`
      : notification.channel.channel_type === 'Group' && place
        ? `${author} · ${place}`
        : author;
  const text = notification.body.trim();
  return {
    token: payload.token.toLowerCase(),
    alert: {
      title,
      body: clip(text || (notification.image ? 'Fotoğraf gönderdi' : 'Ek gönderdi'), 400),
      threadId: notification.tag,
      data: { channelId: notification.message.channel, messageId: notification.message._id },
    },
  };
}

export type RelayMode = ApnsEnvironment | 'auto';
/** Sandbox tokens fail on production, and keys can be restricted to one APNs environment. */
const wrongEnvironment = new Set(['BadDeviceToken', 'BadEnvironmentKeyInToken']);

/**
 * Development (Xcode) builds receive sandbox tokens and TestFlight/App Store builds receive
 * production tokens. In auto mode a production environment mismatch is retried once on sandbox and
 * the working environment is remembered for that token.
 */
export class ApnsRelay {
  private readonly learned = new Map<string, ApnsEnvironment>();
  readonly stats = { delivered: 0, rejected: 0, skipped: 0 };
  constructor(
    private readonly client: Pick<ApnsClient, 'send'>,
    private readonly mode: RelayMode = 'auto',
  ) {}
  async handle(raw: unknown): Promise<ApnsResult | null> {
    const message = messageAlert(raw);
    if (!message) {
      this.stats.skipped++;
      return null;
    }
    const first =
      this.mode === 'auto' ? (this.learned.get(message.token) ?? 'production') : this.mode;
    let result = await this.client.send(message.token, message.alert, first);
    if (
      !result.ok &&
      this.mode === 'auto' &&
      wrongEnvironment.has(result.reason) &&
      first === 'production'
    ) {
      result = await this.client.send(message.token, message.alert, 'sandbox');
      if (result.ok) this.remember(message.token, 'sandbox');
    } else if (result.ok) this.remember(message.token, first);
    if (result.ok) this.stats.delivered++;
    else this.stats.rejected++;
    return result;
  }
  private remember(token: string, environment: ApnsEnvironment) {
    this.learned.delete(token);
    this.learned.set(token, environment);
    if (this.learned.size > 5000) this.learned.delete(this.learned.keys().next().value!);
  }
}
