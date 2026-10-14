/** Official bot gateway. Never joins voice or processes ordinary chat as agent input. */
import { createHash } from 'node:crypto';
export async function sendDiscordReply(input: {
  token: string;
  botId: string;
  channelId: string;
  messageId: string;
  content: string;
  deliveryId: string;
}) {
  if (
    !/^\d{5,25}$/.test(input.channelId) ||
    !/^\d{5,25}$/.test(input.messageId) ||
    !/^\d{5,25}$/.test(input.botId)
  )
    throw new Error('Invalid Discord reply target.');
  const response = await fetch(`https://discord.com/api/v10/channels/${input.channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${input.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: input.content.slice(0, 1900),
      nonce: createHash('sha256').update(input.deliveryId).digest('hex').slice(0, 24),
      enforce_nonce: true,
      message_reference: { message_id: input.messageId },
      allowed_mentions: { parse: [], replied_user: false },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Discord reply outcome is not confirmed.');
  }
  const message = (await response.json()) as { id?: string; author?: { id?: string } };
  if (!message.id || message.author?.id !== input.botId)
    throw new Error('Discord returned no verified bot reply.');
  return { id: message.id };
}
export interface DiscordMention {
  messageId: string;
  channelId: string;
  authorId: string;
  content: string;
}
export function mentionedBot(
  message: { author?: { bot?: boolean }; mentions?: { id: string }[]; content?: string },
  botId: string,
): boolean {
  return (
    !message.author?.bot &&
    !!message.mentions?.some((m) => m.id === botId) &&
    typeof message.content === 'string'
  );
}
export function connectDiscordBot(config: {
  token: string;
  botId: string;
  authorizedAuthorIds: Set<string>;
  onMention: (input: DiscordMention) => Promise<string>;
}) {
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let sequence: number | null = null;
  let ack = true;
  const connect = () => {
    if (stopped) return;
    socket = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    const current = socket;
    current.addEventListener('message', (event) => {
      let packet: any;
      try {
        packet = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof packet.s === 'number') sequence = packet.s;
      if (packet.op === 10) {
        ack = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = setInterval(
          () => {
            if (!ack) {
              current.close();
              return;
            }
            ack = false;
            current.send(JSON.stringify({ op: 1, d: sequence }));
          },
          Math.max(1000, packet.d.heartbeat_interval),
        );
        heartbeat.unref();
        current.send(
          JSON.stringify({
            op: 2,
            d: {
              token: config.token,
              intents: 512,
              properties: { os: 'linux', browser: 'ROOMS', device: 'ROOMS' },
            },
          }),
        );
      } else if (packet.op === 11) ack = true;
      else if (packet.op === 7 || packet.op === 9) current.close();
      else if (packet.t === 'MESSAGE_CREATE') {
        const m = packet.d;
        if (!mentionedBot(m, config.botId) || !config.authorizedAuthorIds.has(m.author?.id)) return;
        const input = {
          messageId: String(m.id),
          channelId: String(m.channel_id),
          authorId: String(m.author.id),
          content: String(m.content)
            .replace(new RegExp(`<@!?${config.botId}>`, 'g'), '')
            .trim()
            .slice(0, 20000),
        };
        if (!input.content) return;
        void config
          .onMention(input)
          .then((reply) =>
            sendDiscordReply({
              token: config.token,
              botId: config.botId,
              channelId: input.channelId,
              messageId: input.messageId,
              content: reply,
              deliveryId: `mention:${input.messageId}`,
            }),
          )
          .catch(() => {
            /* Do not log credential-bearing provider requests. */
          });
      }
    });
    current.addEventListener('close', () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (!stopped) {
        reconnect = setTimeout(connect, 5000);
        reconnect.unref();
      }
    });
    current.addEventListener('error', () => current.close());
  };
  connect();
  return () => {
    stopped = true;
    if (heartbeat) clearInterval(heartbeat);
    if (reconnect) clearTimeout(reconnect);
    socket?.close();
  };
}
