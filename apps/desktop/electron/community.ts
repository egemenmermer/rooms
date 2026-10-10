import { app, dialog, desktopCapturer, ipcMain, safeStorage, session, systemPreferences, type BrowserWindow, type IpcMainInvokeEvent, type DesktopCapturerSource } from 'electron';
import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync, openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { z } from 'zod';
import { StoatClient, StoatError } from '@rooms/stoat';
import { SOCIAL_ID_PATTERN, type SocialUser, type GatewayEvent } from '@rooms/social';
import type { SocialSession } from '@rooms/contracts';
import { postActivityCommand, getActivitySnapshot } from './activity-http';

class SocialInputError extends Error {}

export async function setupCommunity(getWindow:()=>BrowserWindow|null,assertSender:(event:IpcMainInvokeEvent)=>void,isTrusted:(url:string)=>boolean,onIncomingMessage:()=>void=()=>{}){
  let client:StoatClient|null=null;let user:SocialUser|null=null;let remembered=false;let unsubscribe:(()=>void)|null=null;
  const uploadedAttachments=new Map<string,{channelId:string;name:string;size:number;mime:string}>();
  let activePresenceSpace:string|null=null;
  const subscribePresence=()=>{if(activePresenceSpace&&getWindow()?.isFocused())client?.subscribePresence(activePresenceSpace);};
  const presenceTimer=setInterval(subscribePresence,5*60000);presenceTimer.unref();
  app.on('browser-window-created',(_event,window)=>window.on('focus',()=>{if(window===getWindow())subscribePresence();}));
  let selected:DesktopCapturerSource|null=null;let selectedAt=0;let choices:DesktopCapturerSource[]=[];let choicesAt=0;
  const vault=join(app.getPath('userData'),'stoat-session-v1.bin');
  const auth=z.object({serverUrl:z.string().max(2048),email:z.string().email().max(254),password:z.string().min(1).max(256)}).strict();
  const registration=auth.extend({username:z.string().min(2).max(32),inviteCode:z.string().regex(/^[a-zA-Z0-9_-]{2,128}$/),accountInviteCode:z.string().regex(/^[a-zA-Z0-9_-]{2,128}$/).optional()});
  const id=z.string().regex(SOCIAL_ID_PATTERN);const code=z.string().regex(/^[a-zA-Z0-9_-]{2,128}$/);const content=z.string().trim().min(1).max(4000);const messageContent=z.string().trim().max(4000);
  const emit=(event:GatewayEvent)=>{const win=getWindow();if(win&&!win.webContents.isDestroyed())win.webContents.send('rooms:social-event',event);};
  const snapshot=():SocialSession=>({instanceUrl:client?.instanceUrl??null,user,status:client?.status??'not-configured',remembered});
  function bind(next:StoatClient){unsubscribe?.();client=next;unsubscribe=client.subscribe(event=>{
    if(event.type==='READY')subscribePresence();
    if(event.type==='MESSAGE_CREATE'){const authorId=(event.data as {author?:{id?:unknown}}).author?.id;if(user&&typeof authorId==='string'&&authorId!==user.id)onIncomingMessage();}
    if(['READY','RESUMED','CONNECTION_STATUS','AUTH_EXPIRED','MESSAGE_CREATE','MESSAGE_UPDATE','PRESENCE_UPDATE','SOCIAL_REFRESH','MESSAGE_ACK','READ_STATE_SYNC','READ_STATE_UNAVAILABLE'].includes(event.type))emit(event);
    else if(event.type==='MESSAGE_DELETE'){const raw=event.data as Record<string,unknown>;emit({type:event.type,data:{id:String(raw.id),channel_id:String(raw.channel_id)}});}
    else if(event.type==='PRESENCE_UPDATE'){const raw=event.data as {user?:{id?:string};status?:string;guild_id?:string};emit({type:event.type,data:{userId:raw.user?.id,status:raw.status,guildId:raw.guild_id}});}
    else if(['GUILD_CREATE','GUILD_DELETE','CHANNEL_CREATE','CHANNEL_UPDATE','CHANNEL_DELETE','RELATIONSHIP_ADD','RELATIONSHIP_REMOVE','GUILD_MEMBER_REMOVE'].includes(event.type))emit({type:'SOCIAL_REFRESH',data:null});
  });}
  const remember=()=>{remembered=false;if(!client?.getToken()||!safeStorage.isEncryptionAvailable())return;writeFileSync(vault,safeStorage.encryptString(JSON.stringify({provider:'stoat',version:1,url:client.instanceUrl,token:client.getToken()})),{mode:0o600});remembered=true;};
  const requireClient=()=>{if(!client||!user)throw new StoatError(401,'SIGN_IN_REQUIRED');return client;};
  const handle=(name:string,handler:(...args:unknown[])=>unknown)=>ipcMain.handle(name,async(event,...args)=>{
    assertSender(event);try{return await handler(...args);}catch(error){if(error instanceof StoatError||error instanceof SocialInputError)throw new Error(error.message);if(error instanceof z.ZodError)throw new Error('Check the supplied fields and retry.');throw new Error('This operation could not complete. Check your server, permissions, and connection.');}
  });
  handle('rooms:social-session',()=>snapshot());
  handle('rooms:social-read-states',()=>requireClient().readStates());
  handle('rooms:social-login',async input=>{const body=auth.parse(input);const next=new StoatClient(body.serverUrl);const nextUser=await next.login(body.email,body.password);await client?.disconnect();uploadedAttachments.clear();bind(next);user=nextUser;remember();await next.connect();return snapshot();});
  handle('rooms:social-register',async input=>{const body=registration.parse(input);const next=new StoatClient(body.serverUrl);const nextUser=await next.register(body);await client?.disconnect();uploadedAttachments.clear();bind(next);user=nextUser;remember();await next.connect();return snapshot();});
  handle('rooms:social-logout',async()=>{await client?.logout();client=null;user=null;uploadedAttachments.clear();activePresenceSpace=null;remembered=false;unsubscribe?.();unsubscribe=null;selected=null;choices=[];if(existsSync(vault))unlinkSync(vault);emit({type:'LOGGED_OUT',data:null});});
  handle('rooms:social-spaces',()=>requireClient().listSpaces());
  handle('rooms:social-channels',async spaceId=>{const parsed=id.parse(spaceId);const channels=await requireClient().listChannels(parsed);activePresenceSpace=parsed;subscribePresence();return channels;});
  handle('rooms:social-messages',(channelId,before)=>requireClient().listMessages(id.parse(channelId),before===undefined?undefined:id.parse(before)));
  handle('rooms:social-send',async(channelId,text,attachments)=>{
    const channel=id.parse(channelId);const attachmentIds=attachments===undefined?[]:z.array(id).max(10).parse(attachments);const value=messageContent.parse(text);
    if(!value&&!attachmentIds.length)throw new SocialInputError('Write a message or select an attachment.');
    if(attachmentIds.some(fileId=>uploadedAttachments.get(fileId)?.channelId!==channel))throw new SocialInputError('Select your attachment again in this conversation.');
    const message=await requireClient().sendMessage(channel,value,attachmentIds);for(const fileId of attachmentIds)uploadedAttachments.delete(fileId);return message;
  });
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
  handle('rooms:social-profile',async input=>{const body=z.object({displayName:z.string().min(2).max(32).regex(/^[^\u200B\n\r]+$/),bio:z.string().max(2000).optional(),statusText:z.string().max(128).optional()}).strict().parse(input);user=await requireClient().updateProfile(body);emit({type:'PROFILE_UPDATE',data:user});return user;});
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
  handle('rooms:social-presence',status=>requireClient().updatePresence(z.enum(['online','idle','dnd','invisible']).parse(status)));
  async function broker(path:string,channelId:unknown){
    const current=requireClient();const response=await fetch(`${new URL(current.instanceUrl).origin}/rooms-access/v1/media/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:current.getToken()!},body:JSON.stringify({channelId:id.parse(channelId)}),redirect:'error',signal:AbortSignal.timeout(15000)});
    const value=await response.json().catch(()=>null);
    if(current!==client)throw new SocialInputError('The conversation session changed. Join the voice room again.');
    if(!response.ok){
      const reasons:Record<string,string>={PRESENTER_BUSY:'Someone is already sharing in this room. Ask them to stop before you share.',PRESENT_PERMISSION_REQUIRED:'Your room role does not allow screen sharing.',VOICE_CHANNEL_REQUIRED:'Choose a voice room before joining.',ROOM_ACCESS_DENIED:'Your access to this voice room changed. Rejoin after your membership is restored.'};
      if(typeof value?.error==='string'&&Object.hasOwn(reasons,value.error))throw new SocialInputError(reasons[value.error]);
      throw new StoatError(response.status,'MEDIA_GRANT_DENIED');
    }
    return value;
  }
  handle('rooms:media-grant',channelId=>broker('grant',channelId));
  handle('rooms:media-presenter',(channelId,action)=>broker(`screen/${z.enum(['acquire','release']).parse(action)}`,channelId));
  handle('rooms:media-leave',channelId=>broker('leave',channelId));
  handle('rooms:capture-status',()=>({microphone:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('microphone'):'unknown',camera:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('camera'):'unknown',screen:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('screen'):'unknown',systemAudio:false}));
  handle('rooms:capture-sources',async()=>{
    choices=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:320,height:180},fetchWindowIcons:false});choicesAt=Date.now();
    return choices.map(source=>({id:source.id,name:source.name,thumbnail:source.thumbnail.toDataURL()}));
  });
  handle('rooms:capture-select',sourceId=>{if(typeof sourceId!=='string'||Date.now()-choicesAt>60000)throw new Error('Refresh available sources.');const source=choices.find(s=>s.id===sourceId);if(!source)throw new Error('The selected source is unavailable.');selected=source;selectedAt=Date.now();choices=[];});
  handle('rooms:capture-clear',()=>{selected=null;choices=[];});
  session.defaultSession.setDisplayMediaRequestHandler((request,callback)=>{
    // Fallback picker is explicit and one-shot; never default to the first screen.
    const allowed=request.frame===getWindow()?.webContents.mainFrame&&isTrusted(request.frame.url)&&selected&&Date.now()-selectedAt<15000;
    const source=selected;selected=null;choices=[];if(!allowed||!source){callback(null);return;}callback({video:source});
  },{useSystemPicker:false});
  try{
    if(existsSync(vault)&&safeStorage.isEncryptionAvailable()){
      const stored=z.object({provider:z.literal('stoat'),version:z.literal(1),url:z.string(),token:z.string().min(1)}).parse(JSON.parse(safeStorage.decryptString(readFileSync(vault))));
      const restored=new StoatClient(stored.url,stored.token);user=await restored.getCurrentUser();bind(restored);remembered=true;void restored.connect().catch(()=>{});
    }
  }catch{user=null;remembered=false;/* A stale/offline vault never means connected. */}
  app.on('before-quit',()=>{clearInterval(presenceTimer);void client?.disconnect();selected=null;choices=[];});
  async function activityRequest(roomId:string,command?:unknown,afterRevision?:number):Promise<unknown>{
    const current=requireClient();const room=id.parse(roomId);
    if(command!==undefined&&Buffer.byteLength(JSON.stringify(command),'utf8')>65536)throw new Error('The activity command is too large.');
    if(command!==undefined){const token=current.getToken()!;return postActivityCommand(`${new URL(current.instanceUrl).origin}/rooms-activities/v1/rooms/${encodeURIComponent(room)}/activity`,room,token,command,fetch,()=>{if(client!==current||current.getToken()!==token)throw new StoatError(401,'SESSION_CHANGED');});}
    const revision=afterRevision===undefined?undefined:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(afterRevision);
    const query=command===undefined&&revision!==undefined?`?afterRevision=${revision}&waitMs=20000`:'';
    const token=current.getToken()!;
    return getActivitySnapshot(`${new URL(current.instanceUrl).origin}/rooms-activities/v1/rooms/${encodeURIComponent(room)}/activity${query}`,room,token,fetch,()=>{if(client!==current||current.getToken()!==token)throw new StoatError(401,'SESSION_CHANGED');});
  }
  return {snapshot,activityRequest,close:async()=>{clearInterval(presenceTimer);await client?.disconnect();selected=null;choices=[];}};
}
