import { createServer, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

const capability = /^rooms-provider:\/\/([a-f0-9-]{36})\/stream$/;
function safeContainer(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x47 || // MPEG transport stream
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || // MP3/AAC
    Buffer.from(bytes.subarray(0, 3)).toString() === 'ID3' ||
    (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0xba) ||
    Buffer.from(bytes.subarray(4, 8)).toString() === 'ftyp' ||
    (Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' &&
      Buffer.from(bytes.subarray(8, 12)).toString() === 'AVI ') ||
    Buffer.from(bytes.subarray(0, 4)).toString() === 'OggS' ||
    Buffer.from(bytes.subarray(0, 4)).toString() === 'fLaC' ||
    (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
  );
}
/** Local decoder access; neither provider addresses nor this capability reach the renderer. */
export async function createVLCStream(
  root: string,
  fetchSource: (request: Request) => Promise<Response>,
  assertCurrent: () => void,
) {
  if (!capability.test(root)) throw new Error('Invalid personal playback capability.');
  const secret = randomBytes(32).toString('hex');
  const allowed = new Map<string, boolean>([[root, false]]);
  const controllers = new Set<AbortController>();
  const clients = new Set<ServerResponse>();
  let closed = false;
  let origin = '';
  const localURL = (source: string) => {
    const match = capability.exec(source);
    if (!match) throw new Error('Invalid nested playback capability.');
    return `${origin}/${secret}/${match[1]}/stream`;
  };
  const server = createServer(async (request, out) => {
    if (
      closed ||
      request.headers.host !== origin.slice('http://'.length) ||
      request.headers.origin ||
      !['GET', 'HEAD'].includes(request.method ?? '')
    ) {
      out.writeHead(403).end();
      return;
    }
    const match = new RegExp(`^/${secret}/([a-f0-9-]{36})/stream$`).exec(request.url ?? '');
    const source = match ? `rooms-provider://${match[1]}/stream` : '';
    if (!allowed.has(source) || controllers.size >= 16) {
      out.writeHead(404).end();
      return;
    }
    const controller = new AbortController();
    controllers.add(controller);
    clients.add(out);
    out.on('close', () => controller.abort());
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      assertCurrent();
      const headers = new Headers();
      const range = request.headers.range;
      if (range && !/^bytes=\d+-\d*$/.test(range)) {
        out.writeHead(416).end();
        return;
      }
      if (range) headers.set('Range', range);
      const response = await fetchSource(
        new Request(source, { headers, signal: controller.signal }),
      );
      assertCurrent();
      if (closed) throw new Error('Playback closed.');
      if (!response.ok) {
        await response.body?.cancel();
        out.writeHead(response.status).end();
        return;
      }
      const mime = response.headers.get('content-type') ?? 'application/octet-stream';
      if (/mpegurl/i.test(mime)) {
        // The provider authority has already rewritten/validated remote HLS addresses.
        // Reject unresolved addresses and playlist directives the local player could follow.
        const text = await response.text();
        assertCurrent();
        if (text.length > 5_000_000 || !text.trimStart().startsWith('#EXTM3U'))
          throw new Error('Invalid HLS source.');
        const rewritten = text
          .split('\n')
          .map((line) => {
            const grant = (value: string) => {
              if (!capability.test(value)) throw new Error('Unresolved HLS source.');
              if (allowed.size >= 10000) {
                for (const previous of allowed.keys()) {
                  if (previous !== root) {
                    allowed.delete(previous);
                    break;
                  }
                }
              }
              allowed.set(value, true);
              return localURL(value);
            };
            if (line.trim() && !line.startsWith('#')) return grant(line.trim());
            const result = line.replace(
              /URI="([^"]+)"/g,
              (_match, value: string) => `URI="${grant(value)}"`,
            );
            if (
              /\bURI\s*=/.test(result.replace(/URI="[^"]+"/g, '')) ||
              /(?:https?|file|ftp|rtsp|udp|data):/i.test(result.replace(/URI="[^"]+"/g, ''))
            )
              throw new Error('Unsupported HLS directive.');
            return result;
          })
          .join('\n');
        const body = Buffer.from(rewritten);
        out.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
        });
        out.end(request.method === 'HEAD' ? undefined : body);
        return;
      }
      reader = response.body?.getReader();
      if (!reader) throw new Error('Empty playback source.');
      let first = await reader.read();
      while (!first.done && first.value.length < 12) {
        const next = await reader.read();
        if (next.done) break;
        first = { done: false, value: Buffer.concat([first.value, next.value]) };
      }
      assertCurrent();
      // Opaque binary HLS segments/key bodies are authorized by their parent manifest.
      // Root streams may not be arbitrary ASX/XSPF/M3U/file-reference playlists.
      const prefix = Buffer.from(first.value ?? [])
        .toString('utf8')
        .trimStart();
      if (/^(?:#EXTM3U|<\?xml|<asx\b|<playlist\b|<smil\b|\[playlist\])/i.test(prefix))
        throw new Error('Unresolved native reference container.');
      const offset = range ? Number(/^bytes=(\d+)/.exec(range)![1]) : 0;
      // A new root read must always be sniffed again. Nonzero byte ranges are
      // continuation data only after a successfully validated root read.
      if (
        source === root &&
        (offset === 0 ? !first.value || !safeContainer(first.value) : !allowed.get(root))
      )
        throw new Error('Unsupported native playback container.');
      allowed.set(source, true);
      const outputHeaders: Record<string, string> = {
        'Content-Type': mime,
        'Cache-Control': 'no-store',
      };
      for (const key of ['content-length', 'content-range', 'accept-ranges']) {
        const value = response.headers.get(key);
        if (value) outputHeaders[key] = value;
      }
      out.writeHead(response.status, outputHeaders);
      if (request.method === 'HEAD') {
        out.end();
        return;
      }
      let chunk = first;
      while (!chunk.done) {
        assertCurrent();
        if (closed || controller.signal.aborted) break;
        if (chunk.value && !out.write(chunk.value))
          await new Promise<void>((resolve) => {
            const done = () => {
              out.off('drain', done);
              out.off('close', done);
              resolve();
            };
            out.once('drain', done);
            out.once('close', done);
          });
        chunk = await reader.read();
      }
      out.end();
    } catch {
      if (!out.headersSent) out.writeHead(502).end();
      else out.destroy();
    } finally {
      await reader?.cancel().catch(() => {});
      controllers.delete(controller);
      clients.delete(out);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local player could not start.');
  origin = `http://127.0.0.1:${address.port}`;
  return {
    url: localURL(root),
    close() {
      if (closed) return;
      closed = true;
      allowed.clear();
      for (const controller of controllers) controller.abort();
      for (const client of clients) client.destroy();
      server.closeAllConnections();
      server.close();
    },
  };
}
