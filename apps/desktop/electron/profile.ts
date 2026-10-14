import { join } from 'node:path';
/** A malformed isolated profile must never fall back to the owner's default data. */
export function isolatedProfilePath(appData: string, profile: string | undefined): string | null {
  if (profile === undefined) return null;
  if (!/^[a-zA-Z0-9-]{1,40}$/.test(profile))
    throw new Error('Invalid ROOMS_PROFILE; refusing to open the default profile.');
  return join(appData, 'ROOMS', profile);
}
