import { mkdir, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const directory = new URL('../infra/local/', import.meta.url);
await mkdir(new URL('config/', directory), { recursive: true, mode: 0o700 });
try { await access(new URL('.env', directory)); } catch {
  await writeFile(new URL('.env', directory), `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
}
const config = { general: { serverName: 'http://127.0.0.1:3001' }, register: { requireInvite: true, requireCaptcha: false, email: { required: true }, password: { required: true }, dateOfBirth: { required: false } }, gateway: { endpointPublic: 'ws://127.0.0.1:3001', endpointPrivate: 'ws://spacebar:3001' }, api: { endpointPublic: 'http://127.0.0.1:3001', endpointPrivate: 'http://spacebar:3001' }, cdn: { endpointPublic: 'http://127.0.0.1:3001', endpointPrivate: 'http://spacebar:3001' } };
try { await access(new URL('config/config.json', directory)); } catch { await writeFile(new URL('config/config.json', directory), JSON.stringify(config, null, 2), { mode: 0o600 }); }
console.log('Local secrets created; no values logged. Start: docker compose --env-file infra/local/.env -f infra/docker-compose.yml up -d --build');
