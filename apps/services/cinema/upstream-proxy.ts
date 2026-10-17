import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { privateFetch } from '../../../packages/personal-media/src/network';

/** What the last upstream request of a scope reported; read to explain ffmpeg failures. */
export type UpstreamFailure = 'denied' | 'unreachable' | null;

type Scope = {
  headers: Record<string, string>;
  /** Capability id → upstream URL, least recently used first. */
  urls: Map<string, string>;
  /** Upstream URL → capability id, so a refreshed live playlist reuses its ids. */
  ids: Map<string, string>;
  root: string;
  failure: UpstreamFailure;
};

const MAX_URLS_PER_SCOPE = 10_000;
const MAX_MANIFEST = 5_000_000;
const BOM = /^\uFEFF/;

/**
 * Keeps only the highest-bandwidth variant of a master playlist, so ffmpeg's HLS
 * demuxer opens one upstream rendition instead of probing all of them.
 */
export function singleVariant(text: string) {
  const lines = text.split(/\r?\n/);
  let best = -1;
  let bestBandwidth = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const bandwidth = Number(/BANDWIDTH=(\d+)/.exec(lines[i])?.[1] ?? 0);
    if (bandwidth > bestBandwidth) {
      bestBandwidth = bandwidth;
      best = i;
    }
  }
  if (best < 0) return text;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) continue;
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      let uri = i + 1;
      while (uri < lines.length && (!lines[uri].trim() || lines[uri].startsWith('#'))) uri++;
      if (i === best) out.push(line, lines[uri] ?? '');
      i = uri;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Rewrites every URI of an HLS playlist to a proxy capability: URI lines and `URI=`
 * attributes (quoted or not, any tag), with CR, LF or CRLF line ends. NUL bytes and
 * non-HTTP(S) targets reject the playlist, so nothing reaches ffmpeg unrewritten.
 */
export function rewriteManifest(text: string, base: string, register: (url: string) => string) {
  if (text.includes('\0')) throw new Error('CINEMA_STREAM_FAILED');
  const lines = text.split(/\r\n|\r|\n/);
  if (!lines[0]?.trim().startsWith('#EXTM3U')) throw new Error('CINEMA_STREAM_FAILED');
  const resolve = (raw: string) => {
    const target = new URL(raw.trim(), base);
    if (target.protocol !== 'http:' && target.protocol !== 'https:')
      throw new Error('CINEMA_STREAM_FAILED');
    return register(target.href);
  };
  return lines
    .map((line) => {
      const value = line.trim();
      if (!value) return '';
      if (!value.startsWith('#')) return resolve(value);
      return value.replace(
        /URI=(?:"([^"]*)"|([^",\s]+))/gi,
        (_m, quoted: string | undefined, bare: string | undefined) =>
          `URI="${resolve(quoted ?? bare ?? '')}"`,
      );
    })
    .join('\n');
}

function basename(url: string) {
  try {
    const name = new URL(url).pathname.split('/').pop() ?? '';
    return /^[A-Za-z0-9._-]{1,64}$/.test(name) && !name.startsWith('.') ? name : 'media';
  } catch {
    return 'media';
  }
}

/**
 * Loopback capability proxy between ffmpeg and the provider. ffmpeg and ffprobe only
 * see `http://127.0.0.1:<port>/<secret>/<scope>/<id>/<name>`, so provider URLs stay out
 * of argv and /proc, and every upstream hop (redirects, child playlists, segments) goes
 * through privateFetch's pinned-DNS, private-network check. HLS manifests are rewritten
 * so their children become new capabilities of the same scope.
 */
export class UpstreamProxy {
  private readonly secret = randomBytes(32).toString('hex');
  private readonly scopes = new Map<string, Scope>();
  private readonly controllers = new Set<AbortController>();
  private host = '';
  private closed = false;

  private constructor(
    private readonly server: ReturnType<typeof createServer>,
    private readonly options: { userAgent: string; allowPrivateNetwork?: boolean },
  ) {}

  static async start(options: { userAgent: string; allowPrivateNetwork?: boolean }) {
    const server = createServer();
    const proxy = new UpstreamProxy(server, options);
    server.on('request', (request, response) => void proxy.handle(request, response));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('CINEMA_STREAM_FAILED');
    proxy.host = `127.0.0.1:${address.port}`;
    return proxy;
  }

  /** Creates a scope for one relay and returns the local URL of its root source. */
  open(url: string, headers: Record<string, string> = {}) {
    const scopeId = randomBytes(16).toString('hex');
    this.scopes.set(scopeId, {
      headers: { ...headers },
      urls: new Map(),
      ids: new Map(),
      root: '',
      failure: null,
    });
    const local = this.grant(scopeId, url);
    this.scopes.get(scopeId)!.root = this.scopes.get(scopeId)!.ids.get(url)!;
    return { scope: scopeId, url: local };
  }

  failure(scope: string): UpstreamFailure {
    return this.scopes.get(scope)?.failure ?? null;
  }

  revoke(scope: string) {
    this.scopes.delete(scope);
  }

  /** Local origin, for masking ffmpeg output. */
  get origin() {
    return `http://${this.host}`;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.scopes.clear();
    for (const controller of this.controllers) controller.abort();
    this.server.closeAllConnections();
    this.server.close();
  }

  private grant(scopeId: string, url: string) {
    const scope = this.scopes.get(scopeId);
    if (!scope) throw new Error('CINEMA_STREAM_FAILED');
    let id = scope.ids.get(url);
    if (id) {
      scope.urls.delete(id);
    } else {
      if (scope.urls.size >= MAX_URLS_PER_SCOPE) {
        // Least recently used goes first; the root never does. Playlists in use are
        // refreshed every few seconds, so they stay at the recent end.
        for (const [oldId, oldUrl] of scope.urls) {
          if (oldId === scope.root) continue;
          scope.urls.delete(oldId);
          scope.ids.delete(oldUrl);
          break;
        }
      }
      id = randomBytes(12).toString('hex');
      scope.ids.set(url, id);
    }
    scope.urls.set(id, url);
    return `http://${this.host}/${this.secret}/${scopeId}/${id}/${basename(url)}`;
  }

  private async handle(request: IncomingMessage, out: ServerResponse) {
    if (
      this.closed ||
      request.headers.host !== this.host ||
      request.headers.origin !== undefined ||
      !['GET', 'HEAD'].includes(request.method ?? '')
    ) {
      out.writeHead(403).end();
      return;
    }
    const match = /^\/([a-f0-9]{64})\/([a-f0-9]{32})\/([a-f0-9]{24})\/[A-Za-z0-9._-]{1,64}$/.exec(
      request.url ?? '',
    );
    const scope = match && match[1] === this.secret ? this.scopes.get(match[2]) : undefined;
    const scopeId = match?.[2] ?? '';
    const url = scope?.urls.get(match![3]);
    if (!scope || !url) {
      out.writeHead(404).end();
      return;
    }
    scope.urls.delete(match![3]);
    scope.urls.set(match![3], url);
    const range = request.headers.range;
    if (range && !/^bytes=\d+-\d*$/.test(range)) {
      out.writeHead(416).end();
      return;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    out.on('close', () => controller.abort());
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      let response: Response;
      try {
        response = await privateFetch(url, {
          headers: {
            ...scope.headers,
            'User-Agent': scope.headers['User-Agent'] ?? this.options.userAgent,
            ...(range ? { Range: range } : {}),
          },
          signal: controller.signal,
          allowPrivateNetwork: this.options.allowPrivateNetwork,
        });
      } catch {
        if (!controller.signal.aborted) scope.failure = 'unreachable';
        if (!out.headersSent) out.writeHead(502).end();
        return;
      }
      if (!response.ok) {
        scope.failure =
          response.status === 401 || response.status === 403 ? 'denied' : 'unreachable';
        await response.body?.cancel().catch(() => {});
        out.writeHead(response.status).end();
        return;
      }
      reader = response.body?.getReader();
      if (!reader) {
        out.writeHead(204).end();
        return;
      }
      let first = await reader.read();
      while (!first.done && first.value.length < 16) {
        const next = await reader.read();
        if (next.done) break;
        first = { done: false, value: Buffer.concat([first.value, next.value]) };
      }
      const head = Buffer.from(first.value ?? [])
        .toString('utf8', 0, 32)
        .replace(BOM, '')
        .trimStart();
      const mime = response.headers.get('content-type') ?? 'application/octet-stream';
      if (head.startsWith('#EXTM3U')) {
        const chunks: Uint8Array[] = first.value ? [first.value] : [];
        let total = first.value?.length ?? 0;
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
          total += chunk.value.length;
          if (total > MAX_MANIFEST) throw new Error('Manifest too large');
          chunks.push(chunk.value);
        }
        const text = singleVariant(Buffer.concat(chunks).toString('utf8').replace(BOM, ''));
        const rewritten = Buffer.from(
          rewriteManifest(text, response.url || url, (child) => this.grant(scopeId, child)),
        );
        scope.failure = null;
        out.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Content-Length': rewritten.length,
          'Cache-Control': 'no-store',
        });
        out.end(request.method === 'HEAD' ? undefined : rewritten);
        return;
      }
      scope.failure = null;
      const headers: Record<string, string> = { 'Content-Type': mime, 'Cache-Control': 'no-store' };
      for (const key of ['content-length', 'content-range', 'accept-ranges']) {
        const value = response.headers.get(key);
        if (value) headers[key] = value;
      }
      out.writeHead(response.status, headers);
      if (request.method === 'HEAD') {
        out.end();
        return;
      }
      for (let chunk = first; !chunk.done; chunk = await reader.read()) {
        if (this.closed || controller.signal.aborted || !this.scopes.has(scopeId)) break;
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
      }
      out.end();
    } catch {
      if (!out.headersSent) out.writeHead(502).end();
      else out.destroy();
    } finally {
      await reader?.cancel().catch(() => {});
      this.controllers.delete(controller);
    }
  }
}
