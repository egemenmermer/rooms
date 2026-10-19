import { parseInviteLink as parseSharedInviteLink, type InviteLink } from '@rooms/social';
export type { InviteLink };
/** OS-delivered links carry their own server; bare tokens are never accepted here. */
export function parseInviteLink(raw: string): InviteLink | null {
  return parseSharedInviteLink(raw);
}
