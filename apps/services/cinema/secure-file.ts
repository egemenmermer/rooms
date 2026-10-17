import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gunzipSync, gzip, gzipSync } from 'node:zlib';

const gzipAsync = promisify(gzip);

/**
 * AES-256-GCM JSON files (`iv(12) | tag(16) | ciphertext`), written to a 0600
 * temp file and renamed into place, like the Agent repository. Catalog
 * snapshots are gzipped first because M3U entry URLs can carry credentials.
 */
export class SecureFiles {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('Cinema storage key must be 32 bytes.');
  }

  read<T>(path: string, gzip = false): T | null {
    let raw: Buffer;
    try {
      raw = readFileSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
      return JSON.parse((gzip ? gunzipSync(plain) : plain).toString('utf8')) as T;
    } catch {
      throw new Error('Cinema storage cannot be decrypted. Do not replace its key.');
    }
  }

  write(path: string, value: unknown, gzip = false) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const json = Buffer.from(JSON.stringify(value));
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(gzip ? gzipSync(json) : json), cipher.final()]);
    writeFileSync(`${path}.tmp`, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {
      mode: 0o600,
    });
    renameSync(`${path}.tmp`, path);
  }

  /** Like {@link write}, but compresses and writes without blocking the event loop. */
  async writeAsync(path: string, value: unknown, gzipped = false) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const json = Buffer.from(JSON.stringify(value));
    const body = gzipped ? await gzipAsync(json) : json;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
    const temp = `${path}.${iv.toString('hex')}.tmp`;
    await writeFile(temp, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
    await rename(temp, path);
  }

  remove(path: string) {
    rmSync(path, { force: true });
  }
}
