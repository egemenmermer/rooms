// The renderer ↔ Electron main contract for the community cinema. The main
// process holds the Stoat token, calls the cinema service and serves relay
// playlists, segments and artwork on the `rooms-cinema:` scheme, so the
// renderer never sees a ticket, a token or a provider URL.
import type {
  CatalogKind,
  CinemaCategory,
  CinemaDetails,
  CinemaItem,
  CinemaProgramme,
  CinemaStatus,
} from './types';

export const CINEMA_SCHEME = 'rooms-cinema';

/** Artwork for an item (`CinemaItem.art`, `CinemaDetails.backdrop`). */
export const cinemaArtUrl = (hallId: string, artId: string) =>
  `${CINEMA_SCHEME}://art/${encodeURIComponent(hallId)}/${encodeURIComponent(artId)}`;

export type CinemaSourceInput =
  | {
      kind: 'xtream';
      server: string;
      username: string;
      password: string;
      /** null = the provider's own guide, '' = no guide, else a custom XMLTV URL. */
      guideUrl: string | null;
    }
  | { kind: 'm3u'; url: string; guideUrl: string | null };

export type CinemaItemsQuery = {
  kind: CatalogKind;
  categoryId?: string | null;
  sort?: 'default' | 'name' | 'added' | 'rating';
  offset?: number;
  limit?: number;
};

export type CinemaPage = { items: CinemaItem[]; total: number };

export type CinemaWatchSource = {
  /** `rooms-cinema://stream/<session>/index.m3u8`, playable with hls.js. */
  src: string;
  itemRef: string;
  live: boolean;
  durationSec: number | null;
  /** VOD: the relay's first segment starts at this position of the work. */
  offsetSec: number;
  /** Changes whenever the relay restarts (seek, new item); reload the player then. */
  epoch: number;
  /**
   * PROGRAM-DATE-TIME (epoch ms) of relay output time 0, or null. Every relay playlist
   * carries EXT-X-PROGRAM-DATE-TIME, so the work position is
   * `offsetSec + (hls.playingDate − originPdtMs) / 1000` — independent of where hls.js
   * starts its own timeline.
   */
  originPdtMs: number | null;
};

/** Error messages the bridge rejects with; the UI maps them to Turkish copy. */
export type CinemaErrorCode =
  | 'CINEMA_UNAVAILABLE'
  | 'CINEMA_OWNER_REQUIRED'
  | 'CINEMA_HALL_REQUIRED'
  | 'CINEMA_ACCESS_DENIED'
  | 'CINEMA_NOT_CONNECTED'
  | 'CINEMA_SOURCE_INVALID'
  | 'CINEMA_PROVIDER_DENIED'
  | 'CINEMA_PROVIDER_UNREACHABLE'
  | 'CINEMA_ACCOUNT_EXPIRED'
  | 'CINEMA_IMPORT_RUNNING'
  | 'CINEMA_ITEM_NOT_FOUND'
  | 'CINEMA_NOTHING_SELECTED'
  | 'CINEMA_RELAY_BUSY'
  | 'CINEMA_CODEC_UNSUPPORTED'
  | 'CINEMA_STREAM_FAILED'
  /** The relay session ended (the hall moved on or it went idle); call watch() again. */
  | 'CINEMA_SESSION_ENDED'
  | 'CINEMA_RATE_LIMITED';

export interface CinemaBridge {
  status(communityId: string): Promise<CinemaStatus>;
  /** Owner: choose (or clear) the hall channel. */
  setHall(communityId: string, channelId: string | null): Promise<CinemaStatus>;
  /** Owner: verify and store the server IPTV account, then import its catalog. */
  connect(communityId: string, source: CinemaSourceInput): Promise<CinemaStatus>;
  /** Owner: remove the account; stops every relay and wipes the catalog. */
  disconnect(communityId: string): Promise<CinemaStatus>;
  reload(communityId: string, scope: 'all' | 'guide'): Promise<CinemaStatus>;
  categories(hallId: string, kind: CatalogKind): Promise<CinemaCategory[]>;
  items(hallId: string, query: CinemaItemsQuery): Promise<CinemaPage>;
  search(hallId: string, text: string, kinds?: CatalogKind[]): Promise<CinemaItem[]>;
  /** Programmes overlapping [fromMs, toMs) per live item ref. */
  guide(
    hallId: string,
    refs: string[],
    fromMs: number,
    toMs: number,
  ): Promise<Record<string, CinemaProgramme[]>>;
  details(hallId: string, ref: string): Promise<CinemaDetails>;
  /** A playable source for the hall's current queue item (relayed by the server). */
  watch(hallId: string): Promise<CinemaWatchSource>;
}
