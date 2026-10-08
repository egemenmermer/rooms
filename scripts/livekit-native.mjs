/** Native macOS fallback for local verification when Docker is unavailable. */
import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
const input = new URL('../infra/local/livekit.yaml', import.meta.url);
const output = new URL('../infra/local/livekit-native.yaml', import.meta.url);
const config = (await readFile(input, 'utf8')).replace('"0.0.0.0"', '"127.0.0.1"');
if (!config.includes('"127.0.0.1"')) throw new Error('A loopback-only local config is required.');
await writeFile(output, config, { mode: 0o600 });
const child = spawn(process.env.LIVEKIT_BINARY || 'livekit-server', ['--config', output.pathname, '--bind', '127.0.0.1'], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', async error => { console.error(`LiveKit could not start (${error.code || 'launch error'}). Install the official macOS server with brew install livekit.`); await unlink(output).catch(() => {}); process.exitCode = 1; });
child.on('exit', async code => { await unlink(output).catch(() => {}); process.exitCode = code ?? 0; });
