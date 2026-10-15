import { isPlaylistLink } from '../../../packages/shared-contracts/src/music-playlists';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCommunity } from './community';
import { queryClient } from './query-client';
import { uiError } from './i18n';
import { parseDJLink } from '../../../packages/shared-contracts/src/music-links';
import type { MusicCommand } from '../../../packages/shared-contracts/src/music';
import type {
  PlaylistChange,
  SharedPlaylist,
  PlaylistTrack,
} from '../../../packages/shared-contracts/src/music-playlists';
export const playlistsKey = (server: string, user: string | undefined, channel: string) => [
  'shared-music-playlists',
  server,
  user,
  channel,
];
export function SharedPlaylists({
  channelId,
  canPlay,
  play,
}: {
  channelId: string;
  canPlay: boolean;
  play(command: MusicCommand): Promise<void>;
}) {
  const c = useCommunity(),
    scope = `${c.serverUrl}:${c.user?.id}:${channelId}`,
    current = useRef(scope),
    mounted = useRef(true);
  current.current = scope;
  const [editing, setEditing] = useState<SharedPlaylist | null>(null),
    [name, setName] = useState(''),
    [tracks, setTracks] = useState<PlaylistTrack[]>([]),
    [url, setURL] = useState(''),
    [title, setTitle] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const key = playlistsKey(c.serverUrl, c.user?.id, channelId);
  const lists = useQuery(
    {
      queryKey: key,
      queryFn: () => window.rooms!.music.playlists(channelId),
      enabled: !!window.rooms?.music.playlists,
      retry: false,
      refetchOnWindowFocus: false,
    },
    queryClient,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = (item: SharedPlaylist | null) => {
    setEditing(item);
    setName(item?.name ?? '');
    setTracks(item?.tracks ?? []);
    setError('');
  };
  const save = async (change: PlaylistChange) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const captured = scope;
    try {
      const value = await window.rooms!.music.changePlaylist(channelId, change);
      if (!mounted.current || current.current !== captured) return;
      queryClient.setQueryData(key, value);
      choose(change.op === 'remove' ? null : (value[0] ?? null));
    } catch (e) {
      if (mounted.current && current.current === captured) {
        setError(uiError(e));
        void lists.refetch();
      }
    } finally {
      if (mounted.current && current.current === captured) setBusy(false);
    }
  };
  const move = (index: number, delta: number) => {
    const next = [...tracks];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setTracks(next);
  };
  const append = () => {
    const link = parseDJLink(url);
    if (link?.kind !== 'video') {
      setError('Tek bir YouTube parçası bağlantısı gir.');
      return;
    }
    if (tracks.length >= 100) {
      setError('Bir listeye en fazla 100 parça eklenebilir.');
      return;
    }
    setTracks([
      ...tracks,
      { videoId: link.id, title: title.trim() || 'YouTube parçası', durationSec: 0 },
    ]);
    setURL('');
    setTitle('');
    setError('');
  };
  return (
    <section className="dj-playlists" aria-label="Topluluk çalma listeleri">
      <div className="dj-playlist-actions">
        <button onClick={() => choose(null)} disabled={busy}>
          Yeni liste
        </button>
        <button onClick={() => void lists.refetch()} disabled={busy || lists.isFetching}>
          Yenile
        </button>
      </div>
      {lists.isLoading ? (
        <p>Listeler yükleniyor…</p>
      ) : lists.error ? (
        <p role="alert">{uiError(lists.error)}</p>
      ) : null}
      {lists.data?.map((item) => (
        <button
          className="dj-playlist-choice"
          key={item.id}
          aria-pressed={editing?.id === item.id}
          onClick={() => choose(item)}
          disabled={busy}
        >
          {item.name} <small>{item.tracks.length} parça</small>
        </button>
      ))}
      <label>
        Liste adı
        <input
          aria-label="Liste adı"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="dj-playlist-actions">
        <button
          disabled={busy || !name.trim()}
          onClick={() =>
            void save({
              op: 'save',
              ...(editing ? { id: editing.id, revision: editing.revision } : {}),
              name,
              tracks,
            })
          }
        >
          Listeyi kaydet
        </button>
        <button
          disabled={busy || !name.trim()}
          onClick={() => void save({ op: 'saveQueue', name })}
        >
          Kuyruğu yeni listeye kaydet
        </button>
        {editing && (
          <button
            disabled={busy}
            onClick={() => void save({ op: 'remove', id: editing.id, revision: editing.revision })}
          >
            Listeyi sil
          </button>
        )}
      </div>
      <p>
        Listeler topluluğa ortaktır. YouTube ve herkese açık Spotify listelerini ekleyebilirsin.
        Spotify parçaları YouTube’da eşleştirilerek çalınır. Spotify listesi 100 parçadan az olmalı.
      </p>
      <label>
        YouTube veya Spotify liste bağlantısı
        <input
          aria-label="Listeye eklenecek YouTube veya Spotify bağlantısı"
          value={url}
          maxLength={2048}
          onChange={(e) => setURL(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        Parça adı
        <input
          aria-label="Listeye eklenecek parça adı"
          value={title}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="dj-playlist-actions">
        <button onClick={append} disabled={busy || !url.trim()}>
          Parçayı ekle
        </button>
        <button
          disabled={busy || !name.trim() || !isPlaylistLink(url)}
          onClick={() => void save({ op: 'import', name, url })}
        >
          Listeyi yeni liste olarak aktar
        </button>
      </div>
      <ol>
        {tracks.map((track, index) => (
          <li key={`${index}:${'videoId' in track ? track.videoId : track.spotifyTrackId}`}>
            <span>{track.title}</span>
            <button
              disabled={busy || index === 0}
              aria-label={`${index + 1}. parçayı yukarı taşı`}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              disabled={busy || index === tracks.length - 1}
              aria-label={`${index + 1}. parçayı aşağı taşı`}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              disabled={busy}
              aria-label={`${index + 1}. parçayı listeden çıkar`}
              onClick={() => setTracks(tracks.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <div className="dj-playlist-actions">
        <button
          disabled={!canPlay || busy || !tracks.length}
          onClick={() => void play({ type: 'add-list', tracks })}
        >
          Listeyi kuyruğa ekle
        </button>
        <button
          disabled={!canPlay || busy || !tracks.length}
          onClick={() => void play({ type: 'add-list', tracks, playNow: true })}
        >
          Listeyi şimdi çal
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
