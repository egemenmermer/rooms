import { z } from 'zod';
import type { StoatClient } from '@rooms/stoat';
import { dmCallSessionSchema } from '../../../packages/shared-contracts/src/dm-call';
const grantSchema=z.object({serverUrl:z.string().url().max(2048),roomName:z.string().max(128),token:z.string().min(1).max(8192),expiresAt:z.string().datetime()}).strict();
const messages:Record<string,string>={DM_CALL_BUSY:'Bu kişi başka bir aramada. Daha sonra tekrar dene.',DM_CALL_FRIEND_REQUIRED:'Özel arama için önce arkadaş olmalısınız.',DM_CALL_ACCESS_DENIED:'Bu özel görüşmeye erişimin yok.',DM_CALL_NOT_FOUND:'Arama sona erdi.',DM_CALL_ACCEPT_REQUIRED:'Arama henüz kabul edilmedi.',DM_CALL_ENDED:'Arama sona erdi.',AUTH_REQUIRED:'Oturumunun süresi doldu. Yeniden giriş yap.'};
/** Native-only authenticated signaling. Public call state never includes account credentials. */
export async function requestDmCall(client:StoatClient,path:'poll'|'start'|'respond'|'grant',body:unknown){
  const response=await fetch(`${new URL(client.instanceUrl).origin}/rooms-access/v1/calls/${path}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${client.getToken()}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  if(response.status===404||response.status===501)throw new Error('Bu sunucuda özel arama servisi etkin değil.');
  const raw=await response.text();if(raw.length>32768)throw new Error('Arama sunucusu geçersiz yanıt verdi.');
  let data:unknown;try{data=JSON.parse(raw);}catch{throw new Error('Arama sunucusuna ulaşılamıyor. Yeniden dene.');}
  if(!response.ok){const code=z.object({error:z.string()}).passthrough().safeParse(data);throw new Error(code.success?messages[code.data.error]??'Arama sunucusuna ulaşılamıyor. Yeniden dene.':'Arama isteği reddedildi.');}
  if(path==='poll')return z.object({call:dmCallSessionSchema.nullable()}).strict().parse(data);
  if(path==='grant'){const grant=grantSchema.parse(data);const url=new URL(grant.serverUrl);if(!['wss:','ws:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(url.protocol==='ws:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))||grant.roomName!==`rooms-dm-call-${(body as {callId:string}).callId}`)throw new Error('Arama medya izni geçersiz.');return grant;}
  return dmCallSessionSchema.parse(data);
}
