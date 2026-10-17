import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SOCIAL_ID_PATTERN } from '@rooms/social';
import type { XtreamAccount } from '../../../packages/community-cinema/src/xtream';
import type { SecureFiles } from './secure-file';

const id = z.string().regex(SOCIAL_ID_PATTERN);
const httpUrl = z
  .string()
  .max(2048)
  .url()
  .refine((value) => /^https?:\/\//i.test(value) && !new URL(value).username, 'HTTP(S) only');

/** Guide source: null = the provider's own (Xtream `xmltv.php`, M3U `url-tvg`), '' = off. */
const guideUrl = z.union([httpUrl, z.literal('')]).nullable();

export const sourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('xtream'),
      server: httpUrl,
      username: z.string().min(1).max(200),
      password: z.string().min(1).max(200),
      guideUrl,
    })
    .strict(),
  z.object({ kind: z.literal('m3u'), url: httpUrl, guideUrl }).strict(),
]);

export type CinemaSource = z.infer<typeof sourceSchema>;

export type CommunityConfig = {
  version: 1;
  communityId: string;
  hallChannelId: string | null;
  source: CinemaSource | null;
  account: XtreamAccount | null;
  connectedAt: number | null;
  connectedBy: string | null;
  /** Streams relayed at once; never more than the account allows. */
  relaySlots: number;
};

/**
 * One encrypted file per community under `<dir>/communities/`. Configs are
 * small and read at startup, so the hall → community index stays in memory.
 */
export class ConfigStore {
  private readonly configs = new Map<string, CommunityConfig>();

  constructor(
    private readonly directory: string,
    private readonly files: SecureFiles,
  ) {
    let names: string[] = [];
    try {
      names = readdirSync(this.folder);
    } catch {
      names = [];
    }
    for (const name of names) {
      const match = /^(.+)\.enc$/.exec(name);
      if (!match || !id.safeParse(match[1]).success) continue;
      const config = this.files.read<CommunityConfig>(join(this.folder, name));
      if (config?.communityId === match[1]) this.configs.set(config.communityId, config);
    }
  }

  private get folder() {
    return join(this.directory, 'communities');
  }

  get(communityId: string): CommunityConfig {
    return (
      this.configs.get(communityId) ?? {
        version: 1,
        communityId,
        hallChannelId: null,
        source: null,
        account: null,
        connectedAt: null,
        connectedBy: null,
        relaySlots: 1,
      }
    );
  }

  communityOfHall(channelId: string) {
    for (const config of this.configs.values())
      if (config.hallChannelId === channelId) return config.communityId;
    return null;
  }

  all() {
    return [...this.configs.values()];
  }

  update(communityId: string, change: (config: CommunityConfig) => CommunityConfig) {
    id.parse(communityId);
    const next = change(structuredClone(this.get(communityId)));
    this.files.write(join(this.folder, `${communityId}.enc`), next);
    this.configs.set(communityId, next);
    return next;
  }
}
