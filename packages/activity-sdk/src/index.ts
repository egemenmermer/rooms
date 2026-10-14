import type { ActivityManifest, ActivitySession, ActivityState } from '@rooms/contracts';
export const activityRegistry: ActivityManifest[] = [
  {
    id: 'cinema',
    version: 1,
    label: 'Cinema',
    category: 'watch',
    kind: 'shared-player',
    capabilities: ['timeline', 'queue', 'voice', 'participants'],
    supportedPlatforms: ['macos', 'windows'],
    availability: 'local',
    description: 'An immersive place for movie night. Local playback ready.',
  },
  {
    id: 'youtube',
    version: 1,
    label: 'YouTube Together',
    category: 'watch',
    kind: 'shared-player',
    capabilities: ['timeline', 'queue', 'host-control'],
    supportedPlatforms: ['macos', 'windows'],
    availability: 'requires-setup',
    description: 'Official player + Activity service required. Not connected.',
  },
  {
    id: 'screen',
    version: 1,
    label: 'Screen Share',
    category: 'share',
    kind: 'live-stream',
    capabilities: ['voice', 'participants'],
    supportedPlatforms: ['macos', 'windows'],
    availability: 'requires-setup',
    description: 'Requires a configured media server and capture permissions.',
  },
  {
    id: 'iptv',
    version: 1,
    label: 'Live TV',
    category: 'watch',
    kind: 'live-stream',
    capabilities: ['voice'],
    supportedPlatforms: ['macos', 'windows'],
    availability: 'requires-setup',
    description: 'Your own authorized source. Personal connections coming in M5.',
  },
  {
    id: 'poll',
    version: 1,
    label: 'Quick Poll',
    category: 'together',
    kind: 'collaborative',
    capabilities: ['participants'],
    supportedPlatforms: ['macos', 'windows'],
    availability: 'local',
    description: 'Decide what is next. A working local Activity example.',
  },
  {
    id: 'quiz',
    version: 1,
    label: 'Trivia Night',
    category: 'play',
    kind: 'game',
    capabilities: ['participants'],
    supportedPlatforms: ['macos', 'windows'],
    availability: 'later',
    description: 'A little friendly competition. Coming later.',
  },
  {
    id: 'tier',
    version: 1,
    label: 'Tier List',
    category: 'play',
    kind: 'collaborative',
    capabilities: ['participants'],
    supportedPlatforms: ['macos', 'windows'],
    availability: 'later',
    description: 'Settle the debate. Coming later.',
  },
  {
    id: 'whiteboard',
    version: 1,
    label: 'Whiteboard',
    category: 'together',
    kind: 'collaborative',
    capabilities: ['participants'],
    supportedPlatforms: ['macos', 'windows'],
    availability: 'later',
    description: 'Room for your ideas. Coming later.',
  },
];
const transitions: Record<ActivityState, ActivityState[]> = {
  idle: ['preparing'],
  preparing: ['live', 'error', 'ended'],
  live: ['paused', 'recovering', 'ended', 'error'],
  paused: ['live', 'ended', 'error'],
  recovering: ['live', 'paused', 'ended', 'error'],
  ended: [],
  error: ['preparing', 'ended'],
};
export function transitionSession(session: ActivitySession, next: ActivityState): ActivitySession {
  if (!transitions[session.state].includes(next))
    throw new Error(`Invalid Activity transition: ${session.state} → ${next}`);
  return { ...session, state: next, revision: session.revision + 1 };
}
export function castVote(
  session: ActivitySession,
  userId: string,
  optionId: string,
): ActivitySession {
  if (session.payload.type !== 'poll' || session.state !== 'live')
    throw new Error('This poll is not open.');
  if (!session.payload.options.some((option) => option.id === optionId))
    throw new Error('Unknown poll option.');
  return {
    ...session,
    revision: session.revision + 1,
    payload: { ...session.payload, votes: { ...session.payload.votes, [userId]: optionId } },
  };
}
