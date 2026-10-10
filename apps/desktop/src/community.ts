import { uiError } from './i18n';
import { create } from 'zustand';
import type { ConnectionStatus, SocialSession } from '@rooms/contracts';
import type { SocialChannel, SocialInvite, SocialMessage, SocialSpace, SocialUser, SocialAttachment, SocialReadState, GatewayEvent } from '@rooms/social';

export interface CommunityMessage extends SocialMessage {delivery?:'pending'|'failed'|'sent'}
export interface CommunityState {
  status:ConnectionStatus;user:SocialUser|null;serverUrl:string;remembered:boolean;
  spaces:SocialSpace[];channels:SocialChannel[];dms:SocialChannel[];activeSpaceId:string|null;activeChannelId:string|null;
  messages:CommunityMessage[];unread:Record<string,boolean>;readStates:Record<string,SocialReadState>;presence:Record<string,string>;error:string|null;busy:boolean;loadingMessages:boolean;hasOlder:boolean;
  connect(input:{serverUrl:string;email:string;password:string}):Promise<void>;
  register(input:{serverUrl:string;email:string;password:string;username:string;inviteCode:string;accountInviteCode?:string}):Promise<void>;
  logout():Promise<void>;refresh():Promise<void>;
  openSpace(id:string):Promise<void>;openChannel(id:string):Promise<void>;send(content:string,attachments?:SocialAttachment[]):Promise<void>;
  retryMessage(id:string):Promise<void>;editMessage(id:string,content:string):Promise<void>;deleteMessage(id:string):Promise<void>;loadOlder():Promise<void>;
  createInvite(channelId:string):Promise<SocialInvite>;acceptInvite(code:string):Promise<void>;createDM(recipientId:string):Promise<void>;
  markRead(channelId:string,messageId:string):Promise<void>;
  setPresence(status:'online'|'idle'|'dnd'|'invisible'):Promise<void>;clearError():void;
}
const blank={status:'not-configured' as ConnectionStatus,user:null,serverUrl:'',remembered:false,spaces:[],channels:[],dms:[],activeSpaceId:null,activeChannelId:null,messages:[],unread:{},readStates:{},presence:{},error:null,busy:false,loadingMessages:false,hasOlder:true};
const bridge=()=>{if(!window.rooms?.social)throw new Error('Özel sunucuna bağlanmak için masaüstü uygulamasını aç.');return window.rooms.social;};
const safeError=uiError;
let selectionEpoch=0;let initialized=false;
async function applySession(session:SocialSession){if(!session.user)return;useCommunity.setState({status:session.status,user:session.user,serverUrl:session.instanceUrl??'',remembered:session.remembered,error:null});await useCommunity.getState().refresh();}
export const useCommunity=create<CommunityState>((set,get)=>({...blank,
  connect:async input=>{set({busy:true,error:null});try{await applySession(await bridge().login(input));}catch(error){set({error:safeError(error)});throw error;}finally{set({busy:false});}},
  register:async input=>{set({busy:true,error:null});try{await applySession(await bridge().register(input));}catch(error){set({error:safeError(error)});throw error;}finally{set({busy:false});}},
  logout:async()=>{const {leaveVoice}=await import('./realtime');await leaveVoice();await bridge().logout();selectionEpoch++;set({...blank});},
  refresh:async()=>{if(!get().user)return;try{const [spaces,dms,records]=await Promise.all([bridge().spaces(),bridge().dms(),bridge().readStates().catch(()=>[])]);set({spaces,dms,readStates:Object.fromEntries(records.map(r=>[r.channelId,r]))});const active=get().activeSpaceId;if(!active||!spaces.some(s=>s.id===active)){if(spaces[0])await get().openSpace(spaces[0].id);else set({channels:[],messages:[],activeSpaceId:null,activeChannelId:null});}}catch(error){set({error:safeError(error)});}},
  openSpace:async spaceId=>{const epoch=++selectionEpoch;set({activeSpaceId:spaceId,activeChannelId:null,messages:[],channels:[],loadingMessages:true,error:null});try{const channels=await bridge().channels(spaceId);if(epoch!==selectionEpoch)return;set(state=>({channels,unread:{...state.unread,...Object.fromEntries(channels.filter(ch=>state.readStates[ch.id]&&ch.lastMessageId!==undefined).map(ch=>[ch.id,!!ch.lastMessageId&&state.readStates[ch.id].lastReadMessageId!==ch.lastMessageId]))}}));const text=channels.find(c=>c.type===0);if(text)await get().openChannel(text.id);}catch(error){if(epoch===selectionEpoch)set({error:safeError(error)});}finally{if(epoch===selectionEpoch)set({loadingMessages:false});}},
  openChannel:async channelId=>{const epoch=++selectionEpoch;set(state=>({activeChannelId:channelId,messages:[],loadingMessages:true,error:null,hasOlder:true,unread:state.unread}));try{const messages=await bridge().messages(channelId);if(epoch!==selectionEpoch)return;set({messages,hasOlder:messages.length===50});if(messages.at(-1)&&location.hash.startsWith('#/chat')&&document.hasFocus())void get().markRead(channelId,messages.at(-1)!.id);}catch(error){if(epoch===selectionEpoch)set({error:safeError(error)});}finally{if(epoch===selectionEpoch)set({loadingMessages:false});}},
  send:async(text,attachments=[])=>{const channelId=get().activeChannelId;const user=get().user;if(!channelId||!user||(!text.trim()&&!attachments.length))return;const optimistic:CommunityMessage={id:`pending-${crypto.randomUUID()}`,channelId,author:user,content:text.trim().slice(0,4000),timestamp:new Date().toISOString(),editedTimestamp:null,delivery:'pending',attachments};set(state=>({messages:[...state.messages,optimistic]}));try{const sent=await bridge().send(channelId,optimistic.content,attachments.map(a=>a.id));if(get().activeChannelId===channelId)set(state=>({messages:state.messages.filter(m=>m.id!==optimistic.id&&m.id!==sent.id).concat({...sent,delivery:'sent'}).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))}));}catch(error){if(get().activeChannelId===channelId)set(state=>({messages:state.messages.map(m=>m.id===optimistic.id?{...m,delivery:'failed'}:m),error:safeError(error)}));throw error;}},
  retryMessage:async id=>{const message=get().messages.find(m=>m.id===id&&m.delivery==='failed');if(!message)return;set(state=>({messages:state.messages.filter(m=>m.id!==id)}));await get().send(message.content,message.attachments);},
  editMessage:async(id,text)=>{const channelId=get().activeChannelId;if(!channelId)return;try{const updated=await bridge().edit(channelId,id,text);set(state=>({messages:state.messages.map(m=>m.id===id?updated:m)}));}catch(error){set({error:safeError(error)});throw error;}},
  deleteMessage:async id=>{const channelId=get().activeChannelId;if(!channelId)return;try{await bridge().delete(channelId,id);set(state=>({messages:state.messages.filter(m=>m.id!==id)}));}catch(error){set({error:safeError(error)});throw error;}},
  loadOlder:async()=>{const current=get();if(!current.activeChannelId||!current.hasOlder||current.loadingMessages)return;const oldest=current.messages.find(m=>!m.id.startsWith('pending-'));if(!oldest)return;set({loadingMessages:true});try{const older=await bridge().messages(current.activeChannelId,oldest.id);if(get().activeChannelId===current.activeChannelId)set(state=>({messages:[...older,...state.messages].filter((m,i,a)=>a.findIndex(x=>x.id===m.id)===i).slice(-1000),hasOlder:older.length===50}));}catch(error){set({error:safeError(error)});}finally{set({loadingMessages:false});}},
  createInvite:channelId=>bridge().createInvite(channelId),
  acceptInvite:async code=>{try{await bridge().acceptInvite(code);await get().refresh();}catch(error){set({error:safeError(error)});throw error;}},
  createDM:async userId=>{try{const channel=await bridge().createDM(userId);set(state=>({dms:[...state.dms.filter(c=>c.id!==channel.id),channel]}));await get().openChannel(channel.id);}catch(error){set({error:safeError(error)});throw error;}},
  markRead:async(channelId,messageId)=>{try{await bridge().ackRead(channelId,messageId);/* Native READ_STATE_SYNC is authoritative, including messages arriving while awaiting ACK. */}catch{/* A failed acknowledgement never clears the unread indicator. */}},
  setPresence:status=>bridge().presence(status),clearError:()=>set({error:null}),
}));
function onEvent(event:GatewayEvent){
  const state=useCommunity.getState();
  if(event.type==='READ_STATE_SYNC'){const records=event.data as SocialReadState[];const readStates=Object.fromEntries(records.map(r=>[r.channelId,r]));useCommunity.setState(s=>({readStates,unread:Object.fromEntries([...s.channels,...s.dms].filter(ch=>readStates[ch.id]&&ch.lastMessageId!==undefined).map(ch=>[ch.id,!!ch.lastMessageId&&readStates[ch.id].lastReadMessageId!==ch.lastMessageId]))}));}
  else if(event.type==='MESSAGE_ACK'){const d=event.data as {channelId:string;messageId:string;userId:string};if(d.userId===state.user?.id)useCommunity.setState(s=>({readStates:{...s.readStates,[d.channelId]:{channelId:d.channelId,lastReadMessageId:d.messageId,mentionMessageIds:s.readStates[d.channelId]?.mentionMessageIds??[]}},unread:{...s.unread,[d.channelId]:[...s.channels,...s.dms].find(ch=>ch.id===d.channelId)?.lastMessageId ? [...s.channels,...s.dms].find(ch=>ch.id===d.channelId)!.lastMessageId!==d.messageId : (s.unread[d.channelId]??false)}}));}
  else if(event.type==='PROFILE_UPDATE'){useCommunity.setState({user:event.data as SocialUser});}
  else if(event.type==='CONNECTION_STATUS')useCommunity.setState({status:event.data as ConnectionStatus});
  else if(event.type==='AUTH_EXPIRED')useCommunity.setState({status:'error',error:'Oturumunun süresi doldu. Çıkış yapıp yeniden giriş yap.'});
  else if(event.type==='MESSAGE_CREATE'||event.type==='MESSAGE_UPDATE'){
    const message=event.data as SocialMessage;
    if(event.type==='MESSAGE_CREATE')useCommunity.setState(s=>({channels:s.channels.map(ch=>ch.id===message.channelId?{...ch,lastMessageId:message.id}:ch),dms:s.dms.map(ch=>ch.id===message.channelId?{...ch,lastMessageId:message.id}:ch),unread:{...s.unread,[message.channelId]:message.author.id!==s.user?.id}}));
    if(message.channelId===state.activeChannelId){useCommunity.setState(s=>({messages:[...s.messages.filter(m=>m.id!==message.id),message].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)).slice(-1000)}));}
    if(event.type==='MESSAGE_CREATE'&&message.channelId===state.activeChannelId&&location.hash.startsWith('#/chat')&&document.hasFocus())void state.markRead(message.channelId,message.id);
  }else if(event.type==='MESSAGE_DELETE'){const d=event.data as {id:string;channel_id:string};if(d.channel_id===state.activeChannelId)useCommunity.setState(s=>({messages:s.messages.filter(m=>m.id!==d.id)}));}
  else if(event.type==='PRESENCE_UPDATE'){const d=event.data as {userId?:string;status?:string};if(d.userId&&d.status)useCommunity.setState(s=>({presence:{...s.presence,[d.userId!]:d.status!}}));}
  else if(event.type==='SOCIAL_REFRESH'||event.type==='RESUMED'){void state.refresh();if(state.activeChannelId)void state.openChannel(state.activeChannelId);}
}
export async function initializeCommunity(){if(initialized||!window.rooms)return;initialized=true;bridge().onEvent(onEvent);try{await applySession(await bridge().session());}catch{useCommunity.setState({error:'Kayıtlı sunucuya ulaşılamıyor. Ayarlar bölümünden yeniden bağlan.'});}}
