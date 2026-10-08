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
  openMediaExternal(url:string):Promise<boolean>;
  exportDiagnostics(): Promise<boolean>;
  notifications:{status():Promise<{enabled:boolean;supported:boolean}>;setOptIn(value:boolean):Promise<{enabled:boolean;supported:boolean}>};
  social: SocialBridge;
  updates:{status():Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;setOptIn(value:boolean):Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;check():Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;download():Promise<import('../../../apps/desktop/electron/updates').UpdateStatus>;install():Promise<void>};
  providers: import('../../../apps/desktop/electron/provider-contracts').ProviderBridge;
  agent: import('@rooms/agent-contracts').AgentBridge;
  activity: { youtubePlayer(videoId:string):Promise<{url:string;nonce:string}>; snapshot(roomId:string,afterRevision?:number):Promise<import('@rooms/activity-protocol').ActivityResponse>; command(roomId:string,envelope:import('@rooms/activity-protocol').ActivityCommandEnvelope):Promise<import('@rooms/activity-protocol').ActivityResponse> }; 
  media: {
    grant(channelId:string):Promise<{serverUrl:string;roomName:string;token:string;expiresAt:string}>;
    presenter(channelId:string,action:'acquire'|'release'):Promise<void>;
    leave(channelId:string):Promise<void>;
    captureSources():Promise<{id:string;name:string;thumbnail:string}[]>;
    selectCaptureSource(id:string):Promise<void>;
    clearCaptureSource():Promise<void>;
    captureStatus():Promise<{microphone:string;camera:string;screen:string;systemAudio:boolean}>;
  };
}
export interface SocialSession {instanceUrl:string|null;user:import('@rooms/social').SocialUser|null;status:ConnectionStatus;remembered:boolean}
export interface SocialBridge {
  session():Promise<SocialSession>;
  login(input:{serverUrl:string;email:string;password:string}):Promise<SocialSession>;
  register(input:{serverUrl:string;email:string;password:string;username:string;inviteCode:string;accountInviteCode?:string}):Promise<SocialSession>;
  logout():Promise<void>;
  spaces():Promise<import('@rooms/social').SocialSpace[]>;
  channels(spaceId:string):Promise<import('@rooms/social').SocialChannel[]>;
  messages(channelId:string,before?:string):Promise<import('@rooms/social').SocialMessage[]>;
  send(channelId:string,content:string,attachmentIds?:string[]):Promise<import('@rooms/social').SocialMessage>;
  edit(channelId:string,messageId:string,content:string):Promise<import('@rooms/social').SocialMessage>;
  delete(channelId:string,messageId:string):Promise<void>;
  createInvite(channelId:string):Promise<import('@rooms/social').SocialInvite>;
  inspectInvite(serverUrl:string,code:string):Promise<import('@rooms/social').SocialInvite>;
  acceptInvite(code:string):Promise<import('@rooms/social').SocialInvite>;
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
  onEvent(listener:(event:import('@rooms/social').GatewayEvent)=>void):()=>void;
}
