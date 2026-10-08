import { spawn } from 'node:child_process';
import electron from 'electron';
await import('./build-electron.mjs');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' });
let desktop;
for (let attempt = 0; attempt < 50; attempt++) {
  try { await fetch('http://127.0.0.1:5173'); break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
}
const env = { ...process.env, ROOMS_DEV_URL: 'http://127.0.0.1:5173' }; delete env.ELECTRON_RUN_AS_NODE;
desktop = spawn(electron, ['.'], { stdio: 'inherit', env });
const stop = () => { vite.kill(); desktop?.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop); desktop.on('exit', () => { vite.kill(); process.exit(); });
