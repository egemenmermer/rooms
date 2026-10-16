import { existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { assertLoopback, repoRoot, runFile, stack } from './env';
import { seedRun } from './seed';

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

/** Verifies the target, then seeds a fresh community and accounts for this run. */
export default async function globalSetup() {
  assertLoopback();
  requireBuild();
  await requireHealthy();
  const run = await seedRun(process.env.ROOMS_E2E_RUN_ID);
  await mkdir(dirname(runFile), { recursive: true, mode: 0o700 });
  // Contains disposable passwords and session tokens for the local stack only; ignored by Git.
  await writeFile(runFile, JSON.stringify(run, null, 2) + '\n', { mode: 0o600 });
  console.log(`[e2e] Seeded run ${run.runId}: community "${run.space.name}" at ${run.serverUrl}`);
}
