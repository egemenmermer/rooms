import { existsSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLoopback, repoRoot, runsDir, stack } from './env';

const health = {
  'Stoat API': `${stack.serverUrl}/api/`,
  'ROOMS access': `${stack.accessUrl}/health`,
  'ROOMS activities': `${stack.activitiesUrl}/health`,
  LiveKit: 'http://127.0.0.1:7880/',
};

async function requireHealthy() {
  const failures: string[] = [];
  for (const [name, url] of Object.entries(health)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) failures.push(`${name}: HTTP ${response.status}`);
    } catch {
      failures.push(`${name}: unreachable`);
    }
  }
  if (failures.length)
    throw new Error(
      `The local e2e stack is not ready (${failures.join(', ')}). Run \`pnpm e2e:stack up\` first.`,
    );
}

function requireBuild() {
  const main = resolve(repoRoot, 'dist-electron/main.cjs');
  const renderer = resolve(repoRoot, 'dist/index.html');
  if (!existsSync(main) || !existsSync(renderer))
    throw new Error('The desktop app is not built. Run `pnpm build` before `pnpm e2e`.');
  const age = (Date.now() - Math.min(statSync(main).mtimeMs, statSync(renderer).mtimeMs)) / 60000;
  if (age > 24 * 60)
    console.warn(
      `[e2e] The desktop build is ${Math.round(age / 60)} h old. Rebuild with \`pnpm build\` if the code changed.`,
    );
}

/** Verifies the target and build once; each worker seeds its own community (fixtures.ts). */
export default async function globalSetup() {
  assertLoopback();
  requireBuild();
  await requireHealthy();
  await rm(runsDir, { recursive: true, force: true });
}
