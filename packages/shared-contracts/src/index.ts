export * from './dm-call';
export type ConnectionStatus = 'not-configured' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type ActivityState = 'idle' | 'preparing' | 'live' | 'paused' | 'recovering' | 'ended' | 'error';
export type ActivityCategory = 'watch' | 'share' | 'play' | 'together';
export interface ActivityManifest {
  id: string; version: number; label: string; category: ActivityCategory;
  kind: 'shared-player' | 'live-stream' | 'collaborative' | 'game';
  capabilities: ('timeline' | 'queue' | 'host-control' | 'voice' | 'reactions' | 'participants')[];
  supportedPlatforms: ('windows' | 'macos')[];
  availability: 'local' | 'requires-setup' | 'later'; description: string;
}
export type ActivityPayload =
  | { type: 'cinema'; source: 'bundled-demo' | 'local-file'; title: string }
  | { type: 'poll'; question: string; options: { id: string; label: string }[]; votes: Record<string, string> };
export interface ActivitySession {
  id: string; roomId: string; activityId: string; hostUserId: string; controllerUserId: string | null;
  revision: number; state: ActivityState; startedAt: string; payload: ActivityPayload;
}
export interface DesktopBridge {
  pendingInvite():Promise<{serverUrl:string;code:string}|null>;
  onInvite(listener:(invite:{serverUrl:string;code:string})=>void):()=>void;
  platform: 'darwin' | 'win32' | 'linux';
  windowAction(action: 'minimize' | 'maximize' | 'close' | 'fullscreen'): Promise<void>;
  setAlwaysOnTop(value: boolean): Promise<void>;
  loginItemStatus():Promise<boolean>;
  setLoginItem(value: boolean): Promise<boolean>;
  chooseMedia(): Promise<{ url: string; name: string } | null>;
  releaseMedia(url: string): Promise<void>;
  chooseCaption(mediaUrl: string): Promise<{ content: string; name: string } | null>;
  openMediaExternal(url:string):Promise<boolean>;
  applicationInfo(): Promise<{version:string;platform:string;arch:string;electron:string}>;
  diagnosticsPreview(): Promise<string>;
  thirdPartyNotices(): Promise<string>;
  exportDiagnostics(): Promise<boolean>;
  notifications:{status():Promise<{enabled:boolean;supported:boolean}>;setOptIn(value:boolean):Promise<{enabled:boolean;supported:boolean}>};
  social: SocialBridge;
  dmCalls: import('./dm-call').DmCallBridge;
  updates:{status():Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;setOptIn(value:boolean):Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;check():Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;download():Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;cancel():Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;install():Promise<void>};
  providers: import('../../../apps/desktop/electron/provider-contracts').ProviderBridge;
  agent: import('@rooms/agent-contracts').AgentBridge;
  activity: { exportBoard(roomId:string,format?:'svg'|'png'):Promise<boolean>; youtubePlayer(videoId:string):Promise<{url:string;nonce:string}>; snapshot(roomId:string,afterRevision?:number):Promise<import('@rooms/activity-protocol').ActivityResponse>; command(roomId:string,envelope:import('@rooms/activity-protocol').ActivityCommandEnvelope):Promise<import('@rooms/activity-protocol').ActivityResponse> };
  media: {
    grant(channelId:string):Promise<{serverUrl:string;roomName:string;token:string;expiresAt:string}>;
    presenter(channelId:string,action:'acquire'|'release'):Promise<{granted:true;leaseId:string}|{released:true}>;
    screenState(channelId:string):Promise<ScreenPresenterState>;
    requestScreen(channelId:string,leaseId:string,requestId:string):Promise<{request:ScreenPresenterRequest}>;
    cancelScreenRequest(channelId:string,leaseId:string,requestId:string):Promise<{cancelled:true}>;
    decideScreenRequest(channelId:string,leaseId:string,requestId:string,approve:boolean):Promise<{approved:boolean;awaitingRelease:boolean}>;
    leave(channelId:string):Promise<void>;
    captureSources():Promise<{id:string;name:string;thumbnail:string}[]>;
    selectCaptureSource(id:string):Promise<void>;
    clearCaptureSource():Promise<void>;
    captureStatus():Promise<{microphone:string;camera:string;screen:string;systemAudio:boolean}>;
  };
}
export interface ScreenPresenterRequest { requestId:string; userId:string; leaseId:string; createdAt:number; expiresAt:number }
export interface ScreenPresenterReservation { requestId:string; userId:string; leaseId:string; expiresAt:number; released:boolean }
export interface ScreenPresenterState {
  presenter:{userId:string;leaseId:string}|null;
  requests:ScreenPresenterRequest[];
  reservation:ScreenPresenterReservation|null;
}
export interface SocialSession {instanceUrl:string|null;user:import('@rooms/social').SocialUser|null;status:ConnectionStatus;remembered:boolean;sessionEpoch?:number}
export interface SocialPasswordRecoveryCapabilities {emailEnabled:boolean;captcha:{required:boolean;siteKey:string|null}}
export interface SocialBridge {
  session():Promise<SocialSession>;
  login(input:{serverUrl:string;email:string;password:string}):Promise<SocialSession>;
  register(input:{serverUrl:string;email:string;password:string;username:string;inviteCode:string;accountInviteCode?:string}):Promise<SocialSession>;
  passwordRecoveryCapabilities(serverUrl:string):Promise<SocialPasswordRecoveryCapabilities>;
  requestPasswordRecovery(input:{serverUrl:string;email:string}):Promise<{accepted:true}>;
    importPasswordRecoveryLink(input:{serverUrl:string}):Promise<{handle:string;expiresAt:number;serverOrigin:string}>;
    confirmPasswordRecovery(input:{serverUrl:string;handle:string;password:string}):Promise<{state:'completed'|'invalid-token'|'selection-expired'|'rejected'|'uncertain'|'scope-changed'}>;
    cancelPasswordRecovery(input:{handle:string}):Promise<void>;
  logout():Promise<void>;
  spaces():Promise<import('@rooms/social').SocialSpace[]>;
  createSpace(name:string):Promise<import('@rooms/social').SocialSpace>;
  renameSpace(spaceId:string,name:string):Promise<import('@rooms/social').SocialSpace>;
  channels(spaceId:string):Promise<import('@rooms/social').SocialChannel[]>;
  createChannel(spaceId:string,name:string,type:'text'|'voice'):Promise<import('@rooms/social').SocialChannel>;
  renameChannel(channelId:string,name:string):Promise<import('@rooms/social').SocialChannel>;
  deleteChannel(channelId:string):Promise<void>;
  messages(channelId:string,before?:string):Promise<import('@rooms/social').SocialMessage[]>;
  send(channelId:string,content:string,attachmentIds?:string[]):Promise<import('@rooms/social').SocialMessage>;
  edit(channelId:string,messageId:string,content:string):Promise<import('@rooms/social').SocialMessage>;
  delete(channelId:string,messageId:string):Promise<void>;
  createInvite(channelId:string):Promise<import('@rooms/social').SocialInvite>;
  inspectInvite(serverUrl:string,code:string):Promise<import('@rooms/social').SocialInvite>;
  acceptInvite(code:string):Promise<import('@rooms/social').SocialInvite>;
  avatar(userId:string):Promise<string|null>;
  chooseAvatar():Promise<import('@rooms/social').SocialUser|null>;
  channelPermissions(channelId:string):Promise<import('@rooms/social').SocialChannelPermissions>;
  setChannelPermissions(change:import('@rooms/social').SocialChannelPermissionChange):Promise<import('@rooms/social').SocialChannelPermissions>;
  communityManagement(spaceId:string):Promise<import('@rooms/social').SocialCommunityManagement>;
  setMemberRoles(change:import('@rooms/social').SocialMemberRoleChange):Promise<import('@rooms/social').SocialCommunityManagement>;
  removeCommunityMember(change:import('@rooms/social').SocialMemberRemoval):Promise<import('@rooms/social').SocialCommunityManagement>;
  members(spaceId:string):Promise<import('@rooms/social').SocialMember[]>;
  friends():Promise<import('@rooms/social').SocialFriend[]>;
  addFriend(username:string):Promise<void>;
  removeFriend(id:string):Promise<void>;
  updateProfile(input:{displayName:string;bio?:string;statusText?:string}):Promise<import('@rooms/social').SocialUser>;
  react(channelId:string,messageId:string,emoji:string,remove?:boolean):Promise<void>;
  discardAttachment(id:string):Promise<void>;
  chooseAttachment(channelId:string):Promise<{id:string;name:string;size:number;mime:string}|null>;
  dms():Promise<import('@rooms/social').SocialChannel[]>;
  createDM(recipientId:string):Promise<import('@rooms/social').SocialChannel>;
  blockUser(userId:string):Promise<void>;
  unblockUser(userId:string):Promise<void>;
  removeMember(spaceId:string,userId:string):Promise<void>;
  ackRead(channelId:string,messageId:string):Promise<void>;
  readStates():Promise<import('@rooms/social').SocialReadState[]>;
  presence(status:'online'|'idle'|'dnd'|'invisible'):Promise<void>;
  typing(channelId:string,active:boolean):Promise<boolean>;
  onEvent(listener:(event:import('@rooms/social').GatewayEvent)=>void):()=>void;
}
