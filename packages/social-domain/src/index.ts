/** Provider-independent social identities are opaque, never Discord snowflakes. */
export interface SocialUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bot?: boolean;
  discriminator?: string;
}
export interface SocialSpace {
  id: string;
  name: string;
  icon: string | null;
  ownerId?: string;
}
/** A community's public face, edited on its settings page; images are data URLs. */
export interface SocialSpaceProfile {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  banner: string | null;
  ownerId?: string;
}
export interface SocialChannel {
  id: string;
  spaceId: string | null;
  name: string;
  type: number;
  topic: string | null;
  recipients?: SocialUser[];
  lastMessageId?: string | null;
}
export interface SocialMessage {
  id: string;
  channelId: string;
  author: SocialUser;
  content: string;
  timestamp: string;
  editedTimestamp: string | null;
  mentions?: string[];
  /** IDs of messages this message natively replies to (Stoat `replies`). */
  replies?: string[];
  attachments?: SocialAttachment[];
  reactions?: Record<string, string[]>;
}
export interface SocialInvite {
  code: string;
  space: SocialSpace | null;
  channel: SocialChannel | null;
  expiresAt: string | null;
  /** Signup links accept several people; absent on upstream community invitations. */
  maxUses?: number;
  uses?: number;
}
/** Owner view of one active signup link; the token itself is never listed. */
export interface SocialInviteLinkSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  pending: number;
  source: 'app' | 'admin' | 'script' | 'legacy';
  createdBy: string | null;
  state: 'active' | 'full';
}
/** Native desktop events carry the auth-session generation that produced them. */
export interface GatewayEvent {
  type: string;
  data: unknown;
  sessionEpoch?: number;
}

export const SOCIAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/**
 * Reaction keys accepted by the upstream: a custom emoji ULID or a short Unicode emoji sequence
 * (at most 16 code points, at least one non-ASCII). Codepoint ids such as `2764` are rejected.
 */
export const SOCIAL_REACTION_PATTERN =
  /^(?:[0-9A-HJKMNP-TV-Z]{26}|(?=[^]*[^\x00-\x7F])[\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F\u20E3]{1,16})$/u;
export type SocialProvider = 'stoat';

export interface SocialAttachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  url?: string;
}
export interface SocialFriend {
  user: SocialUser;
  relationship: 'friend' | 'incoming' | 'outgoing' | 'blocked';
  status: 'online' | 'idle' | 'dnd' | 'invisible' | 'unknown';
}
/** Authoritative upstream read markers. The provider does not expose a total unread count. */
export interface SocialReadState {
  channelId: string;
  lastReadMessageId: string | null;
  mentionMessageIds: string[];
}

/** Public membership information normalized from an authorized community response. */
export interface SocialMember {
  user: SocialUser;
  status: SocialFriend['status'];
  statusText: string | null;
  roles: string[];
}

export type SocialPermissionValue = 'deny' | 'inherit' | 'allow';
export type SocialChannelPermissionKey =
  'view' | 'send' | 'files' | 'manageMessages' | 'manageChannel';
export type SocialPermissionValues = Record<SocialChannelPermissionKey, SocialPermissionValue>;
export interface SocialChannelPermissionSubject {
  id: string;
  kind: 'default' | 'role';
  name: string;
  values: SocialPermissionValues;
  editable: boolean;
}
export interface SocialChannelPermissions {
  channelId: string;
  spaceId: string | null;
  access: 'allowed' | 'denied' | 'missing' | 'unsupported';
  effective: Record<SocialChannelPermissionKey, boolean> & {
    managePermissions: boolean;
    readHistory: boolean;
  };
  subjects: SocialChannelPermissionSubject[];
  defaultViewDenied: boolean;
  memberOverridesSupported: false;
  concurrency: 'last-write-wins';
}
/** One subject per upstream mutation; no transactional multi-subject save or invented revision. */
export interface SocialChannelPermissionChange {
  channelId: string;
  subject: { kind: 'default' | 'role'; id: string };
  values: SocialPermissionValues;
}
export interface SocialChannelAccessInvalidation {
  channelIds: string[];
  reason: 'permissions-changed' | 'removed' | 'membership-changed';
}

/** A deliberately small subset of upstream permissions; all other bits are preserved. */
export const SOCIAL_ROLE_PERMISSION_KEYS = [
  'view',
  'send',
  'files',
  'connect',
  'speak',
  'video',
  'manageMessages',
  'manageChannels',
  'assignRoles',
  'manageRoles',
  'managePermissions',
  'kickMembers',
  'banMembers',
  'moveMembers',
] as const;
export type SocialRolePermissionKey = (typeof SOCIAL_ROLE_PERMISSION_KEYS)[number];
export type SocialRolePermissionValues = Record<SocialRolePermissionKey, SocialPermissionValue>;
export type SocialCommunityRoleChange =
  | { action: 'create'; spaceId: string; name: string }
  | { action: 'appearance'; spaceId: string; roleId: string; name: string; color: string | null }
  | { action: 'permissions'; spaceId: string; roleId: string; values: SocialRolePermissionValues }
  | { action: 'delete'; spaceId: string; roleId: string };
export interface SocialCommunityRoleResult {
  roleId: string;
  management: SocialCommunityManagement;
}

/** Native projection only; upstream reauthorizes every member mutation. */
export interface SocialCommunityRole {
  id: string;
  name: string;
  rank: number;
  assignable: boolean;
  color: string | null;
  editable: boolean;
  permissionsEditable: boolean;
  permissions: SocialRolePermissionValues;
}
export interface SocialManagedMember extends SocialMember {
  canAssignRoles: boolean;
  canRemove: boolean;
  canBan?: boolean;
}
export interface SocialCommunityManagement {
  spaceId: string;
  access: 'allowed' | 'denied' | 'missing';
  capabilities: {
    manageServer: boolean;
    manageChannels: boolean;
    manageRoles: boolean;
    managePermissions: boolean;
    assignRoles: boolean;
    kickMembers: boolean;
    /** Stoat BanMembers; absent from older projections. */
    banMembers?: boolean;
    /** Stoat MoveMembers: move people between voice rooms or disconnect them. */
    moveMembers?: boolean;
    /**
     * Owner, or a member whose roles grant every Stoat permission; ROOMS services treat both as
     * the owner (invite links, Sinema account, host operations). Absent from older projections.
     */
    communityAdmin?: boolean;
  };
  roles: SocialCommunityRole[];
  grantablePermissions: SocialRolePermissionKey[];
  members: SocialManagedMember[];
  invites:
    | { source: 'rooms-broker'; state: 'supported'; managementSupported: true }
    | {
        source: 'rooms-broker';
        state: 'unsupported';
        managementSupported: false;
        reason: string;
      };
  concurrency: 'last-write-wins';
}
export interface SocialMemberRoleChange {
  spaceId: string;
  userId: string;
  roleIds: string[];
}
export interface SocialMemberRemoval {
  spaceId: string;
  userId: string;
}
export * from './invite-links';
