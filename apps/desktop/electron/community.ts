import {soundboardCatalogSchema,soundboardClipSchema} from '../../../packages/shared-contracts/src/soundboard';
import {musicCommandSchema,musicSnapshotSchema,musicSearchQuerySchema,musicSearchResultsSchema} from '../../../packages/shared-contracts/src/music';
import { release } from 'node:os';
import { enumerateCaptureSources, CaptureSourcesError } from './capture-sources';
import { ConversationVault } from './conversation-vault';
import { PasswordRecoveryBroker } from './password-recovery';
import { requestDmCall } from './dm-call-http';
import { dmCallStartSchema, dmCallActionSchema, dmCallIdSchema, type DmCallSession } from '../../../packages/shared-contracts/src/dm-call';
import { app, clipboard, dialog, desktopCapturer, ipcMain, safeStorage, session, systemPreferences, type BrowserWindow, type IpcMainInvokeEvent, type DesktopCapturerSource } from 'electron';
import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync, openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { z } from 'zod';
import { StoatClient, StoatError } from '@rooms/stoat';
import { SOCIAL_ID_PATTERN, type SocialUser, type GatewayEvent } from '@rooms/social';
import type { SocialSession } from '@rooms/contracts';
import { postActivityCommand, getActivitySnapshot } from './activity-http';

class SocialInputError extends Error {}

export async function setupCommunity(getWindow:()=>BrowserWindow|null,assertSender:(event:IpcMainInvokeEvent)=>void,isTrusted:(url:string)=>boolean,onIncomingMessage:(scope:{serverUrl:string;userId:string},channelId:string)=>void=()=>{}){
  let dmNativeEpoch=0;
  let pendingDmCall:{client:StoatClient;id:string}|null=null;
  const closeDmCall=async()=>{++dmNativeEpoch;const previous=pendingDmCall;pendingDmCall=null;if(previous)await requestDmCall(previous.client,'respond',{callId:previous.id,action:'end'}).catch(()=>{});};
  let client:StoatClient|null=null;let user:SocialUser|null=null;let remembered=false;let unsubscribe:(()=>void)|null=null;let authRequestEpoch=0;let sessionEpoch=0;let recoveryEpoch=0;
  const uploadedAttachments=new Map<string,{channelId:string;name:string;size:number;mime:string}>();
  let activePresenceSpace:string|null=null;
  const subscribePresence=()=>{if(activePresenceSpace&&getWindow()?.isFocused())client?.subscribePresence(activePresenceSpace);};
  const presenceTimer=setInterval(subscribePresence,5*60000);presenceTimer.unref();
  app.on('browser-window-created',(_event,window)=>window.on('focus',()=>{if(window===getWindow())subscribePresence();}));
  const supportsSystemAudio=()=>process.platform==='win32'||process.platform==='darwin'&&(Number(release().split('.')[0])>23||Number(release().split('.')[0])===23&&Number(release().split('.')[1])>=2);
  let selectedAudio=false;let selected:DesktopCapturerSource|null=null;let selectedAt=0;let choices:DesktopCapturerSource[]=[];let choicesAt=0;
  const conversationVault=new ConversationVault(app.getPath('userData'),safeStorage);
  const vault=join(app.getPath('userData'),'stoat-session-v1.bin');
  const auth=z.object({serverUrl:z.string().max(2048),email:z.string().email().max(254),password:z.string().min(1).max(256)}).strict();
  const registration=auth.extend({username:z.string().min(2).max(32),inviteCode:z.string().regex(/^[a-zA-Z0-9_-]{2,128}$/),accountInviteCode:z.string().regex(/^[a-zA-Z0-9_-]{2,128}$/).optional()});
  const recoveryServer=z.string().min(1).max(2048);
  const recoveryInput=z.object({serverUrl:recoveryServer,email:z.string().email().max(254)}).strict();
  let recoveryPending=false;
  const id=z.string().regex(SOCIAL_ID_PATTERN);const code=z.string().regex(/^[a-zA-Z0-9_-]{2,128}$/);const content=z.string().trim().min(1).max(4000);const messageContent=z.string().trim().max(4000);
  const fixtureWindow=()=>!app.isPackaged&&new URL(getWindow()?.webContents.getURL()||'about:blank').searchParams.has('fixture');
  const emit=(event:GatewayEvent)=>{const win=getWindow();if(win&&!win.webContents.isDestroyed()&&!fixtureWindow())win.webContents.send('rooms:social-event',{...event,sessionEpoch});};
  const snapshot=():SocialSession=>({instanceUrl:client?.instanceUrl??null,user,status:client?.status??'not-configured',remembered,sessionEpoch});
  function bind(next:StoatClient,generation:number){if(client&&client!==next)void closeDmCall();unsubscribe?.();client=next;unsubscribe=client.subscribe(event=>{
    if(client!==next||generation!==sessionEpoch)return;
    if(event.type==='AUTH_EXPIRED'){conversationVault.clear();recoveryEpoch++;passwordReset.clear();}
    if(event.type==='READY')subscribePresence();
    if(event.type==='CHANNEL_ACCESS_INVALIDATED'){const ids=(event.data as {channelIds:string[]}).channelIds;for(const channelId of ids)conversationVault.remove(channelId);for(const [fileId,file]of uploadedAttachments)if(ids.includes(file.channelId))uploadedAttachments.delete(fileId);}
    if(event.type==='MESSAGE_CREATE'||event.type==='MESSAGE_UPDATE')conversationVault.change(event.data as import('@rooms/social').SocialMessage);
    if(event.type==='MESSAGE_DELETE'){const d=event.data as {id:string;channel_id:string};conversationVault.deleteMessage(d.channel_id,d.id);}
    if(event.type==='MESSAGE_CREATE'){const message=event.data as {author?:{id?:unknown};channelId?:unknown},authorId=message.author?.id;if(user&&typeof authorId==='string'&&authorId!==user.id&&typeof message.channelId==='string'&&SOCIAL_ID_PATTERN.test(message.channelId))onIncomingMessage({serverUrl:next.instanceUrl,userId:user.id},message.channelId);}
    if(['READY','RESUMED','CONNECTION_STATUS','AUTH_EXPIRED','MESSAGE_CREATE','MESSAGE_UPDATE','PRESENCE_UPDATE','SOCIAL_REFRESH','MESSAGE_ACK','READ_STATE_SYNC','READ_STATE_UNAVAILABLE','TYPING_UPDATE','CHANNEL_ACCESS_INVALIDATED'].includes(event.type))emit(event);
    else if(event.type==='MESSAGE_DELETE'){const raw=event.data as Record<string,unknown>;emit({type:event.type,data:{id:String(raw.id),channel_id:String(raw.channel_id)}});}
    else if(event.type==='PRESENCE_UPDATE'){const raw=event.data as {user?:{id?:string};status?:string;guild_id?:string};emit({type:event.type,data:{userId:raw.user?.id,status:raw.status,guildId:raw.guild_id}});}
    else if(['GUILD_CREATE','GUILD_DELETE','CHANNEL_CREATE','CHANNEL_UPDATE','CHANNEL_DELETE','RELATIONSHIP_ADD','RELATIONSHIP_REMOVE','GUILD_MEMBER_REMOVE'].includes(event.type))emit({type:'SOCIAL_REFRESH',data:null});
  });}
  const remember=()=>{remembered=false;if(!client?.getToken()||!safeStorage.isEncryptionAvailable()){if(existsSync(vault))unlinkSync(vault);return;}writeFileSync(vault,safeStorage.encryptString(JSON.stringify({provider:'stoat',version:1,url:client.instanceUrl,token:client.getToken()})),{mode:0o600});remembered=true;};
  const requireClient=()=>{if(!client||!user)throw new StoatError(401,'SIGN_IN_REQUIRED');return client;};
  const handle=(name:string,handler:(...args:unknown[])=>unknown)=>ipcMain.handle(name,async(event,...args)=>{
    assertSender(event);try{if(fixtureWindow())throw new SocialInputError('Native account access is disabled in development fixtures.');const scoped=!['rooms:social-session','rooms:social-login','rooms:social-register','rooms:social-logout','rooms:social-password-recovery-capabilities','rooms:social-password-recovery-request'].includes(name);const owner=client,ownerId=user?.id;const result=await handler(...args);if(scoped&&(client!==owner||user?.id!==ownerId))throw new SocialInputError('The account changed. Retry this action in the current account.');return result;}catch(error){if(error instanceof StoatError||error instanceof SocialInputError||error instanceof CaptureSourcesError)throw new Error(error.message);if(error instanceof z.ZodError)throw new Error('Check the supplied fields and retry.');throw new Error('This operation could not complete. Check your server, permissions, and connection.');}
  });
  handle('rooms:social-session',()=>snapshot());
  handle('rooms:social-read-states',()=>requireClient().readStates());
  const replaceSession=async(next:StoatClient,nextUser:SocialUser,request:number)=>{if(request!==authRequestEpoch){await next.disconnect().catch(()=>{});throw new SocialInputError('A newer account change has replaced this sign-in.');}const previous=client;const generation=++sessionEpoch;unsubscribe?.();unsubscribe=null;client=null;user=null;activePresenceSpace=null;uploadedAttachments.clear();remembered=false;if(existsSync(vault))unlinkSync(vault);await closeDmCall();await previous?.disconnect();if(request!==authRequestEpoch){await next.disconnect().catch(()=>{});throw new SocialInputError('A newer account change has replaced this sign-in.');}bind(next,generation);user=nextUser;conversationVault.select(next.instanceUrl,nextUser.id);remember();await next.connect();if(request!==authRequestEpoch||client!==next)throw new SocialInputError('A newer account change has replaced this sign-in.');return snapshot();};
  handle('rooms:social-login',async input=>{recoveryEpoch++;passwordReset.clear();const request=++authRequestEpoch;const body=auth.parse(input);const next=new StoatClient(body.serverUrl);try{return await replaceSession(next,await next.login(body.email,body.password),request);}catch(error){if(client!==next)await next.disconnect().catch(()=>{});throw error;}});
  handle('rooms:social-register',async input=>{recoveryEpoch++;passwordReset.clear();const request=++authRequestEpoch;const body=registration.parse(input);const next=new StoatClient(body.serverUrl);try{return await replaceSession(next,await next.register(body),request);}catch(error){if(client!==next)await next.disconnect().catch(()=>{});throw error;}});
  handle('rooms:social-password-recovery-capabilities',serverUrl=>new StoatClient(recoveryServer.parse(serverUrl)).passwordRecoveryCapabilities());
  handle('rooms:social-password-recovery-request',async input=>{
    const body=recoveryInput.parse(input);
    if(recoveryPending)throw new SocialInputError('Kurtarma isteği sürüyor. Tamamlanmasını bekle.');
    recoveryPending=true;
    try{
      // Isolated client: no current-session mutation, stored session, gateway, or renderer reset secret.
      const recovery=new StoatClient(body.serverUrl),capabilities=await recovery.passwordRecoveryCapabilities();
      if(!capabilities.emailEnabled)throw new SocialInputError('Sunucuda kurtarma e-postası yapılandırılmamış.');
      if(capabilities.captcha.required)throw new SocialInputError('Sunucu hCaptcha doğrulaması istiyor. Kurtarmayı Stoat web uygulamasından başlat.');
      return await recovery.requestPasswordRecovery({email:body.email});
    }finally{recoveryPending=false;}
  });
  const passwordReset = new PasswordRecoveryBroker({readClipboard:()=>clipboard.readText(),sessionEpoch:()=>recoveryEpoch+sessionEpoch});
  for (const operation of ['import','confirm','cancel'] as const) {
    ipcMain.handle(`rooms:social-password-recovery-${operation}`, async (event,input) => {
      assertSender(event);
      if(fixtureWindow())throw new Error('Native account access is disabled in development fixtures.');
      try {
        if(operation==='import')return await passwordReset.importLink(input,event.sender.id);
        if(operation==='cancel')return passwordReset.cancel(input,event.sender.id);
        return await passwordReset.confirm(input,event.sender.id);
      } catch { throw new Error(operation==='import'?'Seçili sunucunun kurtarma bağlantısını kopyalayıp yeniden dene.':'Parola kurtarma işlemi tamamlanamadı. Bağlantıyı yeniden seç.'); }
    });
  }
  app.on('before-quit',()=>{recoveryEpoch++;passwordReset.clear();});
  app.on('browser-window-created',(_event,window)=>window.on('closed',()=>{recoveryEpoch++;passwordReset.clear();}));
  handle('rooms:social-logout',async()=>{conversationVault.clear();recoveryEpoch++;passwordReset.clear();++authRequestEpoch;++sessionEpoch;const previous=client;unsubscribe?.();unsubscribe=null;client=null;user=null;uploadedAttachments.clear();activePresenceSpace=null;remembered=false;selected=null;selectedAudio=false;choices=[];if(existsSync(vault))unlinkSync(vault);await closeDmCall();await previous?.logout();});
  handle('rooms:social-spaces',()=>requireClient().listSpaces());
  handle('rooms:social-create-space',name=>requireClient().createSpace(channelName.parse(name)));
  handle('rooms:social-rename-space',(spaceId,name)=>requireClient().renameSpace(id.parse(spaceId),channelName.parse(name)));
  handle('rooms:social-channels',async spaceId=>{const parsed=id.parse(spaceId),current=requireClient(),owner=user!.id;const channels=await current.listChannels(parsed);if(client!==current||user?.id!==owner)throw new SocialInputError('The account changed. Reload its communities.');activePresenceSpace=parsed;current.subscribePresence(parsed);return channels;});
  const channelName=z.string().trim().min(1).max(32).refine(value=>!/[\x00-\x1f\x7f]/.test(value));
  handle('rooms:social-create-channel',(spaceId,name,type)=>requireClient().createChannel(id.parse(spaceId),channelName.parse(name),z.enum(['text','voice']).parse(type)));
  handle('rooms:social-rename-channel',(channelId,name)=>requireClient().renameChannel(id.parse(channelId),channelName.parse(name)));
  handle('rooms:social-delete-channel',channelId=>requireClient().deleteChannel(id.parse(channelId)));
  const aclValues=z.object({view:z.enum(['deny','inherit','allow']),send:z.enum(['deny','inherit','allow']),files:z.enum(['deny','inherit','allow']),manageMessages:z.enum(['deny','inherit','allow']),manageChannel:z.enum(['deny','inherit','allow'])}).strict();
  const aclChange=z.object({channelId:id,subject:z.discriminatedUnion('kind',[z.object({kind:z.literal('default'),id:z.literal('default')}).strict(),z.object({kind:z.literal('role'),id}).strict()]),values:aclValues}).strict();
  handle('rooms:social-channel-permissions',async channelId=>{const current=requireClient(),owner=user!.id,result=await current.channelPermissions(id.parse(channelId));if(client!==current||user?.id!==owner)throw new SocialInputError('The account changed. Open channel permissions again.');return result;});
  handle('rooms:social-set-channel-permissions',async input=>{const current=requireClient(),owner=user!.id,result=await current.setChannelPermissions(aclChange.parse(input));if(client!==current||user?.id!==owner)throw new SocialInputError('The account changed. Open channel permissions again.');return result;});
  handle('rooms:social-cached-messages',channelId=>{requireClient();return conversationVault.get(id.parse(channelId));});
  handle('rooms:social-messages',async(channelId,before)=>{const owner=requireClient(),epoch=sessionEpoch,parsed=id.parse(channelId);const original=conversationVault.get(parsed),cacheTicket=conversationVault.ticket(parsed);const messages=await owner.listMessages(parsed,before===undefined?undefined:id.parse(before));if(client===owner&&sessionEpoch===epoch&&before===undefined&&cacheTicket===conversationVault.ticket(parsed))conversationVault.reconcile(parsed,messages,original);return messages;});
  handle('rooms:social-send',async(channelId,text,attachments)=>{
    const channel=id.parse(channelId);const attachmentIds=attachments===undefined?[]:z.array(id).max(10).parse(attachments);const value=messageContent.parse(text);
    if(!value&&!attachmentIds.length)throw new SocialInputError('Write a message or select an attachment.');
    if(attachmentIds.some(fileId=>uploadedAttachments.get(fileId)?.channelId!==channel))throw new SocialInputError('Select your attachment again in this conversation.');
    const message=await requireClient().sendMessage(channel,value,attachmentIds);for(const fileId of attachmentIds)uploadedAttachments.delete(fileId);return message;
  });
  const memberRoleChange=z.object({spaceId:id,userId:id,roleIds:z.array(id).max(1000).refine(ids=>new Set(ids).size===ids.length)}).strict();
  const memberRemoval=z.object({spaceId:id,userId:id}).strict();
  handle('rooms:social-community-management',async spaceId=>{const current=requireClient(),owner=user!.id,result=await current.communityManagement(id.parse(spaceId));if(client!==current||user?.id!==owner)throw new SocialInputError('The account changed. Open community management again.');return result;});
  handle('rooms:social-set-member-roles',async input=>{const current=requireClient(),owner=user!.id,result=await current.setCommunityMemberRoles(memberRoleChange.parse(input));if(client!==current||user?.id!==owner)throw new SocialInputError('The account changed. Open community management again.');return result;});
  handle('rooms:social-remove-community-member',async input=>{const current=requireClient(),owner=user!.id,result=await current.removeCommunityMember(memberRemoval.parse(input));if(client!==current||user?.id!==owner)throw new SocialInputError('The account changed. Open community management again.');return result;});
  handle('rooms:social-members',spaceId=>requireClient().listCommunityMembers(id.parse(spaceId)));
  handle('rooms:social-friends',()=>requireClient().listFriends());
  handle('rooms:social-add-friend',username=>requireClient().addFriend(z.string().min(7).max(37).parse(username)));
  handle('rooms:social-remove-friend',userId=>requireClient().removeFriend(id.parse(userId)));
  const avatarRequests=new Map<string,Promise<string|null>>();
  handle('rooms:social-avatar',async userId=>{const selectedId=id.parse(userId),current=requireClient();const key=current.instanceUrl+':'+user!.id+':'+selectedId;let pending=avatarRequests.get(key);if(!pending){pending=current.avatar(selectedId);if(avatarRequests.size>=64)avatarRequests.delete(avatarRequests.keys().next().value!);avatarRequests.set(key,pending);setTimeout(()=>avatarRequests.delete(key),60000).unref();}return pending;});
  handle('rooms:social-choose-avatar',async()=>{
    const current=requireClient(),owner=user!.id,window=getWindow();if(!window)return null;
    const choice=await dialog.showOpenDialog(window,{title:'Choose profile photo',properties:['openFile'],filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']}]});
    if(choice.canceled||!choice.filePaths[0])return null;
    if(client!==current||user?.id!==owner)throw new SocialInputError('Sign in again before changing your photo.');
    const file=openSync(choice.filePaths[0],'r');let bytes:Buffer;
    try{const stat=fstatSync(file);if(!stat.isFile()||stat.size>2_000_000||stat.size<12)throw new SocialInputError('Choose a PNG, JPEG or WebP photo under 2 MB.');bytes=Buffer.alloc(stat.size);if(readSync(file,bytes,0,bytes.length,0)!==bytes.length)throw new SocialInputError('The photo could not be read.');}finally{closeSync(file);}
    const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
    if(!mime)throw new SocialInputError('Choose a PNG, JPEG or WebP photo.');
    const updated=await current.uploadAvatar(bytes,basename(choice.filePaths[0]),mime);if(client!==current||user?.id!==owner)return null;
    user=updated;avatarRequests.clear();emit({type:'PROFILE_UPDATE',data:user});return user;
  });
  handle('rooms:social-profile',async input=>{const body=z.object({displayName:z.string().min(2).max(32).regex(/^[^\u200B\n\r]+$/),bio:z.string().max(2000).optional(),statusText:z.string().max(128).optional()}).strict().parse(input);const current=requireClient(),owner=user!.id,updated=await current.updateProfile(body);if(client!==current||user?.id!==owner)throw new SocialInputError('The account changed. Reopen your profile before saving.');user=updated;emit({type:'PROFILE_UPDATE',data:user});return user;});
  handle('rooms:social-react',(channelId,messageId,emoji,remove)=>requireClient().react(id.parse(channelId),id.parse(messageId),z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).parse(emoji),remove===undefined?false:z.boolean().parse(remove)));
  handle('rooms:social-discard-attachment',fileId=>{uploadedAttachments.delete(id.parse(fileId));});
  handle('rooms:social-choose-attachment',async channelId=>{
    const channel=id.parse(channelId);const current=requireClient();await current.getChannel(channel);const window=getWindow();if(!window)return null;
    const chosen=await dialog.showOpenDialog(window,{title:'Attach a file to this conversation',properties:['openFile'],filters:[{name:'Images, media and documents',extensions:['png','jpg','jpeg','webp','gif','mp4','webm','mp3','wav','ogg','pdf','txt','md','json','zip']}]});
    if(chosen.canceled||!chosen.filePaths[0])return null;const path=chosen.filePaths[0];const fileStat=statSync(path);if(!fileStat.isFile()||!fileStat.size||fileStat.size>25*1024*1024)throw new SocialInputError('Select a nonempty attachment up to 25 MB.');
    const types:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.pdf':'application/pdf','.txt':'text/plain','.md':'text/markdown','.json':'application/json','.zip':'application/zip'};
    const mime=types[extname(path).toLowerCase()];if(!mime)throw new SocialInputError('This attachment file type is not supported.');
    if(uploadedAttachments.size>=20)throw new SocialInputError('Send or discard selected attachments before uploading more files.');
    const descriptor=openSync(path,'r');let bytes:Uint8Array;try{const initial=fstatSync(descriptor);if(!initial.isFile()||initial.size!==fileStat.size)throw new SocialInputError('The selected attachment changed. Select it again.');const buffer=Buffer.alloc(initial.size+1);let count=0;while(count<buffer.length){const read=readSync(descriptor,buffer,count,buffer.length-count,null);if(read===0)break;count+=read;}if(count!==initial.size)throw new SocialInputError('The selected attachment changed. Select it again.');bytes=new Uint8Array(buffer.subarray(0,count));}finally{closeSync(descriptor);}
    const result=await current.uploadAttachment(bytes,basename(path),mime);if(current!==client)throw new SocialInputError('The conversation session changed. Select the attachment again.');uploadedAttachments.set(result.id,{channelId:channel,name:result.name,size:result.size,mime:result.mime});return result;
  });
  handle('rooms:social-edit' ,(channelId,messageId,text)=>requireClient().editMessage(id.parse(channelId),id.parse(messageId),content.parse(text)));
  handle('rooms:social-delete',(channelId,messageId)=>requireClient().deleteMessage(id.parse(channelId),id.parse(messageId)));
  handle('rooms:social-create-invite',channelId=>requireClient().createInvite(id.parse(channelId)));
  handle('rooms:social-inspect-invite',(url,inviteCode)=>new StoatClient(z.string().max(2048).parse(url)).inspectInvite(code.parse(inviteCode)));
  handle('rooms:social-accept-invite',inviteCode=>requireClient().acceptInvite(code.parse(inviteCode)));
  handle('rooms:social-dms',()=>requireClient().listDMs());handle('rooms:social-create-dm',recipientId=>requireClient().createDM(id.parse(recipientId)));
  handle('rooms:social-block',userId=>requireClient().blockUser(id.parse(userId)));
  handle('rooms:social-unblock',userId=>requireClient().unblockUser(id.parse(userId)));
  handle('rooms:social-remove-member',(spaceId,userId)=>requireClient().removeMember(id.parse(spaceId),id.parse(userId)));
  handle('rooms:social-ack',(channelId,messageId)=>requireClient().ackRead(id.parse(channelId),id.parse(messageId)));
  handle('rooms:social-typing',(channel,active)=>requireClient().typing(id.parse(channel),z.boolean().parse(active)));
  handle('rooms:social-presence',status=>requireClient().updatePresence(z.enum(['online','idle','dnd','invisible']).parse(status)));
  async function broker(path:string,channelId:unknown){
    const current=requireClient();const response=await fetch(`${new URL(current.instanceUrl).origin}/rooms-access/v1/media/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:current.getToken()!},body:JSON.stringify(channelId),redirect:'error',signal:AbortSignal.timeout(15000)});
    const value=await response.json().catch(()=>null);
    if(current!==client)throw new SocialInputError('The conversation session changed. Join the voice room again.');
    if(!response.ok){
      const reasons:Record<string,string>={PRESENTER_BUSY:'Bu odada başka biri ekran paylaşıyor.',PRESENT_PERMISSION_REQUIRED:'Oda rolün ekran paylaşma izni vermiyor.',VOICE_CHANNEL_REQUIRED:'Önce bir ses odası seç.',ROOM_ACCESS_DENIED:'Ses odasına erişimin değişti. Üyeliğin doğrulandıktan sonra yeniden katıl.',SCREEN_LEASE_STALE:'Sunum sahibi değişti. Odayı yenileyip yeniden dene.',SCREEN_RESERVATION_STALE:'Devir süresi doldu. Yeniden sunum isteği gönder.',SCREEN_HANDOFF_PENDING:'Başka bir ekran devri devam ediyor.',SCREEN_REQUEST_EXISTS:'Bekleyen bir sunum talebin zaten var.',SCREEN_REQUEST_STALE:'Sunum talebi sona erdi veya artık kullanılamıyor.',SCREEN_PRESENTER_REQUIRED:'Bu talebi yalnızca mevcut sunum sahibi yanıtlayabilir.',SCREEN_REQUEST_OWNER_REQUIRED:'Yalnızca kendi sunum talebini iptal edebilirsin.',ALREADY_PRESENTER:'Zaten ekran paylaşıyorsun.',JOIN_VOICE_FIRST:'Sunum istemeden önce ses odasına katıl.',SCREEN_REQUEST_LIMIT:'Çok fazla sunum talebi var. Biraz sonra yeniden dene.'};
      if(typeof value?.error==='string'&&Object.hasOwn(reasons,value.error))throw new SocialInputError(reasons[value.error]);
      throw new StoatError(response.status,'MEDIA_GRANT_DENIED');
    }
    return value;
  }
  async function soundboardRequest(channelId:unknown,method:'GET'|'POST'|'DELETE',clipId?:unknown,input?:unknown){
    const current=requireClient(),token=current.getToken()!,channel=id.parse(channelId),clip=clipId===undefined?'':`/${z.string().uuid().parse(clipId)}`;
    const body=input===undefined?undefined:z.object({name:z.string().trim().min(1).max(40),audio:z.string().max(2_666_672).regex(/^[A-Za-z0-9+/]*={0,2}$/)}).strict().parse(input);
    const response=await fetch(`${new URL(current.instanceUrl).origin}/rooms-access/v1/soundboard/${encodeURIComponent(channel)}${clip}`,{method,headers:{Authorization:token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
    const valid=()=>current===client&&current.getToken()===token;
    if(!valid())throw new SocialInputError('Oturum değişti.');
    if(!response.ok){const error=(await response.json().catch(()=>null))?.error;const messages:Record<string,string>={SOUNDBOARD_NOT_CONFIGURED:'Sunucunun topluluk sesleri henüz yapılandırılmadı.',SOUNDBOARD_UPLOAD_DENIED:'Bu odada ses ekleme iznin yok.',SOUNDBOARD_DELETE_DENIED:'Yalnızca kendi sesini kaldırabilirsin.',SOUNDBOARD_FULL:'Toplulukta en fazla 32 ses saklanabilir.',SOUNDBOARD_NOT_FOUND:'Bu ses kaldırılmış.',SOUNDBOARD_INVALID_AUDIO:'En fazla 8 saniyelik mono veya stereo ses seç.'};throw new SocialInputError(messages[error]??'Topluluk sesleri alınamadı. Yeniden dene.');}
    if(method==='GET'&&clip){const reader=response.body?.getReader();if(!reader)throw new SocialInputError('Ses dosyası alınamadı.');const chunks:Buffer[]=[];let size=0;try{while(true){const value=await reader.read();if(value.done)break;size+=value.value.byteLength;if(size>2_000_000)throw new SocialInputError('Ses dosyası çok büyük.');chunks.push(Buffer.from(value.value));}}finally{await reader.cancel().catch(()=>{});}if(!valid())throw new SocialInputError('Oturum değişti.');return Buffer.concat(chunks).toString('base64');}
    const value=await response.json();if(!valid())throw new SocialInputError('Oturum değişti.');return method==='GET'?soundboardCatalogSchema.parse(value):method==='POST'?soundboardClipSchema.parse(value):z.object({deleted:z.literal(true)}).strict().parse(value);
  }
  handle('rooms:soundboard-list',channel=>soundboardRequest(channel,'GET'));
  handle('rooms:soundboard-upload',(channel,input)=>soundboardRequest(channel,'POST',undefined,input));
  handle('rooms:soundboard-read',(channel,clip)=>soundboardRequest(channel,'GET',clip));
  handle('rooms:soundboard-remove',async(channel,clip)=>{await soundboardRequest(channel,'DELETE',clip);});
  async function musicRequest(channelId:string,command?:unknown,search?:string){
    const current=requireClient(),room=id.parse(channelId),token=current.getToken()!;const body=search!==undefined?{query:musicSearchQuerySchema.parse(search)}:command===undefined?undefined:musicCommandSchema.parse(command);
    const response=await fetch(`${new URL(current.instanceUrl).origin}/rooms-access/v1/music/${encodeURIComponent(room)}${search!==undefined?'/search':''}`,{method:body?'POST':'GET',headers:{Authorization:token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(body?160000:15000)});
    const value=await response.json().catch(()=>null);if(current!==client||current.getToken()!==token)throw new SocialInputError('Oturum değişti.');
    if(!response.ok){const messages:Record<string,string>={MUSIC_SEARCH_BUSY:'Arama meşgul. Biraz sonra yeniden dene.',MUSIC_SEARCH_UNAVAILABLE:'Arama şu anda kullanılamıyor. Yeniden dene.',MUSIC_SEEK_INVALID:'Bu parçanın süresi doğrulanmadı veya seçilen konum geçersiz.',MUSIC_YOUTUBE_ACCESS_REQUIRED:'Sunucunun YouTube ses erişimi doğrulanamadı. DJ şu anda bu kaynaktan çalamıyor.',MUSIC_YOUTUBE_UNAVAILABLE:'YouTube parçası şu anda alınamıyor. Yeniden dene.',MUSIC_SOURCE_TIMEOUT:'Parça yüklenmesi zaman aşımına uğradı. Yeniden dene.',MUSIC_NOT_CONFIGURED:'Müzik botu sunucuda yapılandırılmadı.',MUSIC_SOURCE_FAILED:'Geçerli bir YouTube, Spotify, SoundCloud veya ses bağlantısı gir.',MUSIC_MIRROR_METADATA_UNAVAILABLE:'Şarkı bilgisi alınamadı. Herkese açık tek şarkı bağlantısını yeniden dene.',MUSIC_MIRROR_SINGLE_TRACK_ONLY:'Spotify ve SoundCloud için tek şarkı bağlantısı gir. Albüm ve listeler henüz desteklenmiyor.',MUSIC_MIRROR_NOT_FOUND:'YouTube’da güvenilir bir eşleşme bulunamadı. Şarkının YouTube bağlantısını gir.',MUSIC_JOIN_FIRST:'Önce ses odasına katıl.',MUSIC_PERMISSION_DENIED:'Bu odada müzik kontrol yetkin yok.',MUSIC_QUEUE_FULL:'Kuyruk dolu. En fazla 100 parça eklenebilir.',MUSIC_CACHE_LIMIT:'Müzik dosyaları toplam boyut sınırını aştı.',MUSIC_TRANSPORT_UNAVAILABLE:'Müzik botu ses odasına bağlanamadı.',MUSIC_CURRENT_ITEM:'Çalan parçayı kaldırmadan önce başka parçaya geç.'};throw new SocialInputError(messages[value?.error]??'Müzik botuna ulaşılamıyor. Yeniden dene.');}
    return search!==undefined?musicSearchResultsSchema.parse(value):musicSnapshotSchema.parse(value);
  }
  handle('rooms:music-snapshot',channelId=>musicRequest(id.parse(channelId)));
  handle('rooms:music-command',(channelId,command)=>musicRequest(id.parse(channelId),command));
  handle('rooms:music-search',(channelId,query)=>musicRequest(id.parse(channelId),undefined,musicSearchQuerySchema.parse(query)));
  const screenRequest=z.object({channelId:id,leaseId:z.string().uuid(),requestId:z.string().uuid()}).strict();
  const screenRequestEntry=z.object({requestId:z.string().uuid(),userId:id,leaseId:z.string().uuid(),createdAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive()}).strict();
  const screenPresenterState=z.object({
    presenter:z.object({userId:id,leaseId:z.string().uuid()}).strict().nullable(),
    requests:z.array(screenRequestEntry).max(20),
    reservation:z.object({requestId:z.string().uuid(),userId:id,leaseId:z.string().uuid(),expiresAt:z.number().int().positive(),released:z.boolean()}).strict().nullable(),
  }).strict();
  const callRequest=async(path:'poll'|'start'|'respond'|'grant',body:unknown)=>{
    const current=requireClient();const generation=path==='start'||path==='respond'?++dmNativeEpoch:dmNativeEpoch;let result;try{result=await requestDmCall(current,path,body);}catch(error){if(error instanceof z.ZodError)throw error;throw new SocialInputError(error instanceof Error?error.message:'Arama isteği tamamlanamadı.');}
    const call=path==='poll'?(result as {call:DmCallSession|null}).call:path==='grant'?null:result as DmCallSession;
    if(current!==client||((path==='start'||path==='grant')&&generation!==dmNativeEpoch)){if(call&&call.state!=='ended')await requestDmCall(current,'respond',{callId:call.id,action:'end'}).catch(()=>{});throw new SocialInputError('Oturum değişti. Aramayı yeniden başlat.');}
    if(path!=='grant'&&generation===dmNativeEpoch){if(call&&call.state!=='ended')pendingDmCall={client:current,id:call.id};else if(!call||pendingDmCall?.id===call.id)pendingDmCall=null;}
    return result;
  };
  handle('rooms:dm-call-poll',()=>callRequest('poll',{}));
  handle('rooms:dm-call-start',input=>callRequest('start',dmCallStartSchema.parse(input)));
  handle('rooms:dm-call-respond',input=>callRequest('respond',dmCallActionSchema.parse(input)));
  handle('rooms:dm-call-grant',input=>callRequest('grant',dmCallIdSchema.parse(input)));
  handle('rooms:media-directory',async channelIds=>{const ids=z.array(id).min(1).max(32).parse(channelIds);const result=await broker('directory',{channelIds:ids});return z.object({rooms:z.array(z.object({channelId:id,participants:z.array(z.object({id:id,name:z.string().max(128),muted:z.boolean(),screen:z.boolean().optional()}).strict()).max(100)}).strict()).max(32)}).strict().parse(result);});
  handle('rooms:media-grant',channelId=>broker('grant',{channelId:id.parse(channelId)}));
  handle('rooms:media-presenter',(channelId,action)=>broker(`screens/${z.enum(['acquire','release']).parse(action)}`,{channelId:id.parse(channelId)}));
  handle('rooms:media-screen-state',async channelId=>screenPresenterState.parse(await broker('screen/state',{channelId:id.parse(channelId)})));
  handle('rooms:media-screen-request',async input=>{const body=screenRequest.parse(input);return z.object({request:screenRequestEntry}).strict().parse(await broker('screen/request',body));});
  handle('rooms:media-screen-request-cancel',async input=>{const body=screenRequest.parse(input);return z.object({cancelled:z.literal(true)}).strict().parse(await broker('screen/request/cancel',body));});
  handle('rooms:media-screen-request-decide',async input=>{const body=screenRequest.extend({approve:z.boolean()}).strict().parse(input);return z.object({approved:z.boolean(),awaitingRelease:z.boolean()}).strict().parse(await broker('screen/request/decide',body));});
  handle('rooms:media-leave',channelId=>broker('leave',{channelId:id.parse(channelId)}));
  handle('rooms:capture-status',()=>({microphone:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('microphone'):'unknown',camera:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('camera'):'unknown',screen:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('screen'):'unknown',systemAudio:supportsSystemAudio()}));
  handle('rooms:capture-sources',async()=>{
    choices=[];choicesAt=0;
    choices=await enumerateCaptureSources(options=>desktopCapturer.getSources(options),()=>process.platform==='darwin'?systemPreferences.getMediaAccessStatus('screen'):'unknown');choicesAt=Date.now();
    return choices.map(source=>({id:source.id,name:source.name,thumbnail:source.thumbnail.isEmpty()?'':source.thumbnail.toDataURL()}));
  });
  handle('rooms:capture-select',(sourceId,options)=>{const preference=z.object({audio:z.boolean()}).strict().parse(options??{audio:false});if(preference.audio&&!supportsSystemAudio())throw new SocialInputError('System audio capture is unavailable on this OS.');if(typeof sourceId!=='string'||Date.now()-choicesAt>60000)throw new Error('Refresh available sources.');const source=choices.find(s=>s.id===sourceId);if(!source)throw new Error('The selected source is unavailable.');selected=source;selectedAudio=preference.audio;selectedAt=Date.now();choices=[];});
  handle('rooms:capture-clear',()=>{selected=null;selectedAudio=false;choices=[];});
  session.defaultSession.setDisplayMediaRequestHandler((request,callback)=>{
    // Fallback picker is explicit and one-shot; never default to the first screen.
    const allowed=request.frame===getWindow()?.webContents.mainFrame&&isTrusted(request.frame.url)&&selected&&Date.now()-selectedAt<15000;
    const source=selected,audio=selectedAudio;selected=null;selectedAudio=false;choices=[];if(!allowed||!source){callback(null);return;}callback({video:source,...(audio&&supportsSystemAudio()?{audio:'loopback' as const}:{})});
  },{useSystemPicker:false});
  try{
    if(existsSync(vault)&&safeStorage.isEncryptionAvailable()){
      const stored=z.object({provider:z.literal('stoat'),version:z.literal(1),url:z.string(),token:z.string().min(1)}).parse(JSON.parse(safeStorage.decryptString(readFileSync(vault))));
      const restored=new StoatClient(stored.url,stored.token);user=await restored.getCurrentUser();conversationVault.select(restored.instanceUrl,user.id);bind(restored,sessionEpoch);remembered=true;void restored.connect().catch(()=>{});
    }
  }catch{user=null;remembered=false;/* A stale/offline vault never means connected. */}
  app.on('before-quit',()=>{clearInterval(presenceTimer);conversationVault.flush();void client?.disconnect();selected=null;selectedAudio=false;choices=[];});
  async function activityRequest(roomId:string,command?:unknown,afterRevision?:number):Promise<unknown>{
    const current=requireClient();const room=id.parse(roomId);
    if(command!==undefined&&Buffer.byteLength(JSON.stringify(command),'utf8')>65536)throw new Error('The activity command is too large.');
    if(command!==undefined){const token=current.getToken()!;return postActivityCommand(`${new URL(current.instanceUrl).origin}/rooms-activities/v1/rooms/${encodeURIComponent(room)}/activity`,room,token,command,fetch,()=>{if(client!==current||current.getToken()!==token)throw new StoatError(401,'SESSION_CHANGED');});}
    const revision=afterRevision===undefined?undefined:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(afterRevision);
    const query=command===undefined&&revision!==undefined?`?afterRevision=${revision}&waitMs=20000`:'';
    const token=current.getToken()!;
    return getActivitySnapshot(`${new URL(current.instanceUrl).origin}/rooms-activities/v1/rooms/${encodeURIComponent(room)}/activity${query}`,room,token,fetch,()=>{if(client!==current||current.getToken()!==token)throw new StoatError(401,'SESSION_CHANGED');});
  }
  return {snapshot,activityRequest,close:async()=>{recoveryEpoch++;passwordReset.clear();await closeDmCall();clearInterval(presenceTimer);await client?.disconnect();selected=null;choices=[];}};
}
