import {
  SOCIAL_ROLE_PERMISSION_KEYS,
  type SocialCommunityManagement,
  type SocialManagedMember,
} from '@rooms/social';
import { inheritedRolePermissions } from '../CommunityRoles';
import type { CommunityManagementFixture } from '../CommunityManagementSurface';
import { getReferenceAvatar } from './reference-fixtures';
import { sample, people } from './sample';

export const COMMUNITY_MANAGEMENT_FIXTURE_VARIANTS = [
  'default',
  'role',
  'remove',
  'invites',
  'invite',
  'invite_created',
  'revoke',
  'permission',
] as const;
export type CommunityManagementFixtureVariant =
  (typeof COMMUNITY_MANAGEMENT_FIXTURE_VARIANTS)[number];

export interface CommunityManagementFixtureMetadata {
  screenId: 'S68';
  variant: CommunityManagementFixtureVariant;
  integration_status: 'LOCAL_FIXTURE';
  demo: true;
  label: string;
  /** False means no safe component projection exists for the requested original state. */
  renderable: boolean;
  unsupportedReason: string | null;
  originalPath: string;
  spaceId: 'demo-bizim-oda';
  ownerId: 'demo-deniz';
  avatarPaths: Record<string, string | null>;
}

const memberKeys = ['deniz', 'ece', 'can', 'zeynep', 'mert'] as const;
const moderatorRole = 'demo-role-moderator';
const memberRole = 'demo-role-member';
const brokerReason = sample(
  'Tayfa davet aracısında yetkili davet listeleme ve iptal etme yöntemi henüz uygulanmadı.',
  'The Tayfa invitation broker does not implement authorized invitation listing and revocation yet.',
);
const unsupported: Partial<Record<CommunityManagementFixtureVariant, string>> = {
  invites:
    'The safe invitations tab shows the actual unsupported broker capability; the original active invitation rows are not fabricated.',
  invite:
    'The reference expiry, usage-limit and joining-role invitation modal has no corresponding broker capability yet.',
  invite_created:
    'No broker operation was performed. A created invitation ticket, secret or success state cannot be fabricated.',
  revoke:
    'Authorized broker invitation listing and revocation are not implemented; no sample revocation operation is exposed.',
};

function checkedVariant(value: string): CommunityManagementFixtureVariant {
  if (!import.meta.env.DEV)
    throw new Error('Community management fixtures are available only in development.');
  const variant = value.trim().toLowerCase() || 'default';
  if (!COMMUNITY_MANAGEMENT_FIXTURE_VARIANTS.some((item) => item === variant)) {
    throw new Error(`Unsupported S68 community management fixture variant: ${value}`);
  }
  return variant as CommunityManagementFixtureVariant;
}

/** Pure local metadata. This function does not install a runtime or access a native account. */
export function getCommunityManagementFixtureMetadata(
  value: string,
): CommunityManagementFixtureMetadata {
  const variant = checkedVariant(value);
  return {
    screenId: 'S68',
    variant,
    integration_status: 'LOCAL_FIXTURE',
    demo: true,
    label: sample(
      'DEMO · Yerel topluluk yönetimi örneği',
      'DEMO · Local community management sample',
    ),
    renderable: !['invite', 'invite_created', 'revoke'].includes(variant),
    unsupportedReason: unsupported[variant] ?? null,
    originalPath: `<ROOMS_REFERENCE_ROOT>/04_screens/S68_community_management${variant === 'default' ? '' : `__${variant}`}.png`,
    spaceId: 'demo-bizim-oda',
    ownerId: 'demo-deniz',
    avatarPaths: Object.fromEntries(
      memberKeys.map((key) => {
        const id = `demo-${key}`;
        return [id, getReferenceAvatar(id)];
      }),
    ),
  };
}

function snapshot(permissionDenied: boolean): SocialCommunityManagement {
  const members: SocialManagedMember[] = permissionDenied
    ? []
    : memberKeys.map((key) => {
        const name = people[key];
        const username = name.toLowerCase();
        const owner = key === 'deniz';
        return {
          user: { id: `demo-${key}`, username, displayName: name, avatar: null },
          status: key === 'mert' ? 'invisible' : 'online',
          statusText: key === 'ece' ? sample('Cinema’da', 'In Cinema') : null,
          roles: owner ? [] : [key === 'ece' ? moderatorRole : memberRole],
          canAssignRoles: !owner,
          canRemove: !owner,
        };
      });
  return {
    spaceId: 'demo-bizim-oda',
    access: permissionDenied ? 'denied' : 'allowed',
    capabilities: {
      manageServer: !permissionDenied,
      manageChannels: !permissionDenied,
      manageRoles: !permissionDenied,
      managePermissions: !permissionDenied,
      assignRoles: !permissionDenied,
      kickMembers: !permissionDenied,
    },
    grantablePermissions: permissionDenied ? [] : [...SOCIAL_ROLE_PERMISSION_KEYS],
    roles: permissionDenied
      ? []
      : [
          {
            id: moderatorRole,
            name: sample('Moderatör', 'Moderator'),
            rank: 10,
            assignable: true,
            editable: true,
            permissionsEditable: true,
            color: '#e8aa63',
            permissions: inheritedRolePermissions(),
          },
          {
            id: memberRole,
            name: sample('Kanka', 'Buddy'),
            rank: 20,
            assignable: true,
            editable: true,
            permissionsEditable: true,
            color: '#9b8afb',
            permissions: inheritedRolePermissions(),
          },
        ],
    members,
    invites: {
      source: 'rooms-broker',
      state: 'unsupported',
      managementSupported: false,
      reason: brokerReason,
    },
    concurrency: 'last-write-wins',
  };
}

/** Fresh read-only projection for the existing explicit DEV component boundary. No native calls or writes. */
export function getCommunityManagementFixture(value: string): CommunityManagementFixture {
  const metadata = getCommunityManagementFixtureMetadata(value);
  if (!metadata.renderable)
    throw new Error(`Unsupported S68/${metadata.variant}: ${metadata.unsupportedReason}`);
  return {
    snapshot: snapshot(metadata.variant === 'permission'),
    tab: metadata.variant === 'invites' ? 'invites' : 'members',
    ...(metadata.variant === 'role' ? { dialog: 'role' as const, memberId: 'demo-ece' } : {}),
    ...(metadata.variant === 'remove' ? { dialog: 'remove' as const, memberId: 'demo-mert' } : {}),
  };
}
