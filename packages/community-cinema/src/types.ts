// Public shapes the cinema service sends to members. Nothing here carries a
// provider URL, username or password: items use opaque refs and artwork uses
// opaque ids that the service resolves.

export type CatalogKind = 'live' | 'movie' | 'series';

/** Opaque catalog reference, also used in activity queue items. */
export const CINEMA_REF_PATTERN = /^[a-z]-[A-Za-z0-9_-]{1,120}$/;

export type CinemaCategory = {
  id: string;
  kind: CatalogKind;
  /** Label without the country marker; `flag` holds the emoji when known. */
  label: string;
  flag: string | null;
  count: number;
};

export type CinemaItem = {
  ref: string;
  kind: CatalogKind;
  title: string;
  /** Quality badges parsed from the provider name (`FHD`, `4K`, `H265`…). */
  badges: string[];
  categoryId: string | null;
  number: number | null;
  /** Opaque artwork id for `/art/:id`, or null. */
  art: string | null;
  year: number | null;
  /** 0–10. */
  rating: number | null;
  /** Epoch ms when the provider added it. */
  addedAt: number | null;
  /** Live: whether a guide is matched. */
  hasGuide: boolean;
};

export type CinemaProgramme = {
  start: number;
  stop: number;
  title: string;
  subTitle: string | null;
  description: string | null;
  category: string | null;
};

export type CinemaEpisode = {
  ref: string;
  season: number;
  episode: number;
  title: string;
  plot: string | null;
  durationSec: number | null;
  art: string | null;
};

export type CinemaDetails = {
  item: CinemaItem;
  plot: string | null;
  genre: string | null;
  cast: string | null;
  director: string | null;
  durationSec: number | null;
  backdrop: string | null;
  seasons: { season: number; episodes: CinemaEpisode[] }[];
  /** The same title listed in other qualities (its own badges are on `item`). */
  versions?: { ref: string; badges: string[] }[];
};

export type CinemaImportStep =
  'connecting' | 'live' | 'movies' | 'series' | 'guide' | 'completed' | 'failed';

export type CinemaImportProgress = {
  step: CinemaImportStep;
  counts: { live: number; movies: number; series: number; programmes: number };
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
};

export type CinemaStatus = {
  communityId: string;
  hallChannelId: string | null;
  isOwner: boolean;
  connected: boolean;
  source: {
    kind: 'xtream' | 'm3u';
    /** Masked server (`https://dom***:8080`). Owner only. */
    label: string | null;
    hasCustomGuide: boolean;
  } | null;
  account: {
    status: string | null;
    expiresAt: number | null;
    maxConnections: number | null;
  } | null;
  catalog: {
    live: number;
    movies: number;
    series: number;
    programmes: number;
    importedAt: number | null;
    guideImportedAt: number | null;
  };
  importing: CinemaImportProgress | null;
  /** Streams the server may relay at once. */
  relaySlots: number;
};

export type CinemaWatch = {
  /** Relay session id; the desktop maps it to `rooms-cinema://<session>/index.m3u8`. */
  session: string;
  ticket: string;
  expiresAt: number;
  itemRef: string;
  live: boolean;
  /** Seconds; VOD only. */
  durationSec: number | null;
  /** VOD: the position the relay started from. */
  offsetSec: number;
  epoch: number;
  /** Ticket lifetime from issue, so clients renew by their own clock. */
  ttlMs: number;
  /**
   * EXT-X-PROGRAM-DATE-TIME (epoch ms) of relay output time 0, or null while unknown.
   * Work position = offsetSec + (playing date − originPdtMs) / 1000, for live and VOD.
   */
  originPdtMs: number | null;
  /** The source's audio streams (`index` = position among them) and the one relayed. */
  audioTracks: CinemaAudioTrack[];
  audioTrack: number | null;
  /**
   * VOD text subtitles; each viewer picks their own. The desktop maps `index` to
   * `rooms-cinema://stream/<session>/sub<index>.vtt`, timed on the work's timeline.
   */
  subtitleTracks: CinemaSubtitleTrack[];
};

export type CinemaAudioTrack = { index: number; label: string };

export type CinemaSubtitleTrack = {
  index: number;
  label: string;
  /** ISO 639 code from the stream's tag (`tur`, `tr`, `eng` …), or null. */
  language: string | null;
  /** Signs and foreign-dialogue only. */
  forced: boolean;
};
