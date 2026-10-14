import { readFile, writeFile } from 'node:fs/promises';
const path = 'infra/local/livekit.yaml';
const env = await readFile('infra/local/.env', 'utf8');
const key = env
  .split('\n')
  .find((line) => line.startsWith('LIVEKIT_API_KEY='))
  ?.slice('LIVEKIT_API_KEY='.length);
if (!key || !/^[A-Za-z0-9_-]{1,128}$/.test(key))
  throw new Error('A valid owned LiveKit API key is required.');
let yaml = await readFile(path, 'utf8');
if (/^webhook:/m.test(yaml)) {
  console.log(
    'Existing LiveKit webhook configuration was preserved; verify the broker endpoint before restarting.',
  );
  process.exit(0);
}
yaml += `\nwebhook:\n  api_key: ${key}\n  urls:\n    - "http://127.0.0.1:3002/v1/media/webhook"\n`;
await writeFile(path, yaml, { mode: 0o600 });
console.log(
  'Owned native LiveKit webhook configured. Restart the owned SFU to apply; no running server was restarted.',
);
