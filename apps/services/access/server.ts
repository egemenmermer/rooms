import Fastify, { type FastifyRequest } from 'fastify';
import { RegistrationGate, issueRegistrationInvite } from './registration';
import { MongoClient } from 'mongodb';
import { randomBytes } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import { z } from 'zod';
import { StoatClient, StoatError } from '@rooms/stoat';
import { SOCIAL_ID_PATTERN } from '@rooms/social';
import { stoatChannelPermissions, StoatPermissions as Permissions, type StoatServer, type StoatChannel, type StoatMember } from './stoat-permissions';

export interface AccessConfig { stoatUrl?:string; /** Legacy configuration accepted only for validation tests; never contacts Spacebar. */ spacebarUrl?:string; livekitUrl:string; publicLivekitUrl:string; apiKey:string; apiSecret:string;registrationInvitesFile?:string;accountInviteMongoUrl?:string }
const opaqueId=z.string().regex(SOCIAL_ID_PATTERN); const channelBody=z.object({channelId:opaqueId}).strict();
const credentialBody=z.object({email:z.string().email().max(254),password:z.string().min(1).max(256)}).strict();
const registrationBody=credentialBody.extend({username:z.string().min(2).max(32).regex(/^[\p{L}\d_.-]+$/u),inviteCode:z.string().regex(/^[a-zA-Z0-9_-]{2,128}$/)});
export async function createAccessServer(config:AccessConfig){
  const server=Fastify({logger:false,bodyLimit:16384});
  await server.register(rateLimit,{max:60,timeWindow:'1 minute'});
  const rawBodies=new WeakMap<FastifyRequest,string>();
  server.removeContentTypeParser('application/json');
  server.addContentTypeParser(['application/json','application/webhook+json'],{parseAs:'string'},(request,body,done)=>{
    if(typeof body!=='string'){done(new Error('Invalid request body'));return;}
    rawBodies.set(request,body);try{done(null,JSON.parse(body));}catch{const error=new Error('Invalid JSON') as Error&{statusCode:number};error.statusCode=400;done(error);}
  });
  const webhookReceiver=new WebhookReceiver(config.apiKey,config.apiSecret);
  const roomService=new RoomServiceClient(config.livekitUrl,config.apiKey,config.apiSecret);
  const grants=new Map<string,{userId:string;channelId:string;token:string;lastSeen:number}>();
  const screenLeases=new Map<string,{userId:string;createdAt:number}>();
  const inviteLocks=new Map<string,Promise<unknown>>();
  const socialOptions={trustedInternalOrigin:true,apiRoot:!new URL(config.stoatUrl??'http://127.0.0.1:3022').pathname.startsWith('/api')};
  const roomName=(id:string)=>`stoat-channel-${id}`;
  const authorize=async(token:string,channelId:string)=>{
    const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',token,socialOptions);
    const [user,channel]=await Promise.all([client.getCurrentUser(),client.getChannel(channelId)]);
    if(channel.channel_type!=='TextChannel'||!channel.voice||typeof channel.server!=='string')throw new StoatError(403,'VOICE_CHANNEL_REQUIRED');
    const [rawServer,rawMember]=await Promise.all([client.getServer(channel.server),client.getMember(channel.server,user.id)]);
    const permissions=stoatChannelPermissions(rawServer as StoatServer,channel as StoatChannel,rawMember as StoatMember,user.id);
    if((permissions&Permissions.VIEW_CHANNEL)===0n||(permissions&Permissions.CONNECT)===0n)throw new StoatError(403,'ROOM_ACCESS_DENIED');
    return {user,permissions};
  };
  const tokenOf=(header:string|undefined)=>{if(!header||header.length>8192)throw new StoatError(401,'AUTH_REQUIRED');return header.replace(/^Bearer /,'');};
  const sources=(permissions:bigint,screen=false)=>[...((permissions&Permissions.SPEAK)!==0n?[TrackSource.MICROPHONE]:[]),...((permissions&Permissions.VIDEO)!==0n?[TrackSource.CAMERA]:[]),...(screen?[TrackSource.SCREEN_SHARE,TrackSource.SCREEN_SHARE_AUDIO]:[])];
  server.setErrorHandler((error,request,reply)=>{
    if(error instanceof StoatError)return reply.code(error.status).send({error:error.code,message:error.message});
    if(error instanceof z.ZodError)return reply.code(400).send({error:'INVALID_INPUT',message:'Check the supplied fields and retry.'});
    if((error as {statusCode?:number}).statusCode===400)return reply.code(400).send({error:'INVALID_INPUT'});
    if((error as {statusCode?:number}).statusCode===429)return reply.code(429).send({error:'RATE_LIMITED',message:'Too many requests. Please wait before retrying.'});
    return reply.code(503).send({error:'SERVICE_UNAVAILABLE',message:'The access or media service is unavailable. Retry shortly.'});
  });
  server.post('/v1/media/webhook',{bodyLimit:65536,config:{rateLimit:{max:240,timeWindow:'1 minute'}}},async(request,reply)=>{
    let event;try{event=await webhookReceiver.receive(rawBodies.get(request)??'',request.headers.authorization);}catch{return reply.code(401).send({error:'INVALID_WEBHOOK_SIGNATURE'});}
    if(event.event==='participant_joined'&&event.room?.name&&event.participant?.identity){
      const room=event.room.name,identity=event.participant.identity;
      if(!room.startsWith('stoat-channel-'))return {accepted:true};
      const channelId=room.slice('stoat-channel-'.length);if(!SOCIAL_ID_PATTERN.test(channelId))return reply.code(400).send({error:'INVALID_ROOM'});
      const grant=grants.get(`${channelId}:${identity}`);
      let valid=false;try{if(grant){const result=await authorize(grant.token,channelId);valid=result.user.id===identity;}}catch{/* Fail closed on uncertain membership. */}
      if(!valid){await roomService.removeParticipant(room,identity);grants.delete(`${channelId}:${identity}`);if(screenLeases.get(channelId)?.userId===identity)screenLeases.delete(channelId);return {accepted:true,removed:true};}
      const {permissions}=await authorize(grant!.token,channelId);
      await roomService.updateParticipant(room,identity,{permission:{canPublish:sources(permissions).length>0,canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublishData:false,canPublishSources:sources(permissions)}});
    }
    return {accepted:true};
  });
  server.get('/health' ,async()=>({service:'rooms-access',ready:true}));
  const accountDatabase=config.accountInviteMongoUrl?new MongoClient(config.accountInviteMongoUrl,{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000}):null;
  server.addHook('onClose',async()=>{await accountDatabase?.close();});
  const registration=new RegistrationGate(config.registrationInvitesFile??'.local/stoat/registration-invites.json');
  server.post('/v1/invites',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);
    if(!accountDatabase)throw new StoatError(501,'INVITE_PROVISIONING_UNAVAILABLE');
    const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',token,socialOptions);
    const [user,channel]=await Promise.all([client.getCurrentUser(),client.getChannel(channelId)]);
    if(channel.channel_type!=='TextChannel'||typeof channel.server!=='string')throw new StoatError(403,'SERVER_CHANNEL_REQUIRED');
    const [rawServer,rawMember]=await Promise.all([client.getServer(channel.server),client.getMember(channel.server,user.id)]);
    const permissions=stoatChannelPermissions(rawServer as StoatServer,channel as StoatChannel,rawMember as StoatMember,user.id);
    if(!(permissions&(1n<<25n))||rawServer.owner!==user.id)throw new StoatError(403,'INVITE_ADMIN_REQUIRED');
    const upstream=await client.createUpstreamInvite(channelId);const accountCode=randomBytes(32).toString('base64url');
    await accountDatabase.db('revolt').collection('account_invites').insertOne({_id:accountCode,used:false} as any);
    const issued=await issueRegistrationInvite(registration.path,accountCode,upstream.code);
    return {...upstream,code:issued.code,expiresAt:issued.expiresAt};
  });
  server.get('/v1/auth/invites/:code' ,async request=>{
    const code=z.object({code:z.string().regex(/^[A-Za-z0-9_-]{2,128}$/)}).parse(request.params).code;
    const ticket=await registration.inspect(code);const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',undefined,socialOptions);
    const invite=await client.inspectUpstreamInvite(ticket.communityInviteCode);return {...invite,code,expiresAt:ticket.expiresAt};
  });
  server.post('/v1/auth/invites/:code/join',async request=>{
    const code=z.object({code:z.string().regex(/^[A-Za-z0-9_-]{2,128}$/)}).parse(request.params).code;
    const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',tokenOf(request.headers.authorization),socialOptions);await client.getCurrentUser();
    return registration.consume(code,async invitation=>{const joined=await client.acceptInvite(invitation.communityInviteCode);return {...joined,code};});
  });
  server.post('/v1/auth/register'  ,{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async request=>{
    const body=registrationBody.parse(request.body);
    return registration.consume(body.inviteCode,async invitation=>{
      const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',undefined,socialOptions);
      await client.registerUpstream({...body,inviteCode:invitation.communityInviteCode,accountInviteCode:invitation.accountInviteCode});
      const token=client.getToken();if(!token)throw new StoatError(502,'INVALID_SESSION_RESPONSE');return {token};
    });
  });
  // Reject legacy Discord-shaped auth endpoints; clients must use Stoat's official account/session flow.
  server.post('/api/v9/auth/register',async(_request,reply)=>reply.code(400).send({error:'STOAT_AUTH_REQUIRED'}));
  server.post('/v1/media/grant',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);const {user,permissions}=await authorize(token,channelId);
    const access=new AccessToken(config.apiKey,config.apiSecret,{identity:user.id,name:user.displayName,ttl:300});
    access.addGrant({roomJoin:true,room:roomName(channelId),canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublish:sources(permissions).length>0,canPublishSources:sources(permissions),canPublishData:false,canUpdateOwnMetadata:false});
    grants.set(`${channelId}:${user.id}`,{userId:user.id,channelId,token,lastSeen:Date.now()});
    return {serverUrl:config.publicLivekitUrl,roomName:roomName(channelId),token:await access.toJwt(),expiresAt:new Date(Date.now()+300000).toISOString()};
  });
  server.post('/v1/media/screen/acquire',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);const {user,permissions}=await authorize(token,channelId);
    if((permissions&Permissions.VIDEO)===0n)throw new StoatError(403,'PRESENT_PERMISSION_REQUIRED');
    const lease=screenLeases.get(channelId);
    if(lease&&lease.userId!==user.id)throw new StoatError(409,'PRESENTER_BUSY');
    // Claim before awaiting, so two concurrent requests cannot both pass.
    screenLeases.set(channelId,{userId:user.id,createdAt:Date.now()});
    try{
      const participants=await roomService.listParticipants(roomName(channelId));
      if(participants.some(p=>p.identity!==user.id&&p.tracks.some(t=>t.source===TrackSource.SCREEN_SHARE)))throw new StoatError(409,'PRESENTER_BUSY');
      await roomService.updateParticipant(roomName(channelId),user.id,{permission:{canPublish:true,canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublishData:false,canPublishSources:sources(permissions,true)}});
      return {granted:true};
    }catch(error){if(screenLeases.get(channelId)?.userId===user.id)screenLeases.delete(channelId);throw error;}
  });
  server.post('/v1/media/screen/release',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);const {user,permissions}=await authorize(token,channelId);
    if(screenLeases.get(channelId)?.userId===user.id)screenLeases.delete(channelId);
    await roomService.updateParticipant(roomName(channelId),user.id,{permission:{canPublish:true,canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublishData:false,canPublishSources:sources(permissions)}});
    return {released:true};
  });
  server.post('/v1/media/leave',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',token,socialOptions);const user=await client.getCurrentUser();
    grants.delete(`${channelId}:${user.id}`);if(screenLeases.get(channelId)?.userId===user.id)screenLeases.delete(channelId);
    await roomService.removeParticipant(roomName(channelId),user.id).catch(()=>{});return {left:true};
  });
  // Recheck memberships on existing sessions; revoked permissions terminate media.
  let sweeping=false;
  const sweep=setInterval(async()=>{
    if(sweeping)return;sweeping=true;
    try{for(const [key,grant]of grants){
      try{
        const {permissions}=await authorize(grant.token,grant.channelId);
        const participant=await roomService.getParticipant(roomName(grant.channelId),grant.userId).catch(()=>null);
        if(!participant&&Date.now()-grant.lastSeen>30000){grants.delete(key);if(screenLeases.get(grant.channelId)?.userId===grant.userId)screenLeases.delete(grant.channelId);}
        const lease=screenLeases.get(grant.channelId);
        if(participant)await roomService.updateParticipant(roomName(grant.channelId),grant.userId,{permission:{canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublish:sources(permissions).length>0,canPublishSources:sources(permissions,lease?.userId===grant.userId&&(permissions&Permissions.VIDEO)!==0n)}});
        if(lease?.userId===grant.userId&&Date.now()-lease.createdAt>15000&&!participant?.tracks.some(t=>t.source===TrackSource.SCREEN_SHARE)){screenLeases.delete(grant.channelId);if(participant){const {permissions}=await authorize(grant.token,grant.channelId);await roomService.updateParticipant(roomName(grant.channelId),grant.userId,{permission:{canPublishSources:sources(permissions)}});}}
      }catch(error){if(error instanceof StoatError&&(error.status===401||error.status===403||error.status===404)){await roomService.removeParticipant(roomName(grant.channelId),grant.userId).catch(()=>{});grants.delete(key);if(screenLeases.get(grant.channelId)?.userId===grant.userId)screenLeases.delete(grant.channelId);}}
    }}finally{sweeping=false;}
  },10000);sweep.unref();server.addHook('onClose',async()=>{clearInterval(sweep);grants.clear();screenLeases.clear();});
  return server;
}
