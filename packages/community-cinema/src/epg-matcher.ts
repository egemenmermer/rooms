// Matches catalog channels to XMLTV channels. Ported from Kanal's
// `lib/data/epg/epg_matcher.dart`.
import { normalizeChannelName } from './normalize';

/** An XMLTV channel: its `id` and every `<display-name>` (primary first). */
export type EpgChannelRef = { id: string; displayNames: readonly string[] };

export type EpgMatchMethod = 'custom' | 'exactId' | 'caseInsensitiveId' | 'normalizedName' | 'none';

export type EpgMatchResult = { epgId: string | null; method: EpgMatchMethod };

export const noEpgMatch: EpgMatchResult = { epgId: null, method: 'none' };

/**
 * Resolves the EPG channel of a catalog channel, in this order: the custom
 * assignment (kept even when this XMLTV does not declare it), exact
 * `tvg-id`/`epg_channel_id`, case-insensitive id, normalized channel name
 * against every display name, no match. When several EPG channels share a
 * key, the first declared one wins.
 */
export class EpgMatcher {
  private readonly ids = new Set<string>();
  private readonly lowerIds = new Map<string, string>();
  private readonly names = new Map<string, string>();

  constructor(channels: Iterable<EpgChannelRef>) {
    for (const channel of channels) {
      const id = channel.id;
      if (!id) continue;
      this.ids.add(id);
      const lower = id.trim().toLowerCase();
      if (!this.lowerIds.has(lower)) this.lowerIds.set(lower, id);
      for (const name of channel.displayNames) {
        const key = normalizeChannelName(name);
        if (key && !this.names.has(key)) this.names.set(key, id);
      }
    }
  }

  /** Number of distinct EPG channel ids. */
  get channelCount() {
    return this.ids.size;
  }

  match(input: { customEpgId?: string | null; tvgId?: string | null; name: string }) {
    return this.matchDetailed(input).epgId;
  }

  matchDetailed({
    customEpgId,
    tvgId,
    name,
  }: {
    customEpgId?: string | null;
    tvgId?: string | null;
    name: string;
  }): EpgMatchResult {
    const custom = customEpgId?.trim();
    if (custom) {
      const resolved = this.ids.has(custom)
        ? custom
        : (this.lowerIds.get(custom.toLowerCase()) ?? custom);
      return { epgId: resolved, method: 'custom' };
    }
    if (tvgId) {
      if (this.ids.has(tvgId)) return { epgId: tvgId, method: 'exactId' };
      const lower = tvgId.trim().toLowerCase();
      const byCase = lower ? this.lowerIds.get(lower) : undefined;
      if (byCase) return { epgId: byCase, method: 'caseInsensitiveId' };
    }
    const key = normalizeChannelName(name);
    const byName = key ? this.names.get(key) : undefined;
    return byName ? { epgId: byName, method: 'normalizedName' } : noEpgMatch;
  }
}
