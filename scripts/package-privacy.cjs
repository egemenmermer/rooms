const { createRequire } = require('node:module');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { join, relative } = require('node:path');
const { isIP } = require('node:net');

// Operator-specific deny lists stay outside source and outside the packaged application.
function containsPrivateLiteral(
  text,
  env = process.env,
  allowFixtureExamples = false,
  allowMetadataEndpoint = false,
) {
  const extra = env.ROOMS_PRIVATE_PUBLICATION_MARKERS_FILE
    ? JSON.parse(readFileSync(env.ROOMS_PRIVATE_PUBLICATION_MARKERS_FILE, 'utf8'))
    : [];
  if (!Array.isArray(extra) || extra.some((value) => typeof value !== 'string' || !value))
    throw new Error('Private publication marker file must contain a string array.');
  if (extra.some((value) => text.includes(value))) return true;
  const paths = text.match(/\/Users\/[A-Za-z0-9_-]+\//g) ?? [];
  const fixtureOwner = '/Users/' + 'owner/';
  if (paths.some((path) => !(allowFixtureExamples && path === fixtureOwner))) return true;
  // Loopback and RFC documentation addresses are examples, not infrastructure.
  for (const match of text.matchAll(/https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?=[:/\s"'<>]|$)/g)) {
    const ip = match[1];
    if (allowFixtureExamples && ip === '169.254.169.254') continue;
    if (allowMetadataEndpoint && ip === '169.254.169.254') continue;
    if (allowFixtureExamples && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) continue;
    if (isIP(ip) && !/^(127\.|0\.0\.0\.0$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(ip))
      return true;
  }
  return false;
}
const privatePath =
  /(^|\/)(\.env(?:\.[^/]*)?|\.local|cookies(?:\.[^/]*)?|credentials(?:\.[^/]*)?|session(?:s)?\.json|music-history\.json|recep-dj\.(?:png|webm))(\/|$)|\.(p8|p12|pfx|pem|key|dump|sqlite)$/i;

function distributionScope(env = process.env) {
  const scope = env.ROOMS_DISTRIBUTION_SCOPE ?? 'public';
  if (!['public', 'community'].includes(scope))
    throw new Error('ROOMS_DISTRIBUTION_SCOPE must be public or community.');
  return scope;
}

/** Inspect application resources without executing the package or logging their contents. */
function assertPublicEntries(entries) {
  const failures = [];
  for (const { path, bytes } of entries) {
    const normalized = path.replaceAll('\\', '/').replace(/^\/+/, '');
    if (
      privatePath.test(normalized) ||
      /^docs\/(screenshots|release|reference|rooms-implementation)\//i.test(normalized)
    )
      failures.push(normalized);
    const text = bytes.toString('utf8');
    // This published driver constant is the standard cloud instance-metadata address,
    // not an operator endpoint. Private external markers are still checked first.
    const metadataDriver =
      /^node_modules\/mongodb\/(lib|src)\/client-side-encryption\/providers\/azure\.(js|ts)$/.test(
        normalized,
      );
    if (containsPrivateLiteral(text, process.env, false, metadataDriver)) failures.push(normalized);
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{32,}-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(
        text,
      )
    )
      failures.push(normalized);
    // Credentials/config exports are data, not references to configuration variable names.
    if (/\.(json|ya?ml|env|txt)$/i.test(normalized)) {
      if (
        /(?:["']?(?:refresh_token|access_token|sessionToken|password|client_secret)["']?\s*[:=]\s*["']?)[^\s"'{}\n]{8,}/i.test(
          text,
        )
      )
        failures.push(normalized);
      if (/https?:\/\/[^\s"'<>/]+:[^\s"'<>/]+@/.test(text)) failures.push(normalized);
    }
  }
  if (failures.length)
    throw new Error(
      `Public package contains private material in: ${[...new Set(failures)].join(', ')}`,
    );
}

function loadAsar(workspace) {
  const store = join(workspace, 'node_modules/.pnpm');
  const name = readdirSync(store).find((entry) => entry.startsWith('@electron+asar@'));
  if (!name) throw new Error('Install packaging dependencies before package privacy verification.');
  return createRequire(__filename)(join(store, name, 'node_modules/@electron/asar'));
}

function verifyPublicResources(resources, workspace = process.cwd()) {
  const archive = join(resources, 'app.asar');
  if (!existsSync(archive)) throw new Error('Public package app.asar is missing.');
  const asar = loadAsar(workspace);
  // after-pack may inspect the same archive twice; never reuse a stale member table.
  asar.uncache(archive);
  function* entries() {
    for (const path of asar.listPackage(archive)) {
      const archivePath = path.replace(/^[\\/]+/, '');
      if (asar.statFile(archive, archivePath).files) continue;
      yield { path: archivePath, bytes: asar.extractFile(archive, archivePath) };
    }
    function* loose(dir) {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, item.name);
        if (item.isSymbolicLink())
          throw new Error('Unexpected symlink in public application resources.');
        if (item.isDirectory()) yield* loose(path);
        else if (path !== archive)
          yield { path: relative(resources, path), bytes: readFileSync(path) };
      }
    }
    yield* loose(resources);
  }
  assertPublicEntries(entries());
}

module.exports = {
  distributionScope,
  containsPrivateLiteral,
  assertPublicEntries,
  verifyPublicResources,
};
