import { AgentAutomationSurface, type AgentAutomationProps } from '../AgentAutomation';
import type { AgentAuthoritySnapshot } from '@rooms/agent-contracts';
import { sample, people, places } from './sample';
export const S63_VARIANTS = ['default', 'confirm', 'enabled', 'readonly'] as const;
/** Development data only. No native bridge or service callback is supplied. */
export function getS63Fixture(variant: string): AgentAutomationProps {
  if (!S63_VARIANTS.includes(variant as (typeof S63_VARIANTS)[number]))
    throw new Error(`Unsupported S63 variant: ${variant}`);
  const userId = 'demo-deniz',
    roomId = 'demo-channel-genel',
    canManage = variant !== 'readonly',
    yolo = variant === 'enabled';
  const authority: AgentAuthoritySnapshot = {
    userId,
    roomId,
    canManage,
    yolo,
    principals: [
      { userId, canManage: true, canStart: true },
      { userId: 'demo-ece', canManage: false, canStart: true },
    ],
    scopes: [
      { kind: 'github', read: true, write: true, resources: ['film-night-notes'] },
      {
        kind: 'drive',
        read: true,
        write: true,
        resources: [sample('Film-gecesi-plani', 'Movie-night-plan')],
      },
    ],
    discord: { state: 'not-configured', mentionOnly: true, mappings: [] },
    permissionsMutable: false,
    configurationSource: 'server-admin',
  };
  return {
    userId,
    roomId,
    roomName: places.community,
    channelName: places.general,
    actorName: people.deniz,
    names: { [userId]: people.deniz, 'demo-ece': people.ece },
    status: {
      configured: true,
      connected: true,
      userId,
      canManage,
      yolo,
      executionHost: 'separate-server',
      capabilities: [],
    },
    authority,
    audit: {
      scope: 'own',
      roomId: null,
      limited: false,
      entries: [
        {
          at: yolo ? '2026-10-08T18:10:00Z' : '2026-10-08T16:30:00Z',
          userId,
          action: yolo ? 'yolo-enabled' : 'yolo-disabled',
          roomId: null,
          taskId: null,
        },
      ],
    },
    onRefresh: async () => {},
    fixture: true,
    fixtureView: variant as (typeof S63_VARIANTS)[number],
  };
}
export default function S63AutomationEntry() {
  return (
    <AgentAutomationSurface
      {...getS63Fixture(new URLSearchParams(window.location.search).get('variant') || 'default')}
    />
  );
}
