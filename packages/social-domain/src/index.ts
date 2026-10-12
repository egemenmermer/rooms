/** Provider-independent social identities are opaque, never Discord snowflakes. */
export interface SocialUser { id: string; username: string; displayName: string; avatar: string | null; bot?: boolean; discriminator?: string; }
export interface SocialSpace { id: string; name: string; icon: string | null; ownerId?: string; }
export interface SocialChannel { id: string; spaceId: string | null; name: string; type: number; topic: string | null; recipients?: SocialUser[]; lastMessageId?: string | null; }
export interface SocialMessage { id: string; channelId: string; author: SocialUser; content: string; timestamp: string; editedTimestamp: string | null; mentions?: string[]; attachments?: SocialAttachment[]; reactions?: Record<string,string[]>; }
export interface SocialInvite { code: string; space: SocialSpace | null; channel: SocialChannel | null; expiresAt: string | null; }
/** Native desktop events carry the auth-session generation that produced them. */
export interface GatewayEvent { type: string; data: unknown; sessionEpoch?: number; }

export const SOCIAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export type SocialProvider = 'stoat';

export interface SocialAttachment {id:string;name:string;size:number;mime:string;url?:string}
export interface SocialFriend {user:SocialUser;relationship:'friend'|'incoming'|'outgoing'|'blocked';status:'online'|'idle'|'dnd'|'invisible'|'unknown'}
/** Authoritative upstream read markers. The provider does not expose a total unread count. */
export interface SocialReadState {channelId:string;lastReadMessageId:string|null;mentionMessageIds:string[]}

/** Public membership information normalized from an authorized community response. */
export interface SocialMember { user: SocialUser; status: SocialFriend['status']; statusText: string | null; roles: string[]; }

export type SocialPermissionValue = 'deny'|'inherit'|'allow';
export type SocialChannelPermissionKey = 'view'|'send'|'files'|'manageMessages'|'manageChannel';
export type SocialPermissionValues = Record<SocialChannelPermissionKey,SocialPermissionValue>;
export interface SocialChannelPermissionSubject {id:string;kind:'default'|'role';name:string;values:SocialPermissionValues;editable:boolean}
export interface SocialChannelPermissions {
  channelId:string;spaceId:string|null;access:'allowed'|'denied'|'missing'|'unsupported';
  effective:Record<SocialChannelPermissionKey,boolean>&{managePermissions:boolean;readHistory:boolean};
  subjects:SocialChannelPermissionSubject[];defaultViewDenied:boolean;
  memberOverridesSupported:false;concurrency:'last-write-wins';
}
/** One subject per upstream mutation; no transactional multi-subject save or invented revision. */
export interface SocialChannelPermissionChange {channelId:string;subject:{kind:'default'|'role';id:string};values:SocialPermissionValues}
export interface SocialChannelAccessInvalidation {channelIds:string[];reason:'permissions-changed'|'removed'|'membership-changed'}

/** Native projection only; upstream reauthorizes every member mutation. */
export interface SocialCommunityRole {id:string;name:string;rank:number;assignable:boolean}
export interface SocialManagedMember extends SocialMember {canAssignRoles:boolean;canRemove:boolean}
export interface SocialCommunityManagement {
  spaceId:string;access:'allowed'|'denied'|'missing';
  capabilities:{manageServer:boolean;manageChannels:boolean;manageRoles:boolean;managePermissions:boolean;assignRoles:boolean;kickMembers:boolean};
  roles:SocialCommunityRole[];members:SocialManagedMember[];
  invites:{source:'rooms-broker';state:'unsupported';managementSupported:false;reason:string};
  concurrency:'last-write-wins';
}
export interface SocialMemberRoleChange {spaceId:string;userId:string;roleIds:string[]}
export interface SocialMemberRemoval {spaceId:string;userId:string}
