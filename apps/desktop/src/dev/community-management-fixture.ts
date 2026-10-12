import type { SocialCommunityManagement, SocialManagedMember } from '@rooms/social';
import type { CommunityManagementFixture } from '../CommunityManagementSurface';
import { getReferenceAvatar } from './reference-fixtures';

export const COMMUNITY_MANAGEMENT_FIXTURE_VARIANTS = ['default', 'role', 'remove', 'invites', 'invite', 'invite_created', 'revoke', 'permission'] as const;
export type CommunityManagementFixtureVariant = typeof COMMUNITY_MANAGEMENT_FIXTURE_VARIANTS[number];

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

const memberNames = ['Deniz', 'Ece', 'Can', 'Zeynep', 'Mert'] as const;
const moderatorRole = 'demo-role-moderator';
const memberRole = 'demo-role-member';
const brokerReason = 'ROOMS davet aracısında yetkili davet listeleme ve iptal etme yöntemi henüz uygulanmadı.';
const unsupported: Partial<Record<CommunityManagementFixtureVariant, string>> = {
  invites: 'The safe invitations tab shows the actual unsupported broker capability; the original active invitation rows are not fabricated.',
  invite: 'The reference expiry, usage-limit and joining-role invitation modal has no corresponding broker capability yet.',
  invite_created: 'No broker operation was performed. A created invitation ticket, secret or success state cannot be fabricated.',
  revoke: 'Authorized broker invitation listing and revocation are not implemented; no sample revocation operation is exposed.',
};

function checkedVariant(value: string): CommunityManagementFixtureVariant {
  if (!import.meta.env.DEV) throw new Error('Community management fixtures are available only in development.');
  const variant = value.trim().toLowerCase() || 'default';
  if (!COMMUNITY_MANAGEMENT_FIXTURE_VARIANTS.some(item => item === variant)) {
    throw new Error(`Unsupported S68 community management fixture variant: ${value}`);
  }
  return variant as CommunityManagementFixtureVariant;
}

/** Pure local metadata. This function does not install a runtime or access a native account. */
export function getCommunityManagementFixtureMetadata(value: string): CommunityManagementFixtureMetadata {
  const variant = checkedVariant(value);
  return {
    screenId: 'S68', variant, integration_status: 'LOCAL_FIXTURE', demo: true,
    label: 'DEMO · Yerel topluluk yönetimi örneği',
    renderable: !['invite', 'invite_created', 'revoke'].includes(variant),
    unsupportedReason: unsupported[variant] ?? null,
    originalPath: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S68_community_management${variant === 'default' ? '' : `__${variant}`}.png`,
    spaceId: 'demo-bizim-oda', ownerId: 'demo-deniz',
    avatarPaths: Object.fromEntries(memberNames.map(name => {
      const id = `demo-${name.toLowerCase()}`;
      return [id, getReferenceAvatar(id)];
    })),
  };
}

function snapshot(permissionDenied: boolean): SocialCommunityManagement {
  const members: SocialManagedMember[] = permissionDenied ? [] : memberNames.map(name => {
    const username = name.toLowerCase();
    const owner = name === 'Deniz';
    return {
      user: { id: `demo-${username}`, username, displayName: name, avatar: null },
      status: name === 'Mert' ? 'invisible' : 'online',
      statusText: name === 'Ece' ? 'Cinema’da' : null,
      roles: owner ? [] : [name === 'Ece' ? moderatorRole : memberRole],
      canAssignRoles: !owner, canRemove: !owner,
    };
  });
  return {
    spaceId: 'demo-bizim-oda', access: permissionDenied ? 'denied' : 'allowed',
    capabilities: {
      manageServer: !permissionDenied, manageChannels: !permissionDenied,
      manageRoles: !permissionDenied, managePermissions: !permissionDenied,
      assignRoles: !permissionDenied, kickMembers: !permissionDenied,
    },
    roles: permissionDenied ? [] : [
      { id: moderatorRole, name: 'Moderatör', rank: 10, assignable: true },
      { id: memberRole, name: 'Üye', rank: 20, assignable: true },
    ],
    members,
    invites: { source: 'rooms-broker', state: 'unsupported', managementSupported: false, reason: brokerReason },
    concurrency: 'last-write-wins',
  };
}

/** Fresh read-only projection for the existing explicit DEV component boundary. No native calls or writes. */
export function getCommunityManagementFixture(value: string): CommunityManagementFixture {
  const metadata = getCommunityManagementFixtureMetadata(value);
  if (!metadata.renderable) throw new Error(`Unsupported S68/${metadata.variant}: ${metadata.unsupportedReason}`);
  return {
    snapshot: snapshot(metadata.variant === 'permission'),
    tab: metadata.variant === 'invites' ? 'invites' : 'members',
    ...(metadata.variant === 'role' ? { dialog: 'role' as const, memberId: 'demo-ece' } : {}),
    ...(metadata.variant === 'remove' ? { dialog: 'remove' as const, memberId: 'demo-mert' } : {}),
  };
}
