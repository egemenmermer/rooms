import { resolveSpotifyShortLink, spotifyPlaylist } from './spotify-playlist';
import type {
  PlaylistTrack,
  SpotifyPlaylistTrack,
} from '../../../packages/shared-contracts/src/music-playlists';
import { MusicHistory } from './history';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { MusicCommand, MusicSnapshot } from '../../../packages/shared-contracts/src/music';
import { musicIdentity } from '../../../packages/shared-contracts/src/music';
import { fetchMusicFile, type MusicFile } from './audio-file';
import {
  youtubeSource,
  youtubeReferences,
  fetchYouTubeMusic,
  matchingYouTubeReference,
  type MusicReference,
} from './youtube-source';
import { parseSongLink } from '../../../packages/shared-contracts/src/song-links';
import { songMetadata } from './song-metadata';
import type { MusicPublisher } from './publisher';
export interface MusicLease {
  leaseId: string;
  url: string;
  token: string;
}
type Entry = MusicReference & {
  id: string;
  file?: MusicFile;
  spotify?: SpotifyPlaylistTrack;
  /** Times a stream that broke off mid-song was picked up again. */
  retries?: number;
  /** Why the queue went past this track on its own; the queue shows it next to the title. */
  skipped?: 'missing' | 'failed';
};
const SKIPPED = { missing: 'bulunamadı, atlandı', failed: 'çalınamadı, atlandı' } as const;
/** Failures of one track, not of the DJ: the queue goes on without it. */
const TRACK_FAILURES = new Set([
  'MUSIC_DECODE_FAILED',
  'MUSIC_YOUTUBE_UNAVAILABLE',
  'MUSIC_SOURCE_FAILED',
  'MUSIC_SOURCE_TIMEOUT',
  'MUSIC_SOURCE_TOO_LARGE',
  'MUSIC_MIRROR_NOT_FOUND',
  'MUSIC_SEARCH_UNAVAILABLE',
]);
/** Of those, the ones a broken connection causes; the stream is opened again where it stopped. */
const STREAM_FAILURES = new Set([
  'MUSIC_DECODE_FAILED',
  'MUSIC_YOUTUBE_UNAVAILABLE',
  'MUSIC_SOURCE_FAILED',
  'MUSIC_SOURCE_TIMEOUT',
]);
const MID_SONG_RETRIES = 2;
/** Tracks that fail to start in a row before the DJ stops and says so. */
const SKIP_LIMIT = 3;
/** A song with no YouTube recording says nothing about the next one, so more may go by. */
const MISSING_SKIP_LIMIT = 10;
const musicCode = (error: unknown, fallback: string) =>
  error instanceof Error && /^MUSIC_[A-Z_]+$/.test(error.message) ? error.message : fallback;
function playlistReference(
  track: PlaylistTrack,
): MusicReference & { spotify?: SpotifyPlaylistTrack } {
  return 'videoId' in track
    ? {
        source: `https://www.youtube.com/watch?v=${track.videoId}`,
        title: track.title,
        durationSec: track.durationSec,
      }
    : {
        source: `https://open.spotify.com/track/${track.spotifyTrackId}`,
        title: track.title,
        durationSec: track.durationSec,
        spotify: track,
      };
}
interface Session {
  channelId: string;
  leaseId: string;
  publisher: MusicPublisher;
  connected: boolean;
  status: MusicSnapshot['status'];
  queue: Entry[];
  index: number;
  error: string | null;
  serial: Promise<unknown>;
  generation: number;
  heartbeat?: ReturnType<typeof setInterval>;
  pausedAt: number | null;
  resumePosition: number | null;
  /** The last track played to its end (its duration may be unknown, e.g. a pasted link). */
  ended?: boolean;
  historyId: string;
  startedAt: string;
  played: Set<string>;
}
export class MusicWorker {
  private sessions = new Map<string, Session>();
  private bytes = 0;
  private pending = 0;
  constructor(
    private options: {
      publisher(): MusicPublisher;
      lease(channelId: string, leaseId: string): Promise<MusicLease>;
      fetchFile?: typeof fetchMusicFile;
      youtubeReferences?: typeof youtubeReferences;
      youtubeFile?: typeof fetchYouTubeMusic;
      songMetadata?: typeof songMetadata;
      spotifyPlaylist?: typeof spotifyPlaylist;
      resolveSpotifyShortLink?: typeof resolveSpotifyShortLink;
      matchingYouTubeReference?: typeof matchingYouTubeReference;
      now?: () => number;
      history?: MusicHistory;
    },
  ) {}
  async history(channelId: string) {
    return this.options.history?.list(channelId) ?? [];
  }
  async references(channelId: string, sessionId?: string): Promise<PlaylistTrack[]> {
    if (sessionId) {
      const old = await this.options.history?.replay(channelId, sessionId);
      if (!old) throw Error('MUSIC_HISTORY_MISSING');
      return old.sources.map((source, index) =>
        typeof source !== 'string'
          ? source
          : {
              videoId: youtubeSource(source)!.id,
              title: old.session.tracks[index].title,
              durationSec: old.session.tracks[index].durationSec,
            },
      );
    }
    return (this.sessions.get(channelId)?.queue ?? []).flatMap<PlaylistTrack>((item) => {
      if (item.spotify) return [item.spotify];
      const source = youtubeSource(item.source);
      return source?.kind === 'video'
        ? [{ videoId: source.id, title: item.title, durationSec: item.durationSec }]
        : [];
    });
  }
  private async archive(s: Session, ended = false) {
    if (!this.options.history) return;
    const generation = s.generation;
    const items = s.queue.filter(
      (item) => item.spotify || youtubeSource(item.source)?.kind === 'video',
    );
    try {
      const prior = await this.options.history.replay(s.channelId, s.historyId);
      if (!ended && (this.sessions.get(s.channelId) !== s || generation !== s.generation)) return;
      const current = items.map((item) => ({
        source: item.spotify ?? `https://www.youtube.com/watch?v=${youtubeSource(item.source)!.id}`,
        track: {
          id: item.id,
          title: item.title,
          durationSec: item.durationSec,
          played: s.played.has(item.id),
        },
      }));
      const ids = new Set(current.map((item) => item.track.id));
      const removed = (prior?.session.tracks ?? []).flatMap((track, i) =>
        track.played && !ids.has(track.id) ? [{ track, source: prior!.sources[i]! }] : [],
      );
      const records = [...current, ...removed].slice(0, 100);
      if (!records.length) return;
      await this.options.history.save(
        s.channelId,
        {
          id: s.historyId,
          startedAt: s.startedAt,
          endedAt: ended ? new Date(this.now()).toISOString() : null,
          tracks: records.map((item) => item.track),
        },
        records.map((item) => item.source),
      );
    } catch {
      s.error = 'MUSIC_HISTORY_UNAVAILABLE';
    }
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  snapshot(channelId: string): MusicSnapshot {
    const s = this.sessions.get(channelId);
    return {
      channelId,
      identity: musicIdentity(channelId),
      status: s?.status ?? 'disconnected',
      queue:
        s?.queue.map(({ id, title, durationSec, requestedProvider, skipped }) => ({
          id,
          title: skipped
            ? `${title.slice(0, 120)}${requestedProvider ? ' · YouTube' : ''} · ${SKIPPED[skipped]}`
            : requestedProvider
              ? `${title.slice(0, 140)} · YouTube`
              : title,
          durationSec,
        })) ?? [],
      currentId: s?.queue[s.index]?.id ?? null,
      positionSec: s ? Math.min(7200, s.resumePosition ?? s.publisher.position()) : 0,
      error: s?.error ?? null,
    };
  }
  private async destroy(s: Session) {
    if (this.sessions.get(s.channelId) !== s) return;
    this.sessions.delete(s.channelId);
    s.generation++;
    await this.archive(s, true);
    clearInterval(s.heartbeat);
    await s.publisher.close().catch(() => {});
    await Promise.all(
      s.queue.map(async (file) => {
        if (file.file) {
          this.bytes -= file.file.bytes;
          await rm(file.file.directory, { recursive: true, force: true });
        }
      }),
    );
  }
  async close() {
    await Promise.all([...this.sessions.values()].map((s) => this.destroy(s)));
  }
  private async ensure(channelId: string, lease: MusicLease) {
    let s = this.sessions.get(channelId);
    if (s && s.leaseId !== lease.leaseId) {
      await this.destroy(s);
      s = undefined;
    }
    if (!s) {
      if (this.sessions.size >= 2) throw new Error('MUSIC_ROOM_LIMIT');
      s = {
        channelId,
        leaseId: lease.leaseId,
        publisher: this.options.publisher(),
        connected: false,
        status: 'connecting',
        queue: [],
        index: -1,
        error: null,
        serial: Promise.resolve(),
        generation: 0,
        pausedAt: null,
        resumePosition: null,
        historyId: randomUUID(),
        startedAt: new Date(this.now()).toISOString(),
        played: new Set(),
      };
      this.sessions.set(channelId, s);
    }
    if (!s.connected) {
      try {
        await s.publisher.connect(lease.url, lease.token);
        s.connected = true;
        s.status = 'paused';
        s.pausedAt = this.now();
      } catch {
        await this.destroy(s);
        throw new Error('MUSIC_TRANSPORT_UNAVAILABLE');
      }
      const selected = s;
      let checking = false;
      s.heartbeat = setInterval(() => {
        if (checking) return;
        checking = true;
        void (async () => {
          try {
            await this.options.lease(channelId, selected.leaseId);
            if (selected.pausedAt && this.now() - selected.pausedAt > 180000)
              await this.destroy(selected);
          } catch (error) {
            // A passing failure (access restarting, Stoat or LiveKit slow) keeps the session;
            // the lease still expires on access if it never recovers, and that ends it.
            if (!(error instanceof Error && error.message === 'MUSIC_LEASE_UNAVAILABLE'))
              await this.destroy(selected);
          } finally {
            checking = false;
          }
        })();
      }, 10000);
      s.heartbeat.unref();
    }
    return s;
  }
  private ended(s: Session, item: Entry, generation: number) {
    if (this.sessions.get(s.channelId) !== s || generation !== s.generation) return;
    void this.serial(s, async () => {
      if (
        this.sessions.get(s.channelId) !== s ||
        generation !== s.generation ||
        s.queue[s.index]?.id !== item.id
      )
        return;
      if (s.index + 1 < s.queue.length) {
        s.index++;
        await this.playOn(s);
      } else {
        s.status = 'paused';
        s.pausedAt = this.now();
        // A link added by hand or a flat playlist entry has no duration; learn it at its end.
        if (!(item.durationSec > 0))
          item.durationSec = Math.max(1, Math.round(s.publisher.position()));
        s.resumePosition = item.durationSec;
        s.ended = true;
      }
    }).catch(() => {});
  }
  private async play(s: Session, position = 0) {
    const item = s.queue[s.index];
    if (!item) return;
    const generation = ++s.generation;
    s.publisher.pause();
    s.status = 'connecting';
    s.error = null;
    s.resumePosition = null;
    s.ended = false;
    try {
      if (item.spotify && !youtubeSource(item.source)) {
        const ref = await (this.options.matchingYouTubeReference ?? matchingYouTubeReference)(
          {
            provider: 'spotify',
            title: item.spotify.title,
            artists: item.spotify.artists,
            durationSec: item.spotify.durationSec,
          },
          { loose: true },
        );
        if (this.sessions.get(s.channelId) !== s || generation !== s.generation) return;
        // A passing access failure is no refusal; the heartbeat still ends a revoked lease.
        await this.options.lease(s.channelId, s.leaseId).catch((error: unknown) => {
          if (!(error instanceof Error && error.message === 'MUSIC_LEASE_UNAVAILABLE')) throw error;
        });
        if (this.sessions.get(s.channelId) !== s || generation !== s.generation) return;
        Object.assign(item, ref);
      }
      if (youtubeSource(item.source) && s.publisher.playYouTube) {
        await s.publisher.playYouTube(
          item.source,
          Math.max(0, position),
          () => this.ended(s, item, generation),
          (error) => this.failed(s, item, generation, error),
        );
        if (
          this.sessions.get(s.channelId) === s &&
          generation === s.generation &&
          s.status === 'connecting'
        ) {
          s.status = 'playing';
          s.pausedAt = null;
          s.played.add(item.id);
          delete item.skipped;
          await this.archive(s);
        }
        return;
      }
      if (!item.file) {
        // Release inactive cached files before a long set download; keep other rooms' playing files.
        for (const candidate of this.sessions.values())
          for (const old of candidate.queue) {
            if (
              old.file &&
              old !== candidate.queue[candidate.index] &&
              this.bytes > 180 * 1024 * 1024
            ) {
              this.bytes -= old.file.bytes;
              await rm(old.file.directory, { recursive: true, force: true });
              delete old.file;
            }
          }
        const file = await (
          youtubeSource(item.source)
            ? (this.options.youtubeFile ?? fetchYouTubeMusic)
            : (this.options.fetchFile ?? fetchMusicFile)
        )(item.source);
        if (this.sessions.get(s.channelId) !== s || generation !== s.generation) {
          await rm(file.directory, { recursive: true, force: true });
          return;
        }
        for (const candidate of this.sessions.values())
          for (const old of candidate.queue) {
            if (
              old.file &&
              old !== item &&
              old !== candidate.queue[candidate.index] &&
              this.bytes + file.bytes > 320 * 1024 * 1024
            ) {
              this.bytes -= old.file.bytes;
              await rm(old.file.directory, { recursive: true, force: true });
              delete old.file;
            }
          }
        if (this.bytes + file.bytes > 384 * 1024 * 1024) {
          await rm(file.directory, { recursive: true, force: true });
          throw new Error('MUSIC_CACHE_LIMIT');
        }
        this.bytes += file.bytes;
        item.file = file;
        item.title = file.title;
        item.durationSec = file.durationSec;
      }
      s.status = 'playing';
      s.pausedAt = null;
      await s.publisher.play(
        item.file.path,
        Math.max(0, Math.min(position, Math.max(0, item.durationSec - 0.01))),
        () => this.ended(s, item, generation),
        () => this.failed(s, item, generation),
      );
      if (this.sessions.get(s.channelId) === s && generation === s.generation) {
        s.played.add(item.id);
        delete item.skipped;
        await this.archive(s);
      }
    } catch (error) {
      if (this.sessions.get(s.channelId) === s && generation === s.generation) {
        s.status = 'error';
        s.error = musicCode(error, 'MUSIC_SOURCE_FAILED');
      }
      throw error;
    }
  }
  /**
   * Plays from `s.index` on its own (a song ended or broke off, Next, a list just added): a
   * track that cannot start is skipped, up to {@link SKIP_LIMIT} in a row
   * ({@link MISSING_SKIP_LIMIT} for songs with no YouTube recording), so one bad link never
   * stalls the whole queue. The snapshot says a track was skipped and the queue marks which.
   */
  private async playOn(s: Session, skipped: string | null = null) {
    let failures = 0,
      missing = 0;
    for (;;) {
      const item = s.queue[s.index];
      try {
        await this.play(s);
        if (skipped && this.sessions.get(s.channelId) === s && s.status === 'playing')
          s.error = 'MUSIC_TRACK_SKIPPED';
        return;
      } catch (error) {
        if (this.sessions.get(s.channelId) !== s) return;
        const code = musicCode(error, 'MUSIC_SOURCE_FAILED');
        if (!TRACK_FAILURES.has(code)) return;
        const notFound = code === 'MUSIC_MIRROR_NOT_FOUND';
        if (notFound ? ++missing >= MISSING_SKIP_LIMIT : ++failures >= SKIP_LIMIT) return;
        if (s.index + 1 >= s.queue.length) return;
        if (item) item.skipped = notFound ? 'missing' : 'failed';
        s.index++;
        skipped = code;
      }
    }
  }
  /**
   * The playing track failed after it started. A dropped stream is opened again where it
   * stopped (twice at most); otherwise the queue moves on. Access refusals and transport
   * failures stop the DJ, since every next track would fail the same way.
   */
  private failed(s: Session, item: Entry, generation: number, error?: Error) {
    if (this.sessions.get(s.channelId) !== s || generation !== s.generation) return;
    const code = musicCode(error, 'MUSIC_DECODE_FAILED');
    s.status = 'error';
    s.error = code;
    if (!TRACK_FAILURES.has(code)) return;
    const position = s.publisher.position();
    void this.serial(s, async () => {
      if (
        this.sessions.get(s.channelId) !== s ||
        generation !== s.generation ||
        s.queue[s.index]?.id !== item.id
      )
        return;
      const midSong = position > 1 && (item.durationSec <= 0 || position < item.durationSec - 2);
      if (STREAM_FAILURES.has(code) && midSong && (item.retries ?? 0) < MID_SONG_RETRIES) {
        item.retries = (item.retries ?? 0) + 1;
        try {
          await this.play(s, position);
          return;
        } catch {
          if (this.sessions.get(s.channelId) !== s) return;
        }
      }
      if (s.index + 1 >= s.queue.length) {
        s.status = 'error';
        s.error = code;
        return;
      }
      item.skipped = 'failed';
      s.index++;
      await this.playOn(s, code);
    }).catch(() => {});
  }
  private async serial<T>(s: Session, work: () => Promise<T>): Promise<T> {
    const pending = s.serial.catch(() => {}).then(work);
    s.serial = pending;
    return pending;
  }
  async command(
    channelId: string,
    lease: MusicLease,
    command: MusicCommand,
  ): Promise<MusicSnapshot> {
    if (command.type === 'stop') {
      const selected = this.sessions.get(channelId);
      if (selected) await this.destroy(selected);
      return this.snapshot(channelId);
    }
    const s = await this.ensure(channelId, lease);
    return this.serial(s, async () => {
      if (this.sessions.get(channelId) !== s) throw new Error('MUSIC_LEASE_EXPIRED');
      await this.options.lease(channelId, s.leaseId);
      let importNotice: MusicSnapshot['importNotice'];
      switch (command.type) {
        case 'add':
        case 'add-list': {
          if (s.queue.length >= 100 || this.pending >= 1) throw new Error('MUSIC_QUEUE_FULL');
          this.pending++;
          try {
            let references: (MusicReference & { spotify?: SpotifyPlaylistTrack })[];
            let url = command.type === 'add' ? command.url : '';
            const shortLink = parseSongLink(url);
            if (shortLink?.provider === 'spotify' && shortLink.kind === 'short')
              url = await (this.options.resolveSpotifyShortLink ?? resolveSpotifyShortLink)(url);
            if (command.type === 'add-list') references = command.tracks.map(playlistReference);
            else if (parseSongLink(url)?.kind === 'playlist') {
              const list = await (this.options.spotifyPlaylist ?? spotifyPlaylist)(url, undefined, {
                partial: true,
              });
              // Played and current tracks stay in the queue, so only the remaining room is usable.
              const fits = Math.min(list.tracks.length, 100 - s.queue.length);
              if (fits < 1) throw new Error('MUSIC_QUEUE_FULL');
              references = list.tracks.slice(0, fits).map(playlistReference);
              const cut = fits < list.tracks.length;
              if (list.truncated || list.skipped || cut)
                importNotice = {
                  added: fits,
                  skipped: list.skipped ?? 0,
                  truncated: !!list.truncated,
                  queueFull: cut,
                };
            } else if (youtubeSource(url))
              references = await (this.options.youtubeReferences ?? youtubeReferences)(url);
            else if (parseSongLink(url)) {
              const song = await (this.options.songMetadata ?? songMetadata)(url);
              references = [
                await (this.options.matchingYouTubeReference ?? matchingYouTubeReference)(song),
              ];
            } else {
              const target = new URL(url);
              if (target.protocol !== 'https:' || target.username || target.password)
                throw new Error('MUSIC_SOURCE_FAILED');
              references = [{ source: url, title: 'Music', durationSec: 0 }];
            }
            await this.options.lease(channelId, s.leaseId);
            if (s.queue.length + references.length > 100) throw new Error('MUSIC_QUEUE_FULL');
            if (this.sessions.get(channelId) !== s) throw new Error('MUSIC_LEASE_EXPIRED');
            const start = async () => {
              // A list plays on past songs it cannot find; a single link reports its failure.
              if (references.some((ref) => ref.spotify)) await this.playOn(s);
              else await this.play(s);
            };
            const firstNew = s.queue.length,
              current = s.queue[s.index],
              finished =
                s.status === 'paused' &&
                !!current &&
                (!!s.ended ||
                  (current.durationSec > 0 && (s.resumePosition ?? 0) >= current.durationSec));
            s.queue.push(...references.map((ref) => ({ ...ref, id: randomUUID() })));
            if (command.playNow || finished) {
              s.index = firstNew;
              await start();
            } else if (s.index === -1) {
              s.index = 0;
              await start();
            } else if (s.status === 'error') {
              s.index++;
              await start();
            }
          } finally {
            this.pending--;
          }
          break;
        }
        case 'select': {
          const index = s.queue.findIndex((item) => item.id === command.id);
          if (index < 0) throw new Error('MUSIC_CURRENT_ITEM');
          s.index = index;
          await this.play(s);
          break;
        }
        case 'reorder': {
          const current = s.queue[s.index]?.id;
          if (
            command.ids.length !== s.queue.length ||
            new Set(command.ids).size !== command.ids.length ||
            command.ids.some((id) => !s.queue.some((item) => item.id === id))
          )
            throw new Error('MUSIC_QUEUE_CHANGED');
          const items = new Map(s.queue.map((item) => [item.id, item]));
          s.queue = command.ids.map((id) => items.get(id)!);
          s.index = current ? s.queue.findIndex((item) => item.id === current) : -1;
          break;
        }
        case 'restore': {
          const previous = await this.options.history?.replay(channelId, command.sessionId);
          if (this.sessions.get(channelId) !== s) throw new Error('MUSIC_LEASE_EXPIRED');
          if (!previous?.sources.length) throw new Error('MUSIC_HISTORY_MISSING');
          const selected = previous.sources
            .map((source, i) => ({ source, track: previous.session.tracks[i]! }))
            .filter((item) => !command.trackId || item.track.id === command.trackId);
          if (!selected.length) throw new Error('MUSIC_HISTORY_MISSING');
          if (s.queue.length + selected.length > 100) throw new Error('MUSIC_QUEUE_FULL');
          const start = s.queue.length;
          s.queue.push(
            ...selected.map(({ source, track }) => ({
              ...(typeof source === 'string' ? { source } : playlistReference(source)),
              title: track.title,
              durationSec: track.durationSec,
              id: randomUUID(),
            })),
          );
          s.index = start;
          await this.play(s);
          break;
        }
        case 'play':
          if (s.index === -1 && s.queue.length) s.index = 0;
          if (s.queue[s.index])
            await this.play(
              s,
              s.ended ||
                (s.queue[s.index]!.durationSec > 0 &&
                  (s.resumePosition ?? 0) >= s.queue[s.index]!.durationSec)
                ? 0
                : Math.min(
                    s.resumePosition ?? s.publisher.position(),
                    (s.queue[s.index]!.durationSec > 0 ? s.queue[s.index]!.durationSec : 7200) -
                      0.01,
                  ),
            );
          break;
        case 'pause':
          s.resumePosition = s.publisher.position();
          s.generation++;
          s.publisher.pause();
          s.status = 'paused';
          s.pausedAt = this.now();
          break;
        case 'seek': {
          const item = s.queue[s.index];
          if (!item || item.id !== command.id) throw new Error('MUSIC_CURRENT_ITEM');
          if (
            item.durationSec <= 0 ||
            !Number.isFinite(command.positionSec) ||
            command.positionSec < 0 ||
            command.positionSec >= item.durationSec
          )
            throw new Error('MUSIC_SEEK_INVALID');
          if (s.status === 'paused') {
            s.resumePosition = command.positionSec;
          } else await this.play(s, command.positionSec);
          break;
        }
        case 'next':
          if (s.index + 1 < s.queue.length) {
            s.index++;
            await this.playOn(s);
          } else {
            s.generation++;
            s.publisher.pause();
            s.status = 'paused';
            s.pausedAt = this.now();
          }
          break;
        case 'previous':
          if (s.index > 0) s.index--;
          await this.play(s);
          break;
        case 'clear': {
          // Everything but the current track, which plays or waits on (a failed one goes too).
          const keep = s.status === 'error' ? undefined : s.queue[s.index];
          if (!keep) {
            s.generation++;
            s.publisher.pause();
            s.status = 'paused';
            s.error = null;
            s.resumePosition = null;
            s.ended = false;
          }
          const removed = s.queue.filter((item) => item !== keep);
          s.queue = keep ? [keep] : [];
          s.index = keep ? 0 : -1;
          for (const old of removed)
            if (old.file) {
              this.bytes -= old.file.bytes;
              await rm(old.file.directory, { recursive: true, force: true });
            }
          break;
        }
        case 'remove': {
          const index = s.queue.findIndex((q) => q.id === command.id);
          // A failed or paused current track can go; the next one waits (paused) in its place.
          if (index === s.index && s.status !== 'error' && s.status !== 'paused')
            throw new Error('MUSIC_CURRENT_ITEM');
          if (index >= 0 && index === s.index) {
            s.generation++;
            s.publisher.pause();
            const [file] = s.queue.splice(index, 1);
            s.index = s.queue.length ? Math.min(index, s.queue.length - 1) : -1;
            s.status = 'paused';
            s.error = null;
            s.resumePosition = null;
            s.ended = false;
            if (file!.file) {
              this.bytes -= file!.file.bytes;
              await rm(file!.file.directory, { recursive: true, force: true });
            }
          } else if (index >= 0) {
            const [file] = s.queue.splice(index, 1);
            if (index < s.index) s.index--;
            if (file!.file) {
              this.bytes -= file!.file.bytes;
              await rm(file!.file.directory, { recursive: true, force: true });
            }
          }
          break;
        }
      }
      await this.archive(s);
      return { ...this.snapshot(channelId), ...(importNotice ? { importNotice } : {}) };
    });
  }
}
