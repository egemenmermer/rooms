import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
export function assertCommittedReleaseSource(expectedSha) {
  if (
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      encoding: 'utf8',
    }).trim()
  )
    throw new Error('Commit verified source before packaging a candidate.');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (expectedSha && sha !== expectedSha)
    throw new Error('Source changed during candidate packaging.');
  return sha;
}
export function createReleaseManifest(output, buildNumber, expectedSourceSha) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const sourceSha = assertCommittedReleaseSource(expectedSourceSha);
  if (!/^\d+$/.test(String(buildNumber))) throw new Error('Release build number is required.');
  const artifacts = readdirSync(output)
    .filter((name) => /\.(?:dmg|zip)$/.test(name))
    .sort()
    .map((name) => {
      if (!name.includes(pkg.version))
        throw new Error('Package version does not match committed source.');
      const path = join(output, name);
      return { name, sha256: hash(path), bytes: statSync(path).size };
    });
  if (!artifacts.length) throw new Error('No candidate package artifacts found.');
  const notarization = JSON.parse(readFileSync(join(output, 'notarization.json'), 'utf8'));
  if (notarization.status !== 'Accepted')
    throw new Error('Candidate notarization is not Accepted.');
  const bundle = join(output, 'mac-arm64/ROOMS.app');
  const appVersion = execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleShortVersionString', join(bundle, 'Contents/Info.plist')],
    { encoding: 'utf8' },
  ).trim();
  const appBuild = execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleVersion', join(bundle, 'Contents/Info.plist')],
    { encoding: 'utf8' },
  ).trim();
  if (appVersion !== pkg.version || appBuild !== String(buildNumber))
    throw new Error('Candidate bundle version/build does not match source.');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  const services = Object.fromEntries(
    ['access', 'activities', 'agent', 'music'].map((name) => [
      name,
      hash(`dist-services/${name}.cjs`),
    ]),
  );
  return {
    manifestVersion: 1,
    version: pkg.version,
    buildNumber: String(buildNumber),
    sourceSha,
    platform: 'darwin',
    architecture: 'arm64',
    toolchain: { node: process.versions.node, packageManager: pkg.packageManager },
    activityStorage: {
      writeVersion: 1,
      readVersions: [0, 1],
      legacyScope: 'validated existing unversioned shape; production archive acceptance pending',
    },
    services,
    serviceScope: 'locally built, not deployed digest certification',
    artifacts,
    validation: {
      appleNotarization: { status: notarization.status, id: notarization.id },
      signature: 'strict deep verification before manifest creation in signed pipeline',
      physicalTwoMac: 'OPEN',
      freshInstall: 'OPEN',
      nextCandidateUpdateRecovery: 'OPEN',
      ownerAcceptance: 'OPEN',
    },
  };
}
export function writeReleaseManifest(output, buildNumber, sourceSha) {
  const manifest = createReleaseManifest(output, buildNumber, sourceSha);
  writeFileSync(join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  throw new Error('Release manifest is written only by the verified signed packaging pipeline.');
}
