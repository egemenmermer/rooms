import { inflateRawSync } from 'node:zlib';

export type ZipEntry = { name: string; size: number; read(): Buffer };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_ENTRIES = 500;

/**
 * Lists the files of a small zip archive (subtitle downloads). Stored and deflated
 * entries only; `read` refuses anything that inflates beyond `maxEntryBytes`.
 */
export function zipEntries(zip: Buffer, maxEntryBytes: number): ZipEntry[] {
  let end = -1;
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 65_535); at--)
    if (zip.readUInt32LE(at) === EOCD) {
      end = at;
      break;
    }
  if (end < 0) throw new Error('Not a zip archive.');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES) throw new Error('Too many zip entries.');
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > zip.length || zip.readUInt32LE(at) !== CENTRAL) throw new Error('Broken zip.');
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const compressed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString(flags & 0x800 ? 'utf8' : 'latin1', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/') || flags & 0x1) continue;
    entries.push({
      name,
      size,
      read() {
        if (size > maxEntryBytes) throw new Error('Zip entry too large.');
        if (local + 30 > zip.length || zip.readUInt32LE(local) !== LOCAL)
          throw new Error('Broken zip.');
        const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
        const data = zip.subarray(start, start + compressed);
        if (data.length !== compressed) throw new Error('Broken zip.');
        if (method === 0) return Buffer.from(data);
        if (method !== 8) throw new Error('Unsupported zip compression.');
        return inflateRawSync(data, { maxOutputLength: maxEntryBytes });
      },
    });
  }
  return entries;
}
