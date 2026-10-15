import { readFileSync } from 'node:fs';
import { connect } from 'amqplib';
import { ApnsClient } from './apns';
import { APNS_EXCHANGE, APNS_QUEUE, APNS_ROUTING_KEY, ApnsRelay, type RelayMode } from './relay';

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const mode = (process.env.ROOMS_APNS_ENVIRONMENT ?? 'auto') as RelayMode;
if (!['auto', 'production', 'sandbox'].includes(mode))
  throw new Error('ROOMS_APNS_ENVIRONMENT must be auto, production or sandbox');

const client = new ApnsClient({
  privateKey: readFileSync(required('ROOMS_APNS_KEY_FILE'), 'utf8'),
  keyId: required('ROOMS_APNS_KEY_ID'),
  teamId: required('ROOMS_APNS_TEAM_ID'),
  topic: required('ROOMS_APNS_TOPIC'),
});
const relay = new ApnsRelay(client, mode);

async function main() {
  const connection = await connect(required('ROOMS_AMQP_URL'));
  const channel = await connection.createChannel();
  // pushd owns the exchange declaration; only verify it exists.
  await channel.checkExchange(APNS_EXCHANGE);
  await channel.assertQueue(APNS_QUEUE, {
    durable: true,
    arguments: { 'x-message-ttl': 3_600_000, 'x-max-length': 10_000 },
  });
  await channel.bindQueue(APNS_QUEUE, APNS_EXCHANGE, APNS_ROUTING_KEY);
  await channel.prefetch(16);
  await channel.consume(APNS_QUEUE, (message) => {
    if (!message) return;
    void (async () => {
      try {
        await relay.handle(JSON.parse(message.content.toString('utf8')));
        channel.ack(message);
      } catch (error) {
        // Malformed payloads are dropped; a transient APNs/network failure is retried once.
        const retry =
          !message.fields.redelivered &&
          !(error instanceof SyntaxError) &&
          !(error as { issues?: unknown }).issues;
        channel.nack(message, false, retry);
        console.error('apns relay failure', retry ? 'requeued' : 'dropped', (error as Error).name);
      }
    })();
  });
  const report = setInterval(() => {
    const { delivered, rejected, skipped } = relay.stats;
    if (delivered || rejected || skipped) console.log('apns relay', JSON.stringify(relay.stats));
  }, 3_600_000);
  report.unref();
  const stop = async () => {
    clearInterval(report);
    client.close();
    await connection.close().catch(() => {});
    process.exit(0);
  };
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
  connection.on('close', () => process.exit(1));
  console.log('apns relay ready');
}
main().catch((error: Error) => {
  console.error('apns relay startup failed', error.name, error.message);
  process.exit(1);
});
