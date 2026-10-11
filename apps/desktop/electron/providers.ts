import {app,dialog,ipcMain,protocol,safeStorage,shell} from 'electron';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {privateFetch,limitedText,personalURL,type PrivateRequestOptions} from '../../../packages/personal-media/src/network';
import {parseEPG} from '../../../packages/personal-media/src/epg';
import {parsePlaylist,rewriteHLS,safeMediaLabel,type PlaylistEntry} from '../../../packages/personal-media/src/playlist';
import {PlaylistFileImports,parsePersonalPlaylistFile} from './playlist-file';
import type {ProviderConnection,PersonalGuide,PersonalProgram} from './provider-contracts';

interface Credentials {client_id:string;client_secret:string;access_token:string;refresh_token:string;expiresAt:number}
interface Stored {id:string;type:'playlist'|'xtream'|'real-debrid';name:string;url?:string;playlistText?:string;xmltvUrl?:string;username?:string;password?:string;favorites:string[];resume?:Record<string,number>;credentials?:Credentials}
interface PlaybackHandle {url:string;connectionId:string;expires:number;scope:string;resumeKey?:string}
interface DeviceAttempt {deviceCode:string;expires:number;nextPoll:number;interval:number;generation:number;scope:string;clientId:string}
const uuid=z.string().uuid();
const urlSchema=z.string().min(8).max(8192);
const label=z.string().min(1).max(100);
const secret=z.string().min(1).max(256);
const channelID=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const GUIDE_TTL=60_000;
interface GuideDocument {xmlById:Map<string,string>;programs:Map<string,PersonalProgram[]>}
interface GuideCache {connection:Stored;scope:string;url:string;expires:number;document?:GuideDocument;pending?:Promise<GuideDocument|null>}
function libraryDate(value:unknown):string|undefined{if(typeof value!=='string'||value.length>32||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))return;const time=Date.parse(value);if(!Number.isFinite(time)||time<0||time>Date.now()+86400_000)return;const normalized=new Date(time).toISOString();if(normalized!==(value.includes('.')?value:value.replace('Z','.000Z')))return;return normalized;}
function storedResume(value:unknown):number|undefined{return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=604800?value:undefined;}

/** Native secrets are partitioned by stable server/account identity; session epochs fence work. */
export function setupProviders(assertSender:(event:Electron.IpcMainInvokeEvent)=>void,scopeIdentity:()=>string=()=>'',stableIdentity:()=>string|null=()=>null){
 const connections=new Map<string,Stored>();
 const channels=new Map<string,PlaylistEntry[]>();
 const handles=new Map<string,PlaybackHandle>();
 const guides=new Map<string,GuideCache>();
 const rdItems=new Map<string,{name:string;download:string}>();
 const fileImports=new PlaylistFileImports(undefined,undefined,()=>JSON.stringify([scopeIdentity(),stableIdentity()]));
 let pending:DeviceAttempt|null=null;
 let rdGeneration=0;
 let activeScope:string|undefined;
 let activeIdentity:string|null|undefined;
 let vaultPath:string|null=null;
 const clearPlayback=()=>{handles.clear();rdGeneration++;pending=null;rdItems.clear();guides.clear();fileImports.clear();};
 function refreshScope(){
  const identity=stableIdentity(),scope=JSON.stringify([scopeIdentity(),identity]);
  if(activeScope===scope&&activeIdentity===identity)return;
  clearPlayback();connections.clear();channels.clear();activeScope=scope;activeIdentity=identity;
  vaultPath=identity===null?null:join(app.getPath('userData'),`personal-providers-v2-${createHash('sha256').update(identity).digest('hex')}.bin`);
  // The unscoped v1 vault is deliberately never read, migrated, overwritten or deleted.
  if(vaultPath&&safeStorage.isEncryptionAvailable())try{
   const records:unknown=JSON.parse(safeStorage.decryptString(readFileSync(vaultPath)));
   if(Array.isArray(records))for(const value of records){
    const c=value as Stored;
    if(!c||!uuid.safeParse(c.id).success||!['playlist','xtream','real-debrid'].includes(c.type)||typeof c.name!=='string'||!Array.isArray(c.favorites))continue;
    connections.set(c.id,c);
   }
  }catch{/* Missing or unreadable current-identity vault requires reconnection. */}
 }
 function requireScope(){refreshScope();if(activeIdentity===null)throw new Error('Personal providers require a signed-in account.');return activeScope!;}
 function checkScope(scope:string){refreshScope();if(activeIdentity===null||activeScope!==scope)throw new Error('Personal account changed. Retry in the current account.');}
 function checkConnection(original:Stored,scope:string){checkScope(scope);if(connections.get(original.id)!==original)throw new Error('Personal connection changed. Refresh and retry.');}
 function persist(records:Stored[]=[...connections.values()]){
  if(!vaultPath||!safeStorage.isEncryptionAvailable())throw new Error('Encrypted OS storage is unavailable. Personal connections cannot be saved.');
  writeFileSync(vaultPath+'.tmp',safeStorage.encryptString(JSON.stringify(records)),{mode:0o600});renameSync(vaultPath+'.tmp',vaultPath);
 }
 function find(id:string){const c=connections.get(uuid.parse(id));if(!c)throw new Error('Personal connection not found.');return c;}
 function view(c:Stored):ProviderConnection{return{id:c.id,type:c.type,name:c.name,status:c.type==='real-debrid'?(c.credentials&&c.credentials.expiresAt>Date.now()?'connected':'auth-expired'):(channels.has(c.id)?'connected':'error'),channelCount:channels.get(c.id)?.length??0};}
 function revokePlayback(id:string){for(const [key,item]of handles)if(item.connectionId===id)handles.delete(key);}
 function registerHandle(url:string,connectionId:string,scope:string,resumeKey?:string){
  checkScope(scope);personalURL(url);if(!connections.has(connectionId))throw new Error('Personal connection not found.');
  if(handles.size>2000){for(const [key,item]of handles)if(item.expires<Date.now())handles.delete(key);if(handles.size>2000)throw new Error('Too many playback resources. Stop playback and retry.');}
  const id=randomUUID();handles.set(id,{url,connectionId,scope,expires:Date.now()+3600_000,resumeKey});return `rooms-provider://${id}/stream`;
 }
 async function fetchChecked(url:string,options:PrivateRequestOptions,check:()=>void){
  check();const response=await privateFetch(url,options);try{check();}catch(error){await response.body?.cancel();throw error;}return response;
 }
 async function textChecked(response:Response,check:()=>void){check();const text=await limitedText(response);check();return text;}
 async function jsonChecked(url:string,options:PrivateRequestOptions,check:()=>void):Promise<any>{return JSON.parse(await textChecked(await fetchChecked(url,options,check),check));}
 async function guideDocument(c:Stored,scope:string):Promise<GuideDocument|null>{
  const check=()=>checkConnection(c,scope);check();if(!c.xmltvUrl)return null;
  const url=c.xmltvUrl;let cache=guides.get(c.id);
  if(cache&&cache.connection===c&&cache.scope===scope&&cache.url===url){if(cache.pending)return cache.pending;if(cache.document&&cache.expires>Date.now())return cache.document;}
  cache={connection:c,scope,url,expires:0};const current=cache;
  const pending=(async()=>{try{
   const response=await fetchChecked(url,{},check);if(!response.ok){await response.body?.cancel();check();throw new Error('Personal guide is unavailable.');}const text=await textChecked(response,check);
   if(/<!DOCTYPE|<!ENTITY/i.test(text)||!/^\s*(?:<\?xml[^>]*>\s*)?<tv\b[^>]*(?:\/>|>[\s\S]*<\/tv>\s*)$/i.test(text))throw new Error('Unsupported XMLTV document.');
   // Index only loaded owned EPG identities once; later rows parse a bounded per-channel subset.
   const owned=new Set((channels.get(c.id)??[]).map(entry=>entry.epgId).filter((id):id is string=>Boolean(id)));
   const blocks=new Map<string,string[]>();let count=0;
   for(const match of text.matchAll(/<programme\b([^>]*)>[\s\S]*?<\/programme>/g)){if(++count>100000)throw new Error('Unsupported XMLTV document.');const id=match[1].match(/\bchannel="([^"]*)"/)?.[1];if(id&&owned.has(id)){const entries=blocks.get(id)??[];entries.push(match[0]);blocks.set(id,entries);}}
   const document:GuideDocument={xmlById:new Map([...blocks].map(([id,entries])=>[id,entries.join('\n')])),programs:new Map()};check();if(guides.get(c.id)!==current)throw new Error('Personal guide changed. Retry.');current.document=document;current.expires=Date.now()+GUIDE_TTL;return document;
  }catch(error){check();if(guides.get(c.id)===current)guides.delete(c.id);return null;}finally{if(guides.get(c.id)===current)current.pending=undefined;}})();
  current.pending=pending;guides.set(c.id,current);return pending;
 }
 async function guide(c:Stored,ids:string[],scope:string):Promise<PersonalGuide>{
  const check=()=>checkConnection(c,scope);check();const list=channels.get(c.id)??[];const selected=[...new Set(ids)].map(id=>{const entry=list.find(item=>item.id===id);if(!entry)throw new Error('Personal guide channel not found. Refresh the channel list.');return entry;});
  if(!c.xmltvUrl)return{status:'not-configured',programs:{}};if(!selected.some(entry=>entry.epgId))return{status:'unavailable',programs:{}};
  const document=await guideDocument(c,scope);check();if(!document)return{status:'unavailable',programs:{}};
  const programs:Record<string,PersonalProgram[]>=Object.create(null);
  try{for(const entry of selected){if(!entry.epgId){programs[entry.id]=[];continue;}let parsed=document.programs.get(entry.epgId);if(!parsed){parsed=parseEPG(document.xmlById.get(entry.epgId)??'',entry.epgId).map(program=>({...program,title:safeMediaLabel(program.title,'Program'),description:program.description.includes('://')?'':program.description}));document.programs.set(entry.epgId,parsed);}programs[entry.id]=parsed.filter(program=>Date.parse(program.endsAt)>=Date.now());}check();return{status:'available',programs};}catch(error){check();guides.delete(c.id);return{status:'unavailable',programs:{}};}
 }
 async function fetchChannels(c:Stored,check:()=>void){
  check();if(c.type==='playlist'){
   if(c.playlistText!==undefined)return parsePersonalPlaylistFile(c.playlistText);
   const response=await fetchChecked(c.url!,{},check);
   if(!response.ok){await response.body?.cancel();check();throw new Error('The playlist source is unavailable or authorization expired.');}
   const list=parsePlaylist(await textChecked(response,check),response.url||c.url!);check();return list;
  }
  if(c.type==='xtream'){
   const api=new URL('player_api.php',c.url);api.search=new URLSearchParams({username:c.username!,password:c.password!,action:'get_live_streams'}).toString();
   const data=await jsonChecked(api.href,{},check);
   if(!Array.isArray(data)||!data.length||data.length>10000)throw new Error('The Xtream connection returned no valid channel list.');
   const list:PlaylistEntry[]=data.map((s:any)=>{if(!/^\d{1,20}$/.test(String(s.stream_id)))throw new Error('Invalid provider stream identifier.');return{id:String(s.stream_id),name:safeMediaLabel(String(s.name??'Channel')),group:String(s.category_id??'Other').slice(0,100),url:personalURL(new URL(`live/${encodeURIComponent(c.username!)}/${encodeURIComponent(c.password!)}/${s.stream_id}.m3u8`,c.url).href).href};});check();return list;
  }
  return [];
 }
 function commitNew(c:Stored,list:PlaylistEntry[],scope:string){checkScope(scope);persist([...connections.values(),c]);connections.set(c.id,c);if(c.type!=='real-debrid')channels.set(c.id,list);return view(c);}
 function commitRD(credentials:Credentials,scope:string){checkScope(scope);const previous=[...connections.values()].filter(c=>c.type==='real-debrid');const c:Stored={...previous[0],id:previous[0]?.id??randomUUID(),type:'real-debrid',name:previous[0]?.name??'Real-Debrid',favorites:previous[0]?.favorites??[],credentials};persist([...connections.values()].filter(c=>c.type!=='real-debrid').concat(c));for(const old of previous){connections.delete(old.id);channels.delete(old.id);revokePlayback(old.id);}connections.set(c.id,c);rdItems.clear();}
 function commitUpdate(original:Stored,candidate:Stored,list:PlaylistEntry[],scope:string){checkConnection(original,scope);persist([...connections.values()].map(c=>c===original?candidate:c));connections.set(candidate.id,candidate);channels.set(candidate.id,list);guides.delete(candidate.id);revokePlayback(candidate.id);return view(candidate);}
 function xtreamBase(raw:string){const url=personalURL(raw);if(url.search||url.hash)throw new Error('Invalid provider base URL.');if(!url.pathname.endsWith('/'))url.pathname+='/';return url.href;}
 function rdConnection(){const c=[...connections.values()].find(c=>c.type==='real-debrid');if(!c)throw new Error('Real-Debrid is not connected.');return c;}
 function checkRD(generation:number,scope:string){checkScope(scope);if(generation!==rdGeneration)throw new Error('Real-Debrid authorization was cancelled. Start again.');}
 async function rdToken(c:Stored,scope:string){
  const check=()=>checkConnection(c,scope);check();if(!c.credentials)throw new Error('Connect your personal Real-Debrid account first.');if(c.credentials.expiresAt>Date.now()+30000)return c.credentials.access_token;
  const credentials=c.credentials;
  const next=await jsonChecked('https://api.real-debrid.com/oauth/v2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,code:credentials.refresh_token,grant_type:'http://oauth.net/grant_type/device/1.0'}).toString()},()=>{check();if(c.credentials!==credentials)throw new Error('Real-Debrid authorization changed. Retry.');});
  check();if(typeof next.access_token!=='string'||!Number.isFinite(Number(next.expires_in))||Number(next.expires_in)<=0)throw new Error('Real-Debrid authorization expired. Reconnect your account.');
  const updated={...credentials,access_token:next.access_token,refresh_token:typeof next.refresh_token==='string'?next.refresh_token:credentials.refresh_token,expiresAt:Date.now()+Number(next.expires_in)*1000};
  persist([...connections.values()].map(item=>item===c?{...c,credentials:updated}:item));c.credentials=updated;return updated.access_token;
 }
 const bind=(name:string,fn:(scope:string,...args:any[])=>unknown)=>ipcMain.handle(`rooms:provider-${name}`,async(event,...args)=>{
  assertSender(event);try{
   if(!app.isPackaged&&process.env.ROOMS_DEV_URL&&new URL(event.senderFrame?.url||event.sender.getURL()).searchParams.has('fixture'))throw new Error('Personal provider access is disabled in development fixtures.');
   refreshScope();if(name==='status'&&activeIdentity===null)return[];
   const scope=requireScope();const result=await fn(scope,...args);checkScope(scope);return result;
  }catch(error){if(error instanceof z.ZodError)throw new Error('Check the provider connection fields.');const msg=error instanceof Error?error.message:'';const allowed=['Personal','The personal','This source','Select a valid','The playlist','The source','The Xtream','Invalid provider','Encrypted','Too many','Real-Debrid','Connect your'];throw new Error(allowed.some(x=>msg.startsWith(x))?msg:'The personal provider request failed. Check authorization and retry.');}
 });
 bind('status',()=>[...connections.values()].map(view));
 bind('playlist',async(scope,input)=>{const b=z.object({name:label,url:urlSchema,xmltvUrl:urlSchema.optional()}).strict().parse(input);personalURL(b.url);if(b.xmltvUrl)personalURL(b.xmltvUrl);const c:Stored={id:randomUUID(),type:'playlist',...b,favorites:[]};const list=await fetchChannels(c,()=>checkScope(scope));return commitNew(c,list,scope);});
 bind('pick-playlist',(scope,...args)=>{if(args.length)throw new Error('Select a valid playlist file using the native chooser.');return fileImports.pick(async()=>{checkScope(scope);const result=await dialog.showOpenDialog({title:'Choose playlist file',properties:['openFile'],filters:[{name:'M3U playlists',extensions:['m3u','m3u8']}]});checkScope(scope);return result.canceled?null:result.filePaths[0]??null;});});
 bind('playlist-file',(scope,input)=>{const b=z.object({name:label,token:uuid,xmltvUrl:urlSchema.optional()}).strict().parse(input);if(b.xmltvUrl)personalURL(b.xmltvUrl);const playlistText=fileImports.take(b.token);const list=parsePersonalPlaylistFile(playlistText);return commitNew({id:randomUUID(),type:'playlist',name:b.name,playlistText,xmltvUrl:b.xmltvUrl,favorites:[]},list,scope);});
 bind('xtream',async(scope,input)=>{const b=z.object({name:label,serverUrl:urlSchema,username:secret,password:secret}).strict().parse(input);const c:Stored={id:randomUUID(),type:'xtream',name:b.name,url:xtreamBase(b.serverUrl),username:b.username,password:b.password,favorites:[]};const list=await fetchChannels(c,()=>checkScope(scope));return commitNew(c,list,scope);});
 bind('playlist-update',async(scope,input)=>{const b=z.object({id:uuid,name:label,url:urlSchema.optional(),token:uuid.optional(),xmltvUrl:urlSchema.nullable().optional()}).strict().parse(input);if(b.url!==undefined&&b.token!==undefined)throw new Error('The playlist update must choose one URL or file source.');const original=find(b.id);if(original.type!=='playlist')throw new Error('Personal connection is not a playlist.');const candidate:Stored={...original,name:b.name,favorites:[...original.favorites]};if(b.xmltvUrl!==undefined){if(b.xmltvUrl!==null)personalURL(b.xmltvUrl);candidate.xmltvUrl=b.xmltvUrl??undefined;}if(b.url!==undefined){candidate.url=personalURL(b.url).href;delete candidate.playlistText;}if(b.token!==undefined){candidate.playlistText=fileImports.take(b.token);delete candidate.url;}const list=await fetchChannels(candidate,()=>checkConnection(original,scope));return commitUpdate(original,candidate,list,scope);});
 bind('xtream-update',async(scope,input)=>{const b=z.object({id:uuid,name:label,serverUrl:urlSchema.optional(),username:secret.optional(),password:secret.optional()}).strict().parse(input);const original=find(b.id);if(original.type!=='xtream')throw new Error('Personal connection is not Xtream.');const candidate:Stored={...original,name:b.name,favorites:[...original.favorites]};if(b.serverUrl!==undefined)candidate.url=xtreamBase(b.serverUrl);if(b.username!==undefined)candidate.username=b.username;if(b.password!==undefined)candidate.password=b.password;const list=await fetchChannels(candidate,()=>checkConnection(original,scope));return commitUpdate(original,candidate,list,scope);});
 bind('channels',async(scope,id)=>{const c=find(id);const list=await fetchChannels(c,()=>checkConnection(c,scope));checkConnection(c,scope);const previous=channels.get(c.id);if(!previous||previous.length!==list.length||previous.some((entry,index)=>entry.id!==list[index].id||entry.epgId!==list[index].epgId))guides.delete(c.id);channels.set(c.id,list);return list.map(e=>({id:e.id,name:safeMediaLabel(e.name),group:safeMediaLabel(e.group,'Other'),favorite:c.favorites.includes(e.id)}));});
 bind('guide',async(scope,...args)=>{const [id,ids]=z.tuple([uuid,z.array(channelID).max(32)]).parse(args);return guide(find(id),ids,scope);});
 bind('epg',async(scope,...args)=>{const [id,channelId]=z.tuple([uuid,channelID]).parse(args);const result=await guide(find(id),[channelId],scope);return result.programs[channelId]??[];});
 bind('favorite',(scope,id,channelId,value)=>{const c=find(id);z.string().max(100).parse(channelId);z.boolean().parse(value);if(!channels.get(c.id)?.some(e=>e.id===channelId))throw new Error('Personal channel not found.');const favorites=c.favorites.filter(x=>x!==channelId);if(value)favorites.push(channelId);checkConnection(c,scope);persist([...connections.values()].map(item=>item===c?{...c,favorites}:item));c.favorites=favorites;});
 bind('play',(scope,id,channelId)=>{const c=find(id);const entry=channels.get(c.id)?.find(x=>x.id===channelId);if(!entry)throw new Error('Personal channel not found. Refresh the list.');return{url:registerHandle(entry.url,c.id,scope),name:safeMediaLabel(entry.name),live:true};});
 bind('resume',(scope,url,position)=>{const parsed=new URL(urlSchema.parse(url));if(parsed.protocol!=='rooms-provider:')throw new Error('Invalid provider media handle.');const item=handles.get(parsed.hostname);if(!item||item.scope!==scope||item.expires<Date.now()||!item.resumeKey)throw new Error('Personal playback expired.');const c=find(item.connectionId);const seconds=z.number().finite().min(0).max(604800).parse(position);const resume={...c.resume,[item.resumeKey]:Math.floor(seconds)};const keys=Object.keys(resume);for(const key of keys.slice(0,Math.max(0,keys.length-1000)))delete resume[key];persist([...connections.values()].map(value=>value===c?{...c,resume}:value));c.resume=resume;});
 bind('disconnect',async(scope,id)=>{const c=find(id);const check=()=>checkConnection(c,scope);if(c.type==='real-debrid'&&c.credentials){try{const response=await fetchChecked('https://api.real-debrid.com/rest/1.0/disable_access_token',{headers:{Authorization:`Bearer ${c.credentials.access_token}`}},check);await response.body?.cancel();}catch{/* Local disconnection remains possible when upstream revocation is unavailable. */}check();}check();persist([...connections.values()].filter(item=>item!==c));connections.delete(c.id);channels.delete(c.id);guides.delete(c.id);revokePlayback(c.id);if(c.type==='real-debrid')rdItems.clear();});
 bind('rd-cancel',(_scope,...args)=>{if(args.length)throw new Error('Real-Debrid cancellation takes no fields.');rdGeneration++;pending=null;});
 bind('rd-start',async(scope,...args)=>{if(args.length)throw new Error('Real-Debrid device login takes no fields.');const generation=++rdGeneration;pending=null;const check=()=>checkRD(generation,scope);const clientId=process.env.ROOMS_RD_CLIENT_ID;if(!clientId)throw new Error('Real-Debrid device login requires the ROOMS registered public client ID.');if(!safeStorage.isEncryptionAvailable())throw new Error('Encrypted OS storage is unavailable.');const u=new URL('https://api.real-debrid.com/oauth/v2/device/code');u.search=new URLSearchParams({client_id:clientId,new_credentials:'yes'}).toString();const data=await jsonChecked(u.href,{},check);check();if(typeof data.device_code!=='string'||typeof data.user_code!=='string'||data.verification_url!=='https://real-debrid.com/device'||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0)throw new Error('Real-Debrid returned an invalid authorization request.');const attempt:DeviceAttempt={deviceCode:data.device_code,expires:Date.now()+Number(data.expires_in)*1000,nextPoll:Date.now()+5000,interval:Math.max(5,Number(data.interval)||5),generation,scope,clientId};pending=attempt;check();await shell.openExternal(data.verification_url);check();return{userCode:data.user_code,verificationUrl:data.verification_url,expiresAt:new Date(attempt.expires).toISOString(),interval:attempt.interval};});
 bind('rd-poll',async(scope,...args)=>{if(args.length)throw new Error('Real-Debrid polling takes no fields.');const attempt=pending;if(!attempt)return{state:'expired'};if(Date.now()>=attempt.expires){pending=null;rdGeneration++;return{state:'expired'};}const check=()=>{checkRD(attempt.generation,scope);if(pending!==attempt||attempt.scope!==scope||Date.now()>=attempt.expires)throw new Error('Real-Debrid authorization expired. Start again.');};check();if(Date.now()<attempt.nextPoll)return{state:'pending'};attempt.nextPoll=Date.now()+attempt.interval*1000;const u=new URL('https://api.real-debrid.com/oauth/v2/device/credentials');u.search=new URLSearchParams({client_id:attempt.clientId,code:attempt.deviceCode}).toString();const response=await fetchChecked(u.href,{},check);if(response.status===403){await response.body?.cancel();check();return{state:'pending'};}const credentials=JSON.parse(await textChecked(response,check));if(typeof credentials.client_id!=='string'||typeof credentials.client_secret!=='string')return{state:'pending'};const token=await jsonChecked('https://api.real-debrid.com/oauth/v2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,code:attempt.deviceCode,grant_type:'http://oauth.net/grant_type/device/1.0'}).toString()},check);check();if(typeof token.access_token!=='string'||typeof token.refresh_token!=='string'||!Number.isFinite(Number(token.expires_in))||Number(token.expires_in)<=0)throw new Error('Real-Debrid authorization did not complete.');check();commitRD({client_id:credentials.client_id,client_secret:credentials.client_secret,access_token:token.access_token,refresh_token:token.refresh_token,expiresAt:Date.now()+Number(token.expires_in)*1000},scope);pending=null;rdGeneration++;return{state:'connected'};});
 bind('rd-library',async(scope)=>{const c=rdConnection();const check=()=>checkConnection(c,scope);const token=await rdToken(c,scope);check();const items=await jsonChecked('https://api.real-debrid.com/rest/1.0/downloads?limit=100',{headers:{Authorization:`Bearer ${token}`}},check);if(!Array.isArray(items)||items.length>100)throw new Error('Real-Debrid library is unavailable.');const next=new Map<string,{name:string;download:string}>();const result=items.map((e:any)=>{const id=String(e.id);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Real-Debrid library entry is invalid.');next.set(id,{name:safeMediaLabel(String(e.filename??'Personal media')),download:personalURL(e.download).href});const addedAt=libraryDate(e.generated),resumeAt=storedResume(c.resume?.[id]);return{id,name:safeMediaLabel(String(e.filename??'Personal media')),size:Number(e.filesize)||0,mime:typeof e.mimeType==='string'&&/^(?:video|audio)\/[a-zA-Z0-9.+-]{1,80}$/.test(e.mimeType)?e.mimeType:'',...(addedAt!==undefined?{addedAt}:{}),...(resumeAt!==undefined?{resumeAt}:{})};});check();rdItems.clear();for(const [id,item]of next)rdItems.set(id,item);return result;});
 bind('rd-play',(scope,id)=>{const c=rdConnection();const item=rdItems.get(z.string().max(100).parse(id));if(!item)throw new Error('Real-Debrid library entry expired. Refresh the library.');return{url:registerHandle(item.download,c.id,scope,id),name:item.name,live:false,startAt:c.resume?.[id]??0};});
 protocol.handle('rooms-provider',async request=>{try{
  refreshScope();const u=new URL(request.url);const item=handles.get(u.hostname);if(!item||item.scope!==activeScope||item.expires<Date.now()||!connections.has(item.connectionId))return new Response('Personal playback expired.',{status:410});
  const check=()=>{checkScope(item.scope);if(handles.get(u.hostname)!==item||!connections.has(item.connectionId)||item.expires<Date.now())throw new Error('Personal playback expired.');};
  const headers:Record<string,string>={};const range=request.headers.get('Range');if(range&&/^bytes=\d+-\d*$/.test(range))headers.Range=range;
  const response=await fetchChecked(item.url,{headers,signal:request.signal},check);
  if(!response.ok&&response.status!==206){await response.body?.cancel();check();return new Response('Personal source unavailable.',{status:response.status});}
  const mime=response.headers.get('content-type')??'application/octet-stream';
  if(/mpegurl/i.test(mime)||new URL(item.url).pathname.endsWith('.m3u8')){const text=rewriteHLS(await textChecked(response,check),response.url||item.url,url=>registerHandle(url,item.connectionId,item.scope));check();return new Response(text,{headers:{'Content-Type':'application/vnd.apple.mpegurl','Access-Control-Allow-Origin':'*'}});}
  const out=new Headers({'Content-Type':mime,'Access-Control-Allow-Origin':'*'});for(const key of ['content-length','content-range','accept-ranges']){const value=response.headers.get(key);if(value)out.set(key,value);}check();
  // Guard each streamed chunk as well as the initial response, so logout cannot keep an old stream reading.
  const reader=response.body?.getReader();const body=reader?new ReadableStream<Uint8Array>({async pull(controller){try{check();const result=await reader.read();check();if(result.done){controller.close();return;}controller.enqueue(result.value);}catch{await reader.cancel();controller.error(new Error('Personal playback expired.'));}},cancel:()=>reader.cancel()}):null;
  return new Response(body,{status:response.status,headers:out});
 }catch{return new Response('Personal source could not be loaded.',{status:502});}});
 return{clearPlayback};
}
