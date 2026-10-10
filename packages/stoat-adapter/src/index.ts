import {restBucket,resetDelay} from './rate-limit';
import type { ConnectionStatus } from '@rooms/contracts';
import { SOCIAL_ID_PATTERN, type SocialUser, type SocialSpace, type SocialChannel, type SocialMessage, type SocialInvite, type SocialAttachment, type SocialFriend, type SocialReadState, type GatewayEvent } from '@rooms/social';
export type { SocialUser, SocialSpace, SocialChannel, SocialMessage, SocialInvite, SocialAttachment, SocialFriend, SocialReadState, GatewayEvent } from '@rooms/social';
type Raw = Record<string, any>;
export class StoatError extends Error {
  constructor(public status: number, public code: string) { super(code === 'REGISTRATION_REQUIRES_SIGN_IN' ? 'Account creation could not be completed. If you already have an account, sign in instead. Contact the server administrator if you cannot sign in.' : code === 'REGISTRATION_UNCERTAIN' ? 'Account creation could not be confirmed. Try signing in before submitting another invitation.' : code === 'INVITE_PROVISIONING_UNAVAILABLE' ? 'Invitation provisioning is not configured on this server. Ask your administrator.' : code === 'INVITE_ADMIN_REQUIRED' ? 'Only the space owner can create account invitations.' : code === 'EXPIRING_INVITES_UNAVAILABLE' ? 'This Stoat release cannot enforce invitation expiry or one-time use. Ask your administrator to provide an invitation.' : code === 'ACCOUNT_INVITE_REQUIRED' ? 'A separate account invitation is required. Ask your administrator.' : code === 'UnverifiedAccount' ? 'Verify your email before signing in.' : code === 'ADDITIONAL_AUTHENTICATION_REQUIRED' ? 'This account needs additional authentication. Complete the official Stoat sign-in flow.' : status === 401 ? 'Your session expired. Sign in again.' : status === 403 ? 'You do not have permission for this action.' : status === 404 ? 'This room, message or invitation is unavailable.' : status === 429 ? 'Too many requests. Please wait and retry.' : status >= 500 ? 'The social server is unavailable. Retry shortly.' : 'The social server rejected this request. Check the supplied details.'); this.name = 'StoatError'; }
}
export function validateInstanceUrl(value: string, trustedInternalOrigin = false): string {
  const url = new URL(value); const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !((local || trustedInternalOrigin) && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || !['', '/', '/api', '/api/'].includes(url.pathname)) throw new Error('Use an HTTPS Stoat origin or /api endpoint, or HTTP loopback for development.');
  return url.origin + (url.pathname.startsWith('/api') ? '/api' : '');
}
const checked = (value: string) => { if (!SOCIAL_ID_PATTERN.test(value)) throw new StoatError(400, 'INVALID_ID'); return encodeURIComponent(value); };
export const normalizeUser = (u: Raw): SocialUser => ({ id: String(u._id), username: String(u.username ?? ''), displayName: String(u.display_name ?? u.username ?? ''), avatar: typeof u.avatar?._id === 'string' ? u.avatar._id : null, ...(u.bot?{bot:true}:{}), ...(typeof u.discriminator==='string'?{discriminator:u.discriminator}:{}) });
export const normalizeSpace = (s: Raw): SocialSpace => ({ id: String(s._id), name: String(s.name ?? ''), icon: typeof s.icon?._id === 'string' ? s.icon._id : null, ...(s.owner ? {ownerId:String(s.owner)} : {}) });
export function ulidTimestamp(id: string): string {
  const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let ms=0;
  if(!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id)) throw new StoatError(502,'INVALID_MESSAGE_ID');
  for(const char of id.slice(0,10)) ms=ms*32+alphabet.indexOf(char);
  return new Date(ms).toISOString();
}
/** Native-only REST/events adapter. No auth, sessions, or credentials enter renderer events. */
export class StoatClient {
  readonly instanceUrl: string; readonly apiUrl:string;
  status: ConnectionStatus='not-configured'; private token:string|null; private readonly botToken:boolean; private currentUser:SocialUser|null=null; private fileOrigin:string|null=null;
  private socket:WebSocket|null=null; private heartbeat:ReturnType<typeof setInterval>|null=null; private retry:ReturnType<typeof setTimeout>|null=null; private stopped=true; private attempt=0; private pongAt=0;
  private listeners=new Set<(event:GatewayEvent)=>void>(); private users=new Map<string,Raw>(); private servers=new Map<string,Raw>(); private channels=new Map<string,Raw>(); private messages=new Map<string,Raw>();
  private presenceSubscriptions=new Map<string,number>();
  private readyWait:Promise<void>|null=null; private eventQueue=Promise.resolve();
  private restQueues=new Map<string,Promise<unknown>>(); private restReset=new Map<string,number>(); private pendingRequests=0;
  constructor(value:string,token?:string,options?:{trustedInternalOrigin?:boolean;apiRoot?:boolean;botToken?:boolean}) { this.instanceUrl=validateInstanceUrl(value,options?.trustedInternalOrigin===true); this.apiUrl=this.instanceUrl.endsWith('/api')||options?.apiRoot?this.instanceUrl:`${this.instanceUrl}/api`; this.token=token??null;this.botToken=options?.botToken===true; }
  getToken(){return this.token;} subscribe(listener:(event:GatewayEvent)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  private emit(type:string,data:unknown){for(const listener of this.listeners)listener({type,data});}
  private setStatus(status:ConnectionStatus){this.status=status;this.emit('CONNECTION_STATUS',status);}
  private async request<T>(path:string,method='GET',body?:unknown,additionalHeaders:Record<string,string>={}):Promise<T>{
    if(this.pendingRequests>=128)throw new StoatError(429,'CLIENT_QUEUE_FULL');
    const bucket=restBucket(path,method), token=this.token, payload=body===undefined?undefined:JSON.stringify(body);
    this.pendingRequests++;
    const work=(this.restQueues.get(bucket)??Promise.resolve()).catch(()=>{}).then(async()=>{
      const deadline=Date.now()+60000;
      for(let attempt=0;attempt<3;attempt++){
        const wait=(this.restReset.get(bucket)??0)-Date.now();
        if(wait>0){if(Date.now()+wait>deadline)throw new StoatError(429,'RATE_LIMITED');await new Promise(resolve=>setTimeout(resolve,wait));}
        if(this.token!==token)throw new StoatError(401,'SESSION_CHANGED');
        let response:Response;try{response=await fetch(`${this.apiUrl}${path}`,{method,headers:{'Content-Type':'application/json',...additionalHeaders,...(token?{[this.botToken?'x-bot-token':'x-session-token']:token}:{})},body:payload,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new StoatError(503,'NETWORK_UNAVAILABLE');}
        if(response.ok){const delay=resetDelay(response);if(response.headers.get('x-ratelimit-remaining')==='0'&&delay!==null)this.restReset.set(bucket,Date.now()+delay);return response.status===204?undefined as T:response.json() as Promise<T>;}
        const data=await response.json().catch(()=>({})) as Raw;
        // Upstream's rate-limit fairing rejects before route execution. Only a
        // definite 429 with bounded reset metadata is safe to retry. Never retry
        // a network failure or an ambiguous mutation response.
        const delay=response.status===429?resetDelay(response,data):null;
        if(delay!==null&&attempt<2&&Date.now()+delay<=deadline){this.restReset.set(bucket,Date.now()+delay);continue;}
        throw new StoatError(response.status,String(data.type??'REQUEST_FAILED'));
      }
      throw new StoatError(429,'RATE_LIMITED');
    });
    this.restQueues.set(bucket,work);
    try{return await work;}finally{this.pendingRequests--;if(this.restQueues.get(bucket)===work)this.restQueues.delete(bucket);}
  }
  private async authenticate(email:string,password:string){const response=await this.request<Raw>('/auth/session/login','POST',{email,password,friendly_name:'ROOMS Desktop'});if(typeof response.token!=='string')throw new StoatError(400,'ADDITIONAL_AUTHENTICATION_REQUIRED');this.token=response.token;}
  async login(email:string,password:string){await this.authenticate(email,password);return this.getCurrentUser();}
  async register(input:{email:string;password:string;username:string;inviteCode:string;accountInviteCode?:string}){
    // Signup tickets belong to ROOMS. Official account/community invitation secrets remain in the broker.
    let response:Response;try{response=await fetch(`${new URL(this.instanceUrl).origin}/rooms-access/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:input.email,password:input.password,username:input.username,inviteCode:input.inviteCode}),redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw new StoatError(503,'REGISTRATION_UNCERTAIN');}
    const data=await response.json().catch(()=>({})) as Raw;if(!response.ok)throw new StoatError(response.status,data.error==='OperationFailed'?'REGISTRATION_REQUIRES_SIGN_IN':String(data.error??'REQUEST_FAILED'));if(typeof data.token!=='string')throw new StoatError(502,'INVALID_SESSION_RESPONSE');this.token=data.token;return this.getCurrentUser();
  }
  /** Called only by the trusted registration broker after claiming its own durable signup ticket. */
  async registerUpstream(input:{email:string;password:string;username:string;inviteCode:string;accountInviteCode:string}){
    await this.inspectUpstreamInvite(input.inviteCode);
    await this.request('/auth/account/create','POST',{email:input.email,password:input.password,invite:input.accountInviteCode});
    await this.authenticate(input.email,input.password);
    const onboarding=await this.request<{onboarding:boolean}>('/onboard/hello');
    if(onboarding.onboarding)await this.request('/onboard/complete','POST',{username:input.username});
    await this.acceptInvite(input.inviteCode);return this.getCurrentUser();
  }
  async getCurrentUser(){const raw=await this.request<Raw>('/users/@me');this.users.set(raw._id,raw);this.currentUser=normalizeUser(raw);return this.currentUser;}
  private normalizeChannel(c:Raw):SocialChannel{return{id:String(c._id),spaceId:c.server?String(c.server):null,name:String(c.name??(c.channel_type==='SavedMessages'?'Saved messages':'Direct message')),type:c.channel_type==='VoiceChannel'||c.voice?2:['DirectMessage','Group','SavedMessages'].includes(c.channel_type)?1:0,topic:typeof c.description==='string'?c.description:null,lastMessageId:typeof c.last_message_id==='string'?c.last_message_id:null,...(Array.isArray(c.recipients)?{recipients:c.recipients.map((id:string)=>normalizeUser(this.users.get(id)??{_id:id,username:id}))}:{})};}
  private async normalizeMessage(m:Raw):Promise<SocialMessage>{let author=m.user??this.users.get(m.author);if(!author){author=await this.request<Raw>(`/users/${checked(String(m.author))}`);this.users.set(author._id,author);}this.messages.set(m._id,m);if(this.messages.size>1000)this.messages.delete(this.messages.keys().next().value!);return{id:String(m._id),channelId:String(m.channel),author:normalizeUser(author),content:typeof m.content==='string'?m.content:'',timestamp:ulidTimestamp(String(m._id)),editedTimestamp:m.edited??null,...(Array.isArray(m.attachments)?{attachments:m.attachments.map((file:Raw)=>this.normalizeAttachment(file))}:{}),...(m.reactions&&typeof m.reactions==='object'?{reactions:Object.fromEntries(Object.entries(m.reactions).filter(([,ids])=>Array.isArray(ids)).map(([emoji,ids])=>[emoji,(ids as unknown[]).filter((id):id is string=>typeof id==='string')]))}:{}),...(Array.isArray(m.mentions)?{mentions:m.mentions.filter((id:unknown)=>typeof id==='string')}:{})};}
  private configureFileOrigin(root:Raw){const raw=root.features?.autumn;if(raw?.enabled!==true||typeof raw.url!=='string')return;let url:URL;try{url=new URL(raw.url);}catch{return;}if(url.origin!==new URL(this.instanceUrl).origin||url.username||url.password||url.search||url.hash)return;this.fileOrigin=url.href.replace(/\/$/,'');}
  private normalizeAttachment(file:Raw):SocialAttachment{const id=String(file._id);const name=typeof file.filename==='string'?file.filename.slice(0,255):'Attachment';return{id,name,size:Number.isSafeInteger(file.size)&&file.size>=0?file.size:0,mime:typeof file.content_type==='string'?file.content_type:'application/octet-stream',...(this.fileOrigin&&SOCIAL_ID_PATTERN.test(id)?{url:`${this.fileOrigin}/attachments/${encodeURIComponent(id)}/${encodeURIComponent(name)}`}:{})};}
  async uploadAttachment(bytes:Uint8Array,name:string,mime:string):Promise<SocialAttachment>{
    if(!bytes.byteLength||bytes.byteLength>25*1024*1024||!name||name.length>255||/[\r\n/\\]/.test(name)||!/^[-\w.+]+\/[-\w.+]+$/.test(mime))throw new StoatError(400,'INVALID_ATTACHMENT');
    if(!this.fileOrigin)this.configureFileOrigin(await this.request<Raw>(''));if(!this.fileOrigin)throw new StoatError(501,'ATTACHMENTS_UNAVAILABLE');
    const form=new FormData();form.append('file',new Blob([new Uint8Array(bytes)],{type:mime}),name);
    let response:Response;try{response=await fetch(`${this.fileOrigin}/attachments`,{method:'POST',headers:this.token?{[this.botToken?'x-bot-token':'x-session-token']:this.token}:{},body:form,redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw new StoatError(503,'UPLOAD_UNCERTAIN');}
    if(!response.ok)throw new StoatError(response.status,'ATTACHMENT_UPLOAD_DENIED');const value=await response.json() as Raw;if(typeof value.id!=='string'||!SOCIAL_ID_PATTERN.test(value.id))throw new StoatError(502,'INVALID_ATTACHMENT_RESPONSE');return{id:value.id,name,size:bytes.byteLength,mime};
  }
  async listFriends():Promise<SocialFriend[]>{const self=await this.request<Raw>('/users/@me');const relations=(self.relations??[]).filter((r:Raw)=>['Friend','Incoming','Outgoing','Blocked'].includes(r.status));if(relations.length>1000)throw new StoatError(502,'RELATIONSHIP_LIMIT');return Promise.all(relations.map(async(r:Raw)=>{const u=await this.request<Raw>(`/users/${checked(r._id)}`);this.users.set(u._id,u);const status=u.online===false||u.status?.presence==='Invisible'?'invisible':u.online===true?({Idle:'idle',Busy:'dnd',Focus:'dnd'} as Record<string,string>)[u.status?.presence]??'online':'unknown';return{user:normalizeUser(u),relationship:r.status.toLowerCase(),status} as SocialFriend;}));}
  async addFriend(username:string){if(!/^.{2,32}#[0-9]{4}$/.test(username))throw new StoatError(400,'USERNAME_DISCRIMINATOR_REQUIRED');await this.request('/users/friend','POST',{username});}
  async removeFriend(userId:string){await this.request(`/users/${checked(userId)}/friend`,'DELETE');}
  async updateProfile(input:{displayName:string;bio?:string;statusText?:string}){const body:Raw={display_name:input.displayName,remove:[]};if(input.bio!==undefined){if(input.bio)body.profile={content:input.bio};else body.remove.push('ProfileContent');}if(input.statusText!==undefined){if(input.statusText)body.status={text:input.statusText};else body.remove.push('StatusText');}const raw=await this.request<Raw>('/users/@me','PATCH',body);this.users.set(raw._id,raw);this.currentUser=normalizeUser(raw);return this.currentUser;}
  async react(channelId:string,messageId:string,emoji:string,remove=false){if(!/^[A-Za-z0-9_-]{1,128}$/.test(emoji))throw new StoatError(400,'INVALID_EMOJI');await this.request(`/channels/${checked(channelId)}/messages/${checked(messageId)}/reactions/${checked(emoji)}`,remove?'DELETE':'PUT');const message=await this.request<Raw>(`/channels/${checked(channelId)}/messages/${checked(messageId)}`);this.emit('MESSAGE_UPDATE',await this.normalizeMessage(message));}
  async listSpaces(){await this.ensureReady();return [...this.servers.values()].map(normalizeSpace);}
  async listChannels(spaceId:string){const raw=await this.getServer(spaceId);const channels=await Promise.all((raw.channels??[]).map((id:string)=>this.getChannel(id)));return channels.map(c=>this.normalizeChannel(c));}
  async getServer(spaceId:string){return this.request<Raw>(`/servers/${checked(spaceId)}`);}
  async getChannel(channelId:string){return this.request<Raw>(`/channels/${checked(channelId)}`);}
  async getMember(spaceId:string,userId:string){return this.request<Raw>(`/servers/${checked(spaceId)}/members/${checked(userId)}`);}
  async listMembers(spaceId:string){return this.request<Raw>(`/servers/${checked(spaceId)}/members`);}
  async blockUser(userId:string){await this.request(`/users/${checked(userId)}/block`,'PUT');}
  async unblockUser(userId:string){await this.request(`/users/${checked(userId)}/block`,'DELETE');}
  async removeMember(spaceId:string,userId:string){await this.request(`/servers/${checked(spaceId)}/members/${checked(userId)}`,'DELETE');}
  async ackRead(channelId:string,messageId:string){await this.request(`/channels/${checked(channelId)}/ack/${checked(messageId)}`,'PUT');await this.syncReadStates();}
  async readStates():Promise<SocialReadState[]>{const self=this.currentUser??await this.getCurrentUser();const records=await this.request<Raw[]>('/sync/unreads');if(!Array.isArray(records)||records.length>10000)throw new StoatError(502,'INVALID_READ_STATES');return records.filter(raw=>raw._id?.user===self.id).map(raw=>{if(typeof raw._id?.channel!=='string'||!SOCIAL_ID_PATTERN.test(raw._id.channel)||(raw.last_id!==undefined&&raw.last_id!==null&&(typeof raw.last_id!=='string'||!SOCIAL_ID_PATTERN.test(raw.last_id)))||(raw.mentions!==undefined&&!Array.isArray(raw.mentions)))throw new StoatError(502,'INVALID_READ_STATES');return{channelId:raw._id.channel,lastReadMessageId:raw.last_id??null,mentionMessageIds:(raw.mentions??[]).filter((id:unknown):id is string=>typeof id==='string'&&SOCIAL_ID_PATTERN.test(id))};});}
  private async syncReadStates(){try{this.emit('READ_STATE_SYNC',await this.readStates());}catch{this.emit('READ_STATE_UNAVAILABLE',{reason:'The server read markers could not be restored. Retry after reconnecting.'});}}
  async listDMs(){const channels=await this.request<Raw[]>('/users/dms');await Promise.all(channels.flatMap(c=>c.recipients??[]).filter((id:string)=>!this.users.has(id)).map(async(id:string)=>{const u=await this.request<Raw>(`/users/${checked(id)}`);this.users.set(id,u);}));return channels.map(c=>this.normalizeChannel(c));}
  async createDM(recipientId:string){return this.normalizeChannel(await this.request<Raw>(`/users/${checked(recipientId)}/dm`));}
  async listMessages(channelId:string,before?:string){const result=await this.request<Raw|Raw[]>(`/channels/${checked(channelId)}/messages?limit=50&include_users=true${before?`&before=${checked(before)}`:''}`);const raw=Array.isArray(result)?result:result.messages;for(const u of (Array.isArray(result)?[]:result.users??[]))this.users.set(u._id,u);return Promise.all([...raw].reverse().map(m=>this.normalizeMessage(m)));}
  async getMessage(channelId:string,messageId:string):Promise<SocialMessage>{const channel=decodeURIComponent(checked(channelId));const message=decodeURIComponent(checked(messageId));const raw=await this.request<Raw>(`/channels/${checked(channel)}/messages/${checked(message)}`);if(raw.channel!==channel||raw._id!==message)throw new StoatError(502,'MESSAGE_SCOPE_MISMATCH');return this.normalizeMessage(raw);}
  async sendMessage(channelId:string,content:string,attachmentIds?:string[]){if(attachmentIds&&(attachmentIds.length>10||attachmentIds.some(id=>!SOCIAL_ID_PATTERN.test(id))))throw new StoatError(400,'INVALID_ATTACHMENT');return this.normalizeMessage(await this.request<Raw>(`/channels/${checked(channelId)}/messages`,'POST',{content,nonce:crypto.randomUUID(),...(attachmentIds?.length?{attachments:attachmentIds}:{})}));}
  async sendReply(channelId:string,messageId:string,content:string,deliveryId:string){if(!/^[A-Za-z0-9_-]{1,64}$/.test(deliveryId))throw new StoatError(400,'INVALID_DELIVERY_ID');return this.normalizeMessage(await this.request<Raw>(`/channels/${checked(channelId)}/messages`,'POST',{content,nonce:deliveryId,replies:[{id:messageId,mention:false}]},{'Idempotency-Key':deliveryId}));}
  async editMessage(channelId:string,messageId:string,content:string){return this.normalizeMessage(await this.request<Raw>(`/channels/${checked(channelId)}/messages/${checked(messageId)}`,'PATCH',{content}));}
  async deleteMessage(channelId:string,messageId:string){await this.request(`/channels/${checked(channelId)}/messages/${checked(messageId)}`,'DELETE');}
  private normalizeInvite(i:Raw):SocialInvite{return{code:String(i.code??i._id),space:i.server_id?{id:String(i.server_id),name:String(i.server_name??''),icon:i.server_icon?._id??null}:null,channel:i.channel_id?{id:String(i.channel_id),spaceId:i.server_id??null,name:String(i.channel_name??''),type:0,topic:i.channel_description??null}:null,expiresAt:i.expires??null};}
  async createInvite(channelId:string):Promise<SocialInvite>{
    let response:Response;try{response=await fetch(`${new URL(this.instanceUrl).origin}/rooms-access/v1/invites`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.token??''}`},body:JSON.stringify({channelId:decodeURIComponent(checked(channelId))}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new StoatError(503,'NETWORK_UNAVAILABLE');}
    const data=await response.json().catch(()=>({})) as Raw;if(!response.ok)throw new StoatError(response.status,String(data.error??'INVITE_UNAVAILABLE'));return data as SocialInvite;
  }
  /** Broker-only perpetual upstream invitation; its code never enters the native/renderer result. */
  async createUpstreamInvite(channelId:string){const created=await this.request<Raw>(`/channels/${checked(channelId)}/invites`,'POST');return this.inspectUpstreamInvite(String(created._id));}
  async inspectInvite(code:string){
    if(code.length>=32){let response:Response;try{response=await fetch(`${new URL(this.instanceUrl).origin}/rooms-access/v1/auth/invites/${checked(code)}`,{redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new StoatError(503,'NETWORK_UNAVAILABLE');}const data=await response.json().catch(()=>({})) as Raw;if(!response.ok)throw new StoatError(response.status,String(data.error??'INVITE_UNAVAILABLE'));return data as SocialInvite;}
    return this.inspectUpstreamInvite(code);
  }
  async inspectUpstreamInvite(code:string){return this.normalizeInvite(await this.request<Raw>(`/invites/${checked(code)}`));}
  async acceptInvite(code:string){
    if(code.length>=32){let response:Response;try{response=await fetch(`${new URL(this.instanceUrl).origin}/rooms-access/v1/auth/invites/${checked(code)}/join`,{method:'POST',headers:{Authorization:`Bearer ${this.token??''}`},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new StoatError(503,'NETWORK_UNAVAILABLE');}const data=await response.json().catch(()=>({})) as Raw;if(!response.ok)throw new StoatError(response.status,String(data.error??'INVITE_UNAVAILABLE'));this.emit('SOCIAL_REFRESH',null);return data as SocialInvite;}
    const joined=await this.request<Raw>(`/invites/${checked(code)}`,'POST');if(joined.server)this.servers.set(joined.server._id,joined.server);for(const c of joined.channels??[])this.channels.set(c._id,c);return{code,space:joined.server?normalizeSpace(joined.server):null,channel:joined.channel?this.normalizeChannel(joined.channel):joined.channels?.[0]?this.normalizeChannel(joined.channels[0]):null,expiresAt:null};}
  async updatePresence(status:'online'|'idle'|'dnd'|'invisible'){await this.request('/users/@me','PATCH',{status:{presence:{online:'Online',idle:'Idle',dnd:'Busy',invisible:'Invisible'}[status]}});}
  subscribePresence(spaceId:string):boolean{
    checked(spaceId);if(this.status!=='connected'||!this.servers.has(spaceId))return false;const now=Date.now();
    for(const [id,sentAt]of this.presenceSubscriptions)if(now-sentAt>=15*60000)this.presenceSubscriptions.delete(id);
    const previous=this.presenceSubscriptions.get(spaceId);if(previous!==undefined&&now-previous<10*60000)return true;
    if(previous===undefined&&this.presenceSubscriptions.size>=5)return false;
    this.send({type:'Subscribe',server_id:spaceId});this.presenceSubscriptions.set(spaceId,now);return true;
  }
  private send(data:unknown){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(data));}
  private ensureReady(){return this.status==='connected'?Promise.resolve():this.readyWait??this.connect();}
  async connect():Promise<void>{if(!this.token)throw new StoatError(401,'SIGN_IN_REQUIRED');if(this.readyWait)return this.readyWait;this.stopped=false;this.setStatus('connecting');this.readyWait=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new StoatError(503,'EVENTS_TIMEOUT'));},20000);const off=this.subscribe(e=>{if(e.type==='READY'){clearTimeout(timer);off();resolve();}else if(e.type==='AUTH_EXPIRED'){clearTimeout(timer);off();reject(new StoatError(401,'InvalidSession'));}});void this.openSocket().catch(error=>{clearTimeout(timer);off();reject(error);});}).finally(()=>{this.readyWait=null;});return this.readyWait;}
  private async openSocket(){if(this.stopped)return;const root=await this.request<Raw>('');this.configureFileOrigin(root);if(this.stopped)return;const endpoint=new URL(String(root.ws));const configured=new URL(this.instanceUrl);if(endpoint.host!==configured.host||!['ws:','wss:'].includes(endpoint.protocol)||(configured.protocol==='https:'&&endpoint.protocol!=='wss:')||endpoint.username||endpoint.password){this.setStatus('error');throw new StoatError(403,'UNTRUSTED_GATEWAY');}
    endpoint.searchParams.set('format','json');endpoint.searchParams.set('version','1');
    if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;const previous=this.socket;this.socket=null;previous?.close();
    const socket=new WebSocket(endpoint);this.socket=socket;socket.addEventListener('open',()=>{if(this.socket!==socket||this.stopped)return;this.send({type:'Authenticate',token:this.token});this.pongAt=Date.now();this.heartbeat=setInterval(()=>{if(Date.now()-this.pongAt>60000){socket.close();return;}this.send({type:'Ping',data:Date.now()});},20000);});
    socket.addEventListener('message',event=>{if(this.socket!==socket)return;let packet:Raw;try{if(String(event.data).length>2097152)throw new Error('Packet too large');packet=JSON.parse(String(event.data));}catch{socket.close();return;}this.eventQueue=this.eventQueue.then(async()=>{if(this.socket===socket)await this.processPacket(packet);}).catch(()=>{this.emit('SOCIAL_REFRESH',null);});});
    socket.addEventListener('close',()=>{if(this.socket!==socket)return;if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;this.scheduleReconnect();});socket.addEventListener('error',()=>socket.close());
  }
  private async processPacket(p:Raw):Promise<void>{
    if(p.type==='Bulk'){for(const child of p.v??[])await this.processPacket(child);return;}
    if(p.type==='Pong'){this.pongAt=Date.now();return;}
    if(p.type==='Logout'||p.type==='Error'&&['InvalidSession','OnboardingNotFinished'].includes(p.error??p.data?.type)){this.stopped=true;this.setStatus('error');this.emit('AUTH_EXPIRED',null);this.socket?.close();return;}
    if(p.type==='Ready'){this.users.clear();this.servers.clear();this.channels.clear();for(const u of p.users??[])this.users.set(u._id,u);for(const s of p.servers??[])this.servers.set(s._id,s);for(const c of p.channels??[])this.channels.set(c._id,c);this.attempt=0;this.setStatus('connected');this.presenceSubscriptions.clear();this.emit('READY',{user:this.currentUser,spaces:[...this.servers.values()].map(normalizeSpace)});for(const raw of this.users.values()){if(typeof raw.online==='boolean'){const status=raw.online===false||raw.status?.presence==='Invisible'?'invisible':({Idle:'idle',Busy:'dnd',Focus:'dnd'} as Record<string,string>)[raw.status?.presence]??'online';this.emit('PRESENCE_UPDATE',{userId:raw._id,status});}}await this.syncReadStates();return;}
    if(p.type==='Message'){this.emit('MESSAGE_CREATE',await this.normalizeMessage(p));return;}
    if(p.type==='MessageUpdate'){const previous=this.messages.get(p.id);const raw=previous?{...previous,...p.data}:await this.request<Raw>(`/channels/${checked(p.channel)}/messages/${checked(p.id)}`);this.emit('MESSAGE_UPDATE',await this.normalizeMessage(raw));return;}
    if(['MessageReact','MessageUnreact','MessageRemoveReaction'].includes(p.type)){const raw=await this.request<Raw>(`/channels/${checked(p.channel_id)}/messages/${checked(p.id)}`);this.emit('MESSAGE_UPDATE',await this.normalizeMessage(raw));return;}
    if(p.type==='MessageDelete'){this.messages.delete(p.id);this.emit('MESSAGE_DELETE',{id:p.id,channel_id:p.channel});return;}
    if(p.type==='UserUpdate'){const old=this.users.get(p.id);const raw={...old,...p.data,_id:p.id};this.users.set(p.id,raw);if('online' in (p.data??{})||p.data?.status){const presence=p.data?.status?.presence??raw.status?.presence;const status=raw.online===false||presence==='Invisible'?'invisible':({Online:'online',Idle:'idle',Busy:'dnd',Focus:'dnd'} as Record<string,string>)[presence]??(raw.online===true?'online':undefined);if(status)this.emit('PRESENCE_UPDATE',{userId:p.id,status});}return;}
    if(p.type==='ServerCreate'){this.servers.set(p.id,p.server);for(const c of p.channels??[])this.channels.set(c._id,c);}
    if(p.type==='ServerDelete')this.servers.delete(p.id);
    if(p.type==='ServerUpdate'){const old=this.servers.get(p.id);if(old)this.servers.set(p.id,{...old,...p.data});}
    if(p.type==='ChannelCreate')this.channels.set(p._id,p);
    if(p.type==='ChannelDelete')this.channels.delete(p.id);
    if(p.type==='ChannelAck'&&p.user===this.currentUser?.id){this.emit('MESSAGE_ACK',{channelId:p.id,messageId:p.message_id,userId:p.user});await this.syncReadStates();}
    if(p.type?.startsWith('Server')||p.type?.startsWith('Channel')||p.type==='UserRelationship')this.emit('SOCIAL_REFRESH',null);
  }
  private scheduleReconnect(){if(this.stopped||this.retry)return;this.setStatus('reconnecting');this.retry=setTimeout(()=>{this.retry=null;void this.openSocket().catch(()=>this.scheduleReconnect());},Math.min(30000,1000*2**Math.min(this.attempt++,5)));}
  async disconnect(){this.stopped=true;if(this.retry)clearTimeout(this.retry);this.retry=null;if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;const socket=this.socket;this.socket=null;socket?.close(1000);this.setStatus('not-configured');}
  async logout(){await this.request('/auth/session/logout','POST').catch(()=>{});await this.disconnect();this.token=null;this.currentUser=null;this.users.clear();this.servers.clear();this.channels.clear();this.messages.clear();}
}
