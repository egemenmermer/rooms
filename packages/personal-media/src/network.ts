import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import http from 'node:http';
import { Readable } from 'node:stream';
export function isPublicAddress(address:string):boolean {
 if(address.includes(':')) { const a=address.toLowerCase(); return /^[23]/.test(a)&&!a.startsWith('2001:db8:')&&!/^2001:(?:0{1,4}:|[01][0-9a-f]{0,2}:)/.test(a)&&!a.startsWith('2002:')&&!a.startsWith('3fff:'); }
 const p=address.split('.').map(Number);if(p.length!==4||p.some(x=>!Number.isInteger(x)||x<0||x>255))return false;
 return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===192&&p[1]===0&&(p[2]===0||p[2]===2)||p[0]===198&&(p[1]===18||p[1]===19||p[1]===51&&p[2]===100)||p[0]===203&&p[1]===0&&p[2]===113);
}
export function personalURL(raw:string):URL {const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.href.length>8192)throw new Error('Invalid personal media URL. Use an HTTP(S) source without URL userinfo.');return u;}
/** Pins the validated DNS answer for the connection, including every redirect. */
export interface PrivateRequestOptions {headers?:Record<string,string>;method?:string;body?:string;signal?:AbortSignal;allowedHosts?:string[];allowedProtocols?:string[]}
export function redirectRequest(previous:URL,target:URL,options:PrivateRequestOptions):PrivateRequestOptions{if(options.body!==undefined||(options.method&&options.method!=='GET'&&options.method!=='HEAD'))throw new Error('Personal provider redirects for credential requests are not supported.');const headers={...options.headers};if(target.origin!==previous.origin)for(const key of Object.keys(headers))if(['authorization','cookie','proxy-authorization'].includes(key.toLowerCase()))delete headers[key];return{...options,headers};}
export async function privateFetch(raw:string, options:PrivateRequestOptions={},redirects=0):Promise<Response>{
 const url=personalURL(raw);if(options.allowedProtocols&&!options.allowedProtocols.includes(url.protocol))throw new Error('Source protocol is outside the approved scope.');if(options.allowedHosts&&!options.allowedHosts.includes(url.hostname))throw new Error('Personal request host is outside the approved scope.');const host=url.hostname.replace(/^\[|\]$/g,'');const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true});
 if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new Error('This source resolves to a private or reserved network.');
 const addr=addresses[0];
 const response=await new Promise<http.IncomingMessage>((resolve,reject)=>{const req=(url.protocol==='https:'?https:http).request(url,{method:options.method??'GET',headers:options.headers,signal:options.signal,family:addr.family,lookup:(_hostname,_opts,cb)=>cb(null,addr.address,addr.family)},resolve);req.on('error',()=>reject(new Error('The personal media source could not be reached.')));req.setTimeout(15000,()=>req.destroy());if(options.body)req.write(options.body);req.end();});
 const code=response.statusCode??502;
 if([301,302,303,307,308].includes(code)&&response.headers.location){response.destroy();if(redirects>=4)throw new Error('Too many source redirects.');const target=personalURL(new URL(response.headers.location,url).href);return privateFetch(target.href,redirectRequest(url,target,options),redirects+1);}
 const headers=new Headers();for(const [k,v]of Object.entries(response.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
 const result=new Response(Readable.toWeb(response) as ReadableStream,{status:code,headers});Object.defineProperty(result,'url',{value:url.href});return result;
}
export async function limitedText(response:Response,max=5_000_000):Promise<string>{if(!response.ok)throw new Error(response.status===401||response.status===403?'Personal source authorization expired or denied.':'The personal source returned an error.');const reader=response.body?.getReader();if(!reader)return '';let total=0;const chunks:Uint8Array[]=[];try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max)throw new Error('The source exceeds the supported size.');chunks.push(value);}}finally{await reader.cancel();}return Buffer.concat(chunks).toString('utf8');}
