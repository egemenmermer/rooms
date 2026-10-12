import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Packaging integrity only: a valid local signature is not Gatekeeper/notarization acceptance.
if (process.platform !== 'darwin') throw new Error('Signature verification requires macOS.');
const bundle = resolve(process.argv[2] ?? 'release/mac-arm64/ROOMS.app');
if (!bundle.endsWith('.app') || !existsSync(bundle)) throw new Error('Provide an existing application bundle.');
const result = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Application and nested signatures verified. Apple trust/notarization is a separate gate.');
