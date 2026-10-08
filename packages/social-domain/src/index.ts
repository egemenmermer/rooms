/** Provider-independent social identities are opaque, never Discord snowflakes. */
export interface SocialUser { id: string; username: string; displayName: string; avatar: string | null; bot?: boolean; discriminator?: string; }
export interface SocialSpace { id: string; name: string; icon: string | null; ownerId?: string; }
export interface SocialChannel { id: string; spaceId: string | null; name: string; type: number; topic: string | null; recipients?: SocialUser[]; lastMessageId?: string | null; }
export interface SocialMessage { id: string; channelId: string; author: SocialUser; content: string; timestamp: string; editedTimestamp: string | null; mentions?: string[]; attachments?: SocialAttachment[]; reactions?: Record<string,string[]>; }
export interface SocialInvite { code: string; space: SocialSpace | null; channel: SocialChannel | null; expiresAt: string | null; }
export interface GatewayEvent { type: string; data: unknown; }

export const SOCIAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export type SocialProvider = 'stoat';

export interface SocialAttachment {id:string;name:string;size:number;mime:string;url?:string}
export interface SocialFriend {user:SocialUser;relationship:'friend'|'incoming'|'outgoing'|'blocked';status:'online'|'idle'|'dnd'|'invisible'|'unknown'}
/** Authoritative upstream read markers. The provider does not expose a total unread count. */
export interface SocialReadState {channelId:string;lastReadMessageId:string|null;mentionMessageIds:string[]}
