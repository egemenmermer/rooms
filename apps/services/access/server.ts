import {registerMusicGateway} from './music-gateway';
import { registerDmCalls } from './dm-calls';
import Fastify, { type FastifyRequest } from 'fastify';
import { RegistrationGate, issueRegistrationInvite } from './registration';
import { MongoClient } from 'mongodb';
import {StoatAuthorizationReader} from './stoat-authorization';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import { z } from 'zod';
import { StoatClient, StoatError } from '@rooms/stoat';
import { SOCIAL_ID_PATTERN } from '@rooms/social';
import { stoatChannelPermissions, StoatPermissions as Permissions, type StoatServer, type StoatChannel, type StoatMember } from './stoat-permissions';

export interface AccessConfig {musicUrl?:string;musicSecret?:string; stoatUrl?:string; /** Legacy configuration accepted only for validation tests; never contacts Spacebar. */ spacebarUrl?:string; livekitUrl:string; publicLivekitUrl:string; apiKey:string; apiSecret:string;registrationInvitesFile?:string;accountInviteMongoUrl?:string;socialReadMongoUrl?:string }
const opaqueId=z.string().regex(SOCIAL_ID_PATTERN); const channelBody=z.object({channelId:opaqueId}).strict();
const credentialBody=z.object({email:z.string().email().max(254),password:z.string().min(1).max(256)}).strict();
const registrationBody=credentialBody.extend({username:z.string().min(2).max(32).regex(/^[\p{L}\d_.-]+$/u),inviteCode:z.string().regex(/^[a-zA-Z0-9_-]{2,128}$/)});
export async function createAccessServer(config:AccessConfig){
  const server=Fastify({logger:false,bodyLimit:16384});
  // Media polling and room changes share this ingress budget, including proxied peers.
  await server.register(rateLimit,{max:600,timeWindow:'1 minute'});
  const rawBodies=new WeakMap<FastifyRequest,string>();
  server.removeContentTypeParser('application/json');
  server.addContentTypeParser(['application/json','application/webhook+json'],{parseAs:'string'},(request,body,done)=>{
    if(typeof body!=='string'){done(new Error('Invalid request body'));return;}
    rawBodies.set(request,body);try{done(null,JSON.parse(body));}catch{const error=new Error('Invalid JSON') as Error&{statusCode:number};error.statusCode=400;done(error);}
  });
  const webhookReceiver=new WebhookReceiver(config.apiKey,config.apiSecret);
  const roomService=new RoomServiceClient(config.livekitUrl,config.apiKey,config.apiSecret);
  const grants=new Map<string,{userId:string;channelId:string;token:string;lastSeen:number}>();
  const screenLeases=new Map<string,{userId:string;createdAt:number;leaseId:string}>();
  // Ephemeral consent is bound to a real media lease, never an Activity host.
  type PresenterRequest={requestId:string;userId:string;leaseId:string;createdAt:number;expiresAt:number};
  type PresenterReservation={requestId:string;userId:string;leaseId:string;expiresAt:number;released:boolean};
  const screenRequests=new Map<string,PresenterRequest[]>();
  const screenReservations=new Map<string,PresenterReservation>();
  const pruneScreen=(channelId:string)=>{
    const now=Date.now(),lease=screenLeases.get(channelId);
    const requests=(screenRequests.get(channelId)??[]).filter(r=>r.expiresAt>now&&r.leaseId===lease?.leaseId);
    if(requests.length)screenRequests.set(channelId,requests);else screenRequests.delete(channelId);
    const reservation=screenReservations.get(channelId);
    if(reservation&&(reservation.expiresAt<=now||(!reservation.released&&reservation.leaseId!==lease?.leaseId)))screenReservations.delete(channelId);
  };
  const invalidateScreenUser=(channelId:string,userId:string)=>{
    const lease=screenLeases.get(channelId);
    if(lease?.userId===userId){screenLeases.delete(channelId);screenRequests.delete(channelId);screenReservations.delete(channelId);}
    const requests=(screenRequests.get(channelId)??[]).filter(r=>r.userId!==userId);
    if(requests.length)screenRequests.set(channelId,requests);else screenRequests.delete(channelId);
    if(screenReservations.get(channelId)?.userId===userId)screenReservations.delete(channelId);
  };
  const inviteLocks=new Map<string,Promise<unknown>>();
  const socialOptions={trustedInternalOrigin:true,apiRoot:!new URL(config.stoatUrl??'http://127.0.0.1:3022').pathname.startsWith('/api')};
  const reader=config.socialReadMongoUrl?new StoatAuthorizationReader(config.socialReadMongoUrl):null;
  server.addHook('onClose',async()=>{await reader?.close();});
  const roomName=(id:string)=>`stoat-channel-${id}`;
  const dmCalls=registerDmCalls(server,{
    apiKey:config.apiKey,apiSecret:config.apiSecret,publicLivekitUrl:config.publicLivekitUrl,roomService,
    identify:token=>new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',token,socialOptions).getCurrentUser(),
    authorize:(token,dmId)=>new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',token,socialOptions).getCallPeer(dmId),
    disconnect:async room=>{try{await roomService.deleteRoom(room);}catch(error){if((error as {code?:string}).code!=='not_found')throw error;}},
  });
  const authorize=async(token:string,channelId:string)=>{
    const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',token,socialOptions);
    const user=await client.getCurrentUser();
    const context=reader?await reader.read(channelId,user.id):null;
    const channel=context?.channel??await client.getChannel(channelId);
    if(channel.channel_type!=='TextChannel'||!channel.voice||typeof channel.server!=='string')throw new StoatError(403,'VOICE_CHANNEL_REQUIRED');
    const [rawServer,rawMember]=context?[context.server,context.member]:await Promise.all([client.getServer(channel.server),client.getMember(channel.server,user.id)]);
    const permissions=stoatChannelPermissions(rawServer as StoatServer,channel as StoatChannel,rawMember as StoatMember,user.id);
    if((permissions&Permissions.VIEW_CHANNEL)===0n||(permissions&Permissions.CONNECT)===0n)throw new StoatError(403,'ROOM_ACCESS_DENIED');
    return {user,permissions};
  };
  const music=registerMusicGateway(server,{url:config.musicUrl,secret:config.musicSecret,apiKey:config.apiKey,apiSecret:config.apiSecret,livekitUrl:config.livekitUrl.replace(/^http/,'ws'),roomService,authorize:async(token,channelId)=>{const result=await authorize(token,channelId);return{userId:result.user.id,canControl:(result.permissions&Permissions.SPEAK)!==0n&&(result.permissions&Permissions.LISTEN)!==0n};}});
  const screenMember=async(token:string,channelId:string)=>{
    let result;try{result=await authorize(token,channelId);}catch(error){const grant=[...grants.values()].find(g=>g.channelId===channelId&&g.token===token);if(grant)invalidateScreenUser(channelId,grant.userId);throw error;}
    if((result.permissions&Permissions.VIDEO)===0n){invalidateScreenUser(channelId,result.user.id);throw new StoatError(403,'PRESENT_PERMISSION_REQUIRED');}
    const grant=grants.get(`${channelId}:${result.user.id}`);
    if(!grant||grant.token!==token)throw new StoatError(403,'JOIN_VOICE_FIRST');
    let participant;try{participant=await roomService.getParticipant(roomName(channelId),result.user.id);}catch(error){invalidateScreenUser(channelId,result.user.id);throw error;}
    if(!participant||participant.identity!==result.user.id){invalidateScreenUser(channelId,result.user.id);throw new StoatError(403,'JOIN_VOICE_FIRST');}
    return result;
  };
  const leaseContext=z.object({channelId:opaqueId,leaseId:z.string().uuid()}).strict();
  const requestContext=leaseContext.extend({requestId:z.string().uuid()});
  const requireLease=(channelId:string,leaseId:string)=>{
    pruneScreen(channelId);const lease=screenLeases.get(channelId);
    if(!lease||lease.leaseId!==leaseId)throw new StoatError(409,'SCREEN_LEASE_STALE');
    return lease;
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
      if(await dmCalls.webhook(room,identity))return {accepted:true};
      if(!room.startsWith('stoat-channel-'))return {accepted:true};
      const channelId=room.slice('stoat-channel-'.length);if(!SOCIAL_ID_PATTERN.test(channelId))return reply.code(400).send({error:'INVALID_ROOM'});
      if(await music.webhook(channelId,identity,event.participant.metadata??''))return {accepted:true};
      invalidateScreenUser(channelId,identity);
      const grant=grants.get(`${channelId}:${identity}`);
      let valid=false;try{if(grant){const result=await authorize(grant.token,channelId);valid=result.user.id===identity;}}catch{/* Fail closed on uncertain membership. */}
      if(!valid){await roomService.removeParticipant(room,identity);grants.delete(`${channelId}:${identity}`);invalidateScreenUser(channelId,identity);return {accepted:true,removed:true};}
      const {permissions}=await authorize(grant!.token,channelId);
      await roomService.updateParticipant(room,identity,{permission:{canPublish:sources(permissions).length>0,canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublishData:false,canPublishSources:sources(permissions)}});
    }
    if(event.event==='participant_left'&&event.room?.name?.startsWith('stoat-channel-')&&event.participant?.identity)invalidateScreenUser(event.room.name.slice('stoat-channel-'.length),event.participant.identity);
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
  server.get('/v1/auth/invites/:code' ,{config:{rateLimit:{max:60,timeWindow:'1 minute'}}},async request=>{
    const code=z.object({code:z.string().regex(/^[A-Za-z0-9_-]{2,128}$/)}).parse(request.params).code;
    const ticket=await registration.inspect(code);const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',undefined,socialOptions);
    const invite=await client.inspectUpstreamInvite(ticket.communityInviteCode);return {...invite,code,expiresAt:ticket.expiresAt};
  });
  server.post('/v1/auth/invites/:code/join',{config:{rateLimit:{max:60,timeWindow:'1 minute'}}},async request=>{
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
  // Observation is authorized independently of joining/publishing media.
  server.post('/v1/media/directory',{config:{rateLimit:{max:30,timeWindow:'1 minute',keyGenerator:(request:FastifyRequest)=>'voice-directory:'+createHash('sha256').update(request.headers.authorization??request.ip).digest('hex')}}},async request=>{
    const {channelIds}=z.object({channelIds:z.array(opaqueId).min(1).max(32)}).strict().parse(request.body);
    const token=tokenOf(request.headers.authorization);
    const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',token,socialOptions);
    const user=await client.getCurrentUser();
    const permitted:string[]=[];
    for(const channelId of new Set(channelIds)){
      try{
        const context=reader?await reader.read(channelId,user.id):null;
        const channel=context?.channel??await client.getChannel(channelId);
        if(channel.channel_type!=='TextChannel'||!channel.voice||typeof channel.server!=='string')continue;
        const [rawServer,rawMember]=context?[context.server,context.member]:await Promise.all([client.getServer(channel.server),client.getMember(channel.server,user.id)]);
        const permissions=stoatChannelPermissions(rawServer as StoatServer,channel as StoatChannel,rawMember as StoatMember,user.id);
        if((permissions&Permissions.VIEW_CHANNEL)!==0n)permitted.push(channelId);
      }catch(error){if(!(error instanceof StoatError)||![403,404].includes(error.status))throw error;}
    }
    if(!permitted.length)return {rooms:[]};
    const liveRooms=await roomService.listRooms(permitted.map(roomName));
    const liveNames=new Set(liveRooms.map(room=>room.name));
    const rooms=await Promise.all(permitted.map(async channelId=>{
      let participants:Awaited<ReturnType<typeof roomService.listParticipants>>=[];
      if(liveNames.has(roomName(channelId)))try{participants=await roomService.listParticipants(roomName(channelId));}catch(error){if((error as {code?:string}).code!=='not_found')throw error;}
      return {channelId,participants:participants.slice(0,100).map(p=>({id:p.identity,name:(p.name||p.identity).slice(0,128),muted:!p.tracks.some(t=>t.source===TrackSource.MICROPHONE&&!t.muted)}))};
    }));
    return {rooms};
  });
  server.post('/v1/media/grant',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);const {user,permissions}=await authorize(token,channelId);
    const access=new AccessToken(config.apiKey,config.apiSecret,{identity:user.id,name:user.displayName,ttl:300});
    access.addGrant({roomJoin:true,room:roomName(channelId),canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublish:sources(permissions).length>0,canPublishSources:sources(permissions),canPublishData:false,canUpdateOwnMetadata:false});
    grants.set(`${channelId}:${user.id}`,{userId:user.id,channelId,token,lastSeen:Date.now()});
    return {serverUrl:config.publicLivekitUrl,roomName:roomName(channelId),token:await access.toJwt(),expiresAt:new Date(Date.now()+300000).toISOString()};
  });
  server.post('/v1/media/screen/state',async request=>{
    const {channelId}=channelBody.parse(request.body);await screenMember(tokenOf(request.headers.authorization),channelId);pruneScreen(channelId);
    const lease=screenLeases.get(channelId),reservation=screenReservations.get(channelId);
    return {presenter:lease?{userId:lease.userId,leaseId:lease.leaseId}:null,requests:screenRequests.get(channelId)??[],reservation:reservation??null};
  });
  server.post('/v1/media/screen/request',async request=>{
    const {channelId,leaseId,requestId}=requestContext.parse(request.body);const {user}=await screenMember(tokenOf(request.headers.authorization),channelId);
    const lease=requireLease(channelId,leaseId);
    if(lease.userId===user.id)throw new StoatError(409,'ALREADY_PRESENTER');
    if(screenReservations.has(channelId))throw new StoatError(409,'SCREEN_HANDOFF_PENDING');
    const requests=screenRequests.get(channelId)??[];
    if(requests.some(r=>r.userId===user.id||r.requestId===requestId))throw new StoatError(409,'SCREEN_REQUEST_EXISTS');
    if(requests.length>=20||(!screenRequests.has(channelId)&&screenRequests.size>=1000))throw new StoatError(409,'SCREEN_REQUEST_LIMIT');
    const entry={requestId,userId:user.id,leaseId,createdAt:Date.now(),expiresAt:Date.now()+60000};requests.push(entry);screenRequests.set(channelId,requests);
    return {request:entry};
  });
  server.post('/v1/media/screen/request/cancel',async request=>{
    const {channelId,leaseId,requestId}=requestContext.parse(request.body);const {user}=await screenMember(tokenOf(request.headers.authorization),channelId);pruneScreen(channelId);
    const reservation=screenReservations.get(channelId);
    if(reservation?.requestId===requestId&&reservation.leaseId===leaseId){if(reservation.userId!==user.id)throw new StoatError(403,'SCREEN_REQUEST_OWNER_REQUIRED');screenReservations.delete(channelId);return {cancelled:true};}
    requireLease(channelId,leaseId);const requests=screenRequests.get(channelId)??[],entry=requests.find(r=>r.requestId===requestId);
    if(!entry)throw new StoatError(409,'SCREEN_REQUEST_STALE');if(entry.userId!==user.id)throw new StoatError(403,'SCREEN_REQUEST_OWNER_REQUIRED');
    screenRequests.set(channelId,requests.filter(r=>r!==entry));return {cancelled:true};
  });
  server.post('/v1/media/screen/request/decide',async request=>{
    const {channelId,leaseId,requestId,approve}=requestContext.extend({approve:z.boolean()}).parse(request.body);
    const {user}=await screenMember(tokenOf(request.headers.authorization),channelId);const lease=requireLease(channelId,leaseId);
    if(lease.userId!==user.id)throw new StoatError(403,'SCREEN_PRESENTER_REQUIRED');
    if(screenReservations.has(channelId))throw new StoatError(409,'SCREEN_HANDOFF_PENDING');
    const requests=screenRequests.get(channelId)??[],entry=requests.find(r=>r.requestId===requestId);
    if(!entry)throw new StoatError(409,'SCREEN_REQUEST_STALE');
    if(approve){
      const grant=grants.get(`${channelId}:${entry.userId}`);if(!grant)throw new StoatError(409,'SCREEN_REQUEST_STALE');
      const requester=await screenMember(grant.token,channelId);if(requester.user.id!==entry.userId)throw new StoatError(409,'SCREEN_REQUEST_STALE');
      const controller=await screenMember(tokenOf(request.headers.authorization),channelId);if(controller.user.id!==user.id)throw new StoatError(403,'SCREEN_PRESENTER_REQUIRED');
      requireLease(channelId,leaseId);
      if(entry.expiresAt<=Date.now()||!(screenRequests.get(channelId)??[]).includes(entry)||screenReservations.has(channelId))throw new StoatError(409,'SCREEN_REQUEST_STALE');
      screenReservations.set(channelId,{requestId,userId:entry.userId,leaseId,expiresAt:Date.now()+30000,released:false});screenRequests.delete(channelId);
    }else screenRequests.set(channelId,requests.filter(r=>r!==entry));
    return {approved:approve,awaitingRelease:approve};
  });
  server.post('/v1/media/screen/acquire',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);const {user,permissions}=await authorize(token,channelId);
    if((permissions&Permissions.VIDEO)===0n){invalidateScreenUser(channelId,user.id);throw new StoatError(403,'PRESENT_PERMISSION_REQUIRED');}
    pruneScreen(channelId);const reservation=screenReservations.get(channelId);
    if(reservation&&(!reservation.released||reservation.userId!==user.id))throw new StoatError(409,'SCREEN_HANDOFF_PENDING');
    if(reservation)await screenMember(token,channelId);
    // Recheck after async authorization: a cancelled/expired reservation cannot authorize acquisition.
    if(reservation&&(screenReservations.get(channelId)!==reservation||reservation.expiresAt<=Date.now()))throw new StoatError(409,'SCREEN_RESERVATION_STALE');
    const previous=screenLeases.get(channelId);if(previous&&previous.userId!==user.id)throw new StoatError(409,'PRESENTER_BUSY');
    if(!previous&&screenLeases.size>=1000)throw new StoatError(409,'SCREEN_LEASE_LIMIT');
    const lease=previous??{userId:user.id,createdAt:Date.now(),leaseId:randomUUID()};
    screenLeases.set(channelId,lease);
    try{
      const participants=await roomService.listParticipants(roomName(channelId));
      if(screenLeases.get(channelId)!==lease)throw new StoatError(409,'SCREEN_LEASE_STALE');
      if(participants.some(p=>p.identity!==user.id&&p.tracks.some(t=>t.source===TrackSource.SCREEN_SHARE||t.source===TrackSource.SCREEN_SHARE_AUDIO)))throw new StoatError(409,'PRESENTER_BUSY');
      if(reservation&&(screenReservations.get(channelId)!==reservation||reservation.expiresAt<=Date.now()))throw new StoatError(409,'SCREEN_RESERVATION_STALE');
      const current=await authorize(token,channelId);if(current.user.id!==user.id||(current.permissions&Permissions.VIDEO)===0n)throw new StoatError(403,'PRESENT_PERMISSION_REQUIRED');
      if(screenLeases.get(channelId)!==lease||reservation&&(screenReservations.get(channelId)!==reservation||reservation.expiresAt<=Date.now()))throw new StoatError(409,'SCREEN_LEASE_STALE');
      await roomService.updateParticipant(roomName(channelId),user.id,{permission:{canPublish:true,canSubscribe:(current.permissions&Permissions.LISTEN)!==0n,canPublishData:false,canPublishSources:sources(current.permissions,true)}});
      if(screenLeases.get(channelId)!==lease||reservation&&(screenReservations.get(channelId)!==reservation||reservation.expiresAt<=Date.now())){await roomService.updateParticipant(roomName(channelId),user.id,{permission:{canPublishSources:sources(permissions)}});throw new StoatError(409,'SCREEN_LEASE_STALE');}
      if(reservation)screenReservations.delete(channelId);screenRequests.delete(channelId);
      return {granted:true,leaseId:lease.leaseId};
    }catch(error){
      if(!previous&&screenLeases.get(channelId)===lease){
        // An uncertain grant must keep excluding others until SFU permission revocation succeeds.
        try{await roomService.updateParticipant(roomName(channelId),user.id,{permission:{canPublishSources:sources(permissions)}});if(screenLeases.get(channelId)===lease)screenLeases.delete(channelId);}catch{/* Retain the lease; the membership sweep retries safe cleanup. */}
      }throw error;
    }
  });
  server.post('/v1/media/screen/release',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);const {user,permissions}=await authorize(token,channelId);pruneScreen(channelId);
    const lease=screenLeases.get(channelId);
    // Keep the lease blocking acquisition until publication permission was actually removed.
    await roomService.updateParticipant(roomName(channelId),user.id,{permission:{canPublish:sources(permissions).length>0,canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublishData:false,canPublishSources:sources(permissions)}});
    if(lease?.userId===user.id&&screenLeases.get(channelId)===lease){screenLeases.delete(channelId);screenRequests.delete(channelId);const reservation=screenReservations.get(channelId);if(reservation?.leaseId===lease.leaseId)reservation.released=true;}
    return {released:true};
  });
  server.post('/v1/media/leave',async request=>{
    const {channelId}=channelBody.parse(request.body);const token=tokenOf(request.headers.authorization);const client=new StoatClient(config.stoatUrl??'http://127.0.0.1:3022',token,socialOptions);const user=await client.getCurrentUser();
    grants.delete(`${channelId}:${user.id}`);invalidateScreenUser(channelId,user.id);
    await roomService.removeParticipant(roomName(channelId),user.id).catch(()=>{});return {left:true};
  });
  // Recheck memberships on existing sessions; revoked permissions terminate media.
  let sweeping=false;
  const sweep=setInterval(async()=>{
    if(sweeping)return;sweeping=true;
    try{for(const channelId of new Set([...screenRequests.keys(),...screenReservations.keys()]))pruneScreen(channelId);for(const [key,grant]of grants){
      try{
        const {permissions}=await authorize(grant.token,grant.channelId);
        const participant=await roomService.getParticipant(roomName(grant.channelId),grant.userId).catch(()=>null);
        if(!participant&&Date.now()-grant.lastSeen>30000){grants.delete(key);invalidateScreenUser(grant.channelId,grant.userId);}
        if((permissions&Permissions.VIDEO)===0n)invalidateScreenUser(grant.channelId,grant.userId);
        pruneScreen(grant.channelId);const lease=screenLeases.get(grant.channelId);
        if(participant)await roomService.updateParticipant(roomName(grant.channelId),grant.userId,{permission:{canSubscribe:(permissions&Permissions.LISTEN)!==0n,canPublish:sources(permissions).length>0,canPublishSources:sources(permissions,lease?.userId===grant.userId&&(permissions&Permissions.VIDEO)!==0n)}});
        if(lease?.userId===grant.userId&&Date.now()-lease.createdAt>15000&&!participant?.tracks.some(t=>t.source===TrackSource.SCREEN_SHARE||t.source===TrackSource.SCREEN_SHARE_AUDIO)){if(participant){const {permissions}=await authorize(grant.token,grant.channelId);await roomService.updateParticipant(roomName(grant.channelId),grant.userId,{permission:{canPublishSources:sources(permissions)}});}if(screenLeases.get(grant.channelId)===lease)invalidateScreenUser(grant.channelId,grant.userId);}
      }catch(error){if(error instanceof StoatError&&(error.status===401||error.status===403||error.status===404)){await roomService.removeParticipant(roomName(grant.channelId),grant.userId).catch(()=>{});grants.delete(key);invalidateScreenUser(grant.channelId,grant.userId);}}
    }}finally{sweeping=false;}
  },10000);sweep.unref();server.addHook('onClose',async()=>{clearInterval(sweep);grants.clear();screenLeases.clear();screenRequests.clear();screenReservations.clear();});
  return server;
}
