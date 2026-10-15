import { spotifyPlaylist } from './spotify-playlist';
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
type Entry = MusicReference & { id: string; file?: MusicFile; spotify?: SpotifyPlaylistTrack };
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
        s?.queue.map(({ id, title, durationSec, requestedProvider }) => ({
          id,
          title: requestedProvider ? `${title.slice(0, 140)} · YouTube` : title,
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
          } catch {
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
        await this.play(s);
      } else {
        s.status = 'paused';
        s.pausedAt = this.now();
        s.resumePosition = item.durationSec || s.publisher.position();
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
    try {
      if (item.spotify && !youtubeSource(item.source)) {
        const ref = await (this.options.matchingYouTubeReference ?? matchingYouTubeReference)({
          provider: 'spotify',
          title: item.spotify.title,
          artists: item.spotify.artists,
          durationSec: item.spotify.durationSec,
        });
        if (this.sessions.get(s.channelId) !== s || generation !== s.generation) return;
        await this.options.lease(s.channelId, s.leaseId);
        if (this.sessions.get(s.channelId) !== s || generation !== s.generation) return;
        Object.assign(item, ref);
      }
      if (youtubeSource(item.source) && s.publisher.playYouTube) {
        await s.publisher.playYouTube(
          item.source,
          Math.max(0, position),
          () => this.ended(s, item, generation),
          (error) => {
            if (this.sessions.get(s.channelId) === s && generation === s.generation) {
              s.status = 'error';
              s.error =
                error && /^MUSIC_[A-Z_]+$/.test(error.message)
                  ? error.message
                  : 'MUSIC_DECODE_FAILED';
            }
          },
        );
        if (
          this.sessions.get(s.channelId) === s &&
          generation === s.generation &&
          s.status === 'connecting'
        ) {
          s.status = 'playing';
          s.pausedAt = null;
          s.played.add(item.id);
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
        () => {
          if (this.sessions.get(s.channelId) === s && generation === s.generation) {
            s.status = 'error';
            s.error = 'MUSIC_DECODE_FAILED';
          }
        },
      );
      if (this.sessions.get(s.channelId) === s && generation === s.generation) {
        s.played.add(item.id);
        await this.archive(s);
      }
    } catch (error) {
      if (this.sessions.get(s.channelId) === s && generation === s.generation) {
        s.status = 'error';
        s.error =
          error instanceof Error && /^MUSIC_[A-Z_]+$/.test(error.message)
            ? error.message
            : 'MUSIC_SOURCE_FAILED';
      }
      throw error;
    }
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
      switch (command.type) {
        case 'add':
        case 'add-list': {
          if (s.queue.length >= 100 || this.pending >= 1) throw new Error('MUSIC_QUEUE_FULL');
          this.pending++;
          try {
            let references: (MusicReference & { spotify?: SpotifyPlaylistTrack })[];
            if (command.type === 'add-list') references = command.tracks.map(playlistReference);
            else if (parseSongLink(command.url)?.kind === 'playlist')
              references = (
                await (this.options.spotifyPlaylist ?? spotifyPlaylist)(command.url)
              ).tracks.map(playlistReference);
            else if (youtubeSource(command.url))
              references = await (this.options.youtubeReferences ?? youtubeReferences)(command.url);
            else if (parseSongLink(command.url)) {
              const song = await (this.options.songMetadata ?? songMetadata)(command.url);
              references = [
                await (this.options.matchingYouTubeReference ?? matchingYouTubeReference)(song),
              ];
            } else {
              const url = new URL(command.url);
              if (url.protocol !== 'https:' || url.username || url.password)
                throw new Error('MUSIC_SOURCE_FAILED');
              references = [{ source: command.url, title: 'Music', durationSec: 0 }];
            }
            await this.options.lease(channelId, s.leaseId);
            if (s.queue.length + references.length > 100) throw new Error('MUSIC_QUEUE_FULL');
            if (this.sessions.get(channelId) !== s) throw new Error('MUSIC_LEASE_EXPIRED');
            const start = async () => {
              if (references.some((ref) => ref.spotify)) await this.play(s).catch(() => {});
              else await this.play(s);
            };
            const firstNew = s.queue.length,
              current = s.queue[s.index],
              finished =
                s.status === 'paused' &&
                !!current &&
                current.durationSec > 0 &&
                (s.resumePosition ?? 0) >= current.durationSec;
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
              s.queue[s.index]!.durationSec > 0 &&
                (s.resumePosition ?? 0) >= s.queue[s.index]!.durationSec
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
            await this.play(s);
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
        case 'remove': {
          const index = s.queue.findIndex((q) => q.id === command.id);
          if (index === s.index) throw new Error('MUSIC_CURRENT_ITEM');
          if (index >= 0) {
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
      return this.snapshot(channelId);
    });
  }
}
