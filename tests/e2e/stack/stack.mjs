/**
 * Disposable local ROOMS stack for the end-to-end suite.
 *
 *   node tests/e2e/stack/stack.mjs up [--no-build]   build services, render config, start, wait
 *   node tests/e2e/stack/stack.mjs status            container state and HTTP health probes
 *   node tests/e2e/stack/stack.mjs logs [service]    recent container logs
 *   node tests/e2e/stack/stack.mjs down              stop containers, keep data
 *   node tests/e2e/stack/stack.mjs reset             stop containers and delete all stack data
 *
 * Everything binds to 127.0.0.1. Secrets are generated once into .local/e2e/stack (mode 0600)
 * and are never printed. The stack never touches the production server.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const state = resolve(repo, '.local/e2e/stack');
const compose = join(here, 'compose.yml');
const project = 'rooms-e2e';

// Fixed loopback ports, chosen to avoid the developer stack (3002/3021-3023/3031).
// LiveKit signalling is the exception: the renderer CSP only allows 127.0.0.1:7880.
export const ports = {
  E2E_HTTP_PORT: '4100',
  E2E_API_PORT: '4101',
  E2E_MONGO_PORT: '4102',
  E2E_RTC_TCP_PORT: '4181',
  E2E_RTC_UDP_START: '51000',
  E2E_RTC_UDP_END: '51020',
};

const hex = (bytes = 32) => randomBytes(bytes).toString('hex');

async function readEnv(path) {
  try {
    const text = await readFile(path, 'utf8');
    return Object.fromEntries(
      text
        .split('\n')
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
  } catch {
    return {};
  }
}

const serialize = (values) =>
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';

/** Web Push (VAPID) pair in the encoding Stoat's pushd expects: [public, private]. */
function vapidPair() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const pem = pair.privateKey.export({ format: 'pem', type: 'sec1' });
  return [
    Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x, 'base64url'),
      Buffer.from(jwk.y, 'base64url'),
    ]).toString('base64url'),
    Buffer.from(pem).toString('base64').replace(/=+$/, ''),
  ];
}

/** Generates secrets once and keeps them across `up`; `reset` deletes them with the data. */
async function ensureState() {
  await mkdir(join(state, 'access'), { recursive: true, mode: 0o700 });
  await chmod(state, 0o700);
  const envPath = join(state, '.env');
  const existing = await readEnv(envPath);
  const env = {
    E2E_STATE: state,
    E2E_REPO: repo,
    ...ports,
    E2E_RABBIT_PASSWORD: existing.E2E_RABBIT_PASSWORD ?? hex(),
    E2E_MINIO_PASSWORD: existing.E2E_MINIO_PASSWORD ?? hex(),
    E2E_POSTGRES_PASSWORD: existing.E2E_POSTGRES_PASSWORD ?? hex(),
    E2E_LIVEKIT_KEY: existing.E2E_LIVEKIT_KEY ?? `e2e${hex(8)}`,
    E2E_LIVEKIT_SECRET: existing.E2E_LIVEKIT_SECRET ?? hex(),
    E2E_FILES_KEY: existing.E2E_FILES_KEY ?? randomBytes(32).toString('base64'),
  };
  const vapid = existing.E2E_VAPID_PUBLIC
    ? [existing.E2E_VAPID_PUBLIC, existing.E2E_VAPID_PRIVATE]
    : vapidPair();
  [env.E2E_VAPID_PUBLIC, env.E2E_VAPID_PRIVATE] = vapid;
  await writeFile(envPath, serialize(env), { mode: 0o600 });
  await writeFile(
    join(state, 'secrets.env'),
    serialize({
      REVOLT__RABBIT__PASSWORD: env.E2E_RABBIT_PASSWORD,
      REVOLT__FILES__S3__ACCESS_KEY_ID: 'roomsuploads',
      REVOLT__FILES__S3__SECRET_ACCESS_KEY: env.E2E_MINIO_PASSWORD,
      REVOLT__FILES__ENCRYPTION_KEY: env.E2E_FILES_KEY,
      REVOLT__PUSHD__VAPID__PRIVATE_KEY: env.E2E_VAPID_PRIVATE,
      REVOLT__PUSHD__VAPID__PUBLIC_KEY: env.E2E_VAPID_PUBLIC,
    }),
    { mode: 0o600 },
  );
  const render = async (template, output) => {
    let text = await readFile(join(here, template), 'utf8');
    text = text.replace(/\{\{(E2E_[A-Z0-9_]+)\}\}/g, (_match, key) => {
      if (!(key in env)) throw new Error(`Unknown template variable ${key}`);
      return env[key];
    });
    await writeFile(join(state, output), text, { mode: 0o600 });
  };
  await render('Revolt.toml.template', 'Revolt.toml');
  await render('Caddyfile.template', 'Caddyfile');
  await render('livekit.yaml.template', 'livekit.yaml');
  await writeFile(
    join(state, 'stoat.json'),
    JSON.stringify({ api: `http://127.0.0.1:${ports.E2E_HTTP_PORT}/api` }) + '\n',
    { mode: 0o644 },
  );
  return env;
}

function docker(args, options = {}) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      '-f',
      compose,
      '--env-file',
      join(state, '.env'),
      '--project-directory',
      here,
      ...args,
    ],
    { stdio: 'inherit', cwd: repo, ...options },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function requireDocker() {
  const info = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (info.status !== 0) {
    console.error('Docker is not running. Start Docker Desktop (or another engine) and retry.');
    process.exit(1);
  }
}

export const endpoints = {
  stoat: `http://127.0.0.1:${ports.E2E_HTTP_PORT}/api/`,
  access: `http://127.0.0.1:${ports.E2E_HTTP_PORT}/rooms-access/health`,
  activities: `http://127.0.0.1:${ports.E2E_HTTP_PORT}/rooms-activities/health`,
  livekit: 'http://127.0.0.1:7880/',
};

async function probe() {
  const results = {};
  for (const [name, url] of Object.entries(endpoints)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      results[name] = response.ok ? 'ok' : `http ${response.status}`;
    } catch {
      results[name] = 'unreachable';
    }
  }
  return results;
}

async function waitHealthy(timeoutMs = 180000) {
  const started = Date.now();
  let last = {};
  while (Date.now() - started < timeoutMs) {
    last = await probe();
    if (Object.values(last).every((value) => value === 'ok')) return last;
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error(`Stack did not become healthy: ${JSON.stringify(last)}`);
}

const [command = 'status', ...rest] = process.argv.slice(2);
switch (command) {
  case 'up': {
    requireDocker();
    if (!rest.includes('--no-build') || !existsSync(join(repo, 'dist-services/access.cjs'))) {
      const build = spawnSync(process.execPath, ['scripts/build-services.mjs'], {
        cwd: repo,
        stdio: 'inherit',
      });
      if (build.status !== 0) process.exit(build.status ?? 1);
    }
    await ensureState();
    if (docker(['up', '-d', '--remove-orphans']) !== 0) process.exit(1);
    const health = await waitHealthy();
    console.log(`ROOMS e2e stack is healthy: ${JSON.stringify(health)}`);
    console.log(`Community URL: http://127.0.0.1:${ports.E2E_HTTP_PORT}`);
    break;
  }
  case 'status': {
    requireDocker();
    if (!existsSync(join(state, '.env'))) {
      console.log('The e2e stack has not been created. Run `pnpm e2e:stack up`.');
      break;
    }
    docker(['ps']);
    console.log(JSON.stringify(await probe(), null, 2));
    break;
  }
  case 'logs': {
    requireDocker();
    docker(['logs', '--tail', '200', ...rest]);
    break;
  }
  case 'down': {
    requireDocker();
    if (existsSync(join(state, '.env'))) docker(['down']);
    break;
  }
  case 'reset': {
    requireDocker();
    if (existsSync(join(state, '.env'))) docker(['down', '--volumes', '--remove-orphans']);
    await rm(resolve(repo, '.local/e2e'), { recursive: true, force: true });
    console.log('ROOMS e2e stack, data, secrets, and run files were deleted.');
    break;
  }
  default:
    console.error(`Unknown command: ${command}. Use up, status, logs, down, or reset.`);
    process.exit(1);
}
