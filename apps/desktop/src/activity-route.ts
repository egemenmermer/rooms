import { openRoomActivity } from './MusicDJ';
import type { RoomSnapshot } from '../../../packages/activity-protocol/src/index';

type ActivityKind = NonNullable<RoomSnapshot['primary']>['activity'];

/**
 * The retired room cinema: YouTube watch-together and the own-file session. Older desktop
 * clients and the iPhone room player can still start them, but this client has no page for
 * them, so it explains them and lets the host end them instead.
 */
export const retiredActivity = (kind: ActivityKind) => kind === 'cinema' || kind === 'youtube';

/** Where a running primary activity is shown in this client; null when it has no page here. */
export function activityRoute(kind: ActivityKind): string | null {
  if (retiredActivity(kind)) return null;
  return kind === 'hall' ? '/cinema' : kind === 'screen' ? '/voice?view=share' : '/games';
}

/** Opens a running activity, or the launcher that explains one this client cannot show. */
export function openActivity(kind: ActivityKind, navigate: (path: string) => void) {
  const path = activityRoute(kind);
  if (path) openRoomActivity(path, navigate);
  else window.dispatchEvent(new Event('rooms:open-activity-launcher'));
}
