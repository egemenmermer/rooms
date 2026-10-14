import http from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {resolve,dirname,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const data=resolve(process.env.ROOMS_DISTRIBUTION_DATA||'.local/distribution');
const origin=process.env.ROOMS_DISTRIBUTION_ORIGIN;
if(!origin)throw new Error('Set ROOMS_DISTRIBUTION_ORIGIN explicitly for your own portal.');
const membershipOrigin=process.env.ROOMS_MEMBERSHIP_ORIGIN||'http://access:3002';
const cookieName='__Host-rooms_distribution';
const digest=value=>createHash('sha256').update(value).digest('hex');
const sessions=new Map(),attempts=new Map();
const ttl=24*60*60*1000;
const ledger=async()=>JSON.parse(await readFile(resolve(data,'invites.json'),'utf8'));
const cookie=(token,age)=>`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const fail=(status,message)=>Object.assign(new Error(message),{status});
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function body(req){let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>2048)throw fail(413,'İstek çok büyük.');}try{return JSON.parse(text);}catch{throw fail(400,'Geçersiz istek.');}}
function limit(req,res){
 const ip=req.headers['x-real-ip']||req.socket.remoteAddress;const now=Date.now();
 const entry=attempts.get(ip)||{count:0,until:now+60000};
 if(entry.until<=now){entry.count=0;entry.until=now+60000;}
 entry.count++;attempts.set(ip,entry);
 if(entry.count>10){res.setHeader('Retry-After','60');throw fail(429,'Çok fazla deneme. Bir dakika sonra tekrar dene.');}
}
async function membershipInvitation(code){
 // Inspect only: downloading must never consume a membership/signup invitation.
 if(!/^[a-f0-9]{64}$/.test(code))return null;
 let response;
 try{response=await fetch(new URL('/v1/auth/invites/'+code,membershipOrigin),{signal:AbortSignal.timeout(3000)});}
 catch{throw fail(503,'Üyelik daveti doğrulanamıyor. Biraz sonra tekrar dene.');}
 if([404,409,403].includes(response.status))return null;
 if(!response.ok)throw fail(503,'Üyelik daveti doğrulanamıyor. Biraz sonra tekrar dene.');
 const invitation=await response.json(),expires=Date.parse(invitation.expiresAt);
 if(!Number.isFinite(expires)||expires<=Date.now())return null;
 return {expires:Math.min(expires,Date.now()+ttl),source:'membership'};
}
async function authorize(req){
 const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 const session=value&&sessions.get(digest(value));
 if(!session||session.expires<=Date.now())throw fail(401,'Oturum sona erdi. Davet kodunu tekrar gir.');
 // Membership tickets remain one-use for signup; the download session does not consume them.
 // Keep the already granted session only until its original membership expiry.
 if(session.source==='membership')return session;
 const invites=await ledger();const invite=invites.invites[session.invite];
 if(!invite||invite.revoked||(!Number.isFinite(Date.parse(invite.expiresAt))||Date.parse(invite.expiresAt)<=Date.now())){sessions.delete(digest(value));throw fail(401,'Davet kodu artık geçerli değil.');}
 return session;
}
async function releases(){
 const manifest=JSON.parse(await readFile(resolve(data,'releases.json'),'utf8'));
 return manifest.releases.filter(item=>item.withdrawn!==true&&((item.platform==='macOS'&&item.signed===true&&item.notarized===true&&item.stapled===true)||(item.platform==='Windows'&&item.verified===true&&item.friendPreview===true&&typeof item.signed==='boolean'))).map(item=>{
  if((item.id!==undefined&&!/^[A-Za-z0-9._-]+$/.test(item.id))||!/^[A-Za-z0-9._-]+$/.test(item.version)||!((item.platform==='macOS'&&item.arch==='arm64'&&/^ROOMS-[A-Za-z0-9._-]+-arm64\.dmg$/.test(item.file))||(item.platform==='Windows'&&item.arch==='x64'&&/^ROOMS-[A-Za-z0-9._-]+-windows-x64-setup\.exe$/.test(item.file)))||!Number.isSafeInteger(item.size)||item.size<=0||!/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isFinite(Date.parse(item.date))||!Array.isArray(item.notes)||!item.notes.every(note=>typeof note==='string'))throw Error('Invalid release manifest');
  return item;
 });
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='POST'){
   if(req.headers.origin!==origin)throw fail(403,'İstek kaynağına izin verilmiyor.');
   if(path==='/distribution/login'){
    limit(req,res);const {code}=await body(req);
    if(typeof code!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(code.trim()))throw fail(403,'Davet kodu geçersiz veya süresi dolmuş.');
    const normalized=code.trim(),hash=digest(normalized),invites=await ledger(),invite=invites.invites[hash];
    let grant=null;
    if(invite){
     const expires=Date.parse(invite.expiresAt);
     if(!invite.revoked&&Number.isFinite(expires)&&expires>Date.now())grant={source:'distribution',expires:Math.min(expires,Date.now()+ttl)};
    }else grant=await membershipInvitation(normalized);
    if(!grant)throw fail(403,'Davet kodu geçersiz veya süresi dolmuş.');
    if(sessions.size>=2000)throw fail(503,'Oturum kapasitesi dolu. Daha sonra tekrar dene.');
    const token=randomBytes(32).toString('base64url');sessions.set(digest(token),{invite:hash,...grant});
    res.setHeader('Set-Cookie',cookie(token,Math.floor((grant.expires-Date.now())/1000)));return json(res,200,{accepted:true});
   }
   if(path==='/distribution/logout'){
    const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(value)sessions.delete(digest(value));res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{accepted:true});
   }
  }
  if(req.method==='GET'&&path==='/distribution/releases'){
   await authorize(req);const list=await releases();return json(res,200,{releases:list.map(({file,...item})=>({...item,downloadUrl:`/distribution/download/${encodeURIComponent(item.id||item.version)}`}))});
  }
  if((req.method==='GET'||req.method==='HEAD')&&path.startsWith('/distribution/download/')){
   await authorize(req);const version=path.slice('/distribution/download/'.length),item=(await releases()).find(x=>(x.id||x.version)===version);
   if(!item)throw fail(404,'Sürüm bulunamadı.');
   const artifacts=await realpath(resolve(data,'artifacts')),file=await realpath(resolve(artifacts,item.file));
   if(!file.startsWith(artifacts+sep)||basename(file)!==item.file)throw fail(404,'Dosya bulunamadı.');
   const info=await stat(file);if(!info.isFile()||info.size!==item.size)throw fail(503,'Sürüm dosyası hazır değil.');
   let start=0,end=info.size-1,status=200;
   if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){res.setHeader('Content-Range',`bytes */${info.size}`);throw fail(416,'Geçersiz dosya aralığı.');}
    if(!match[1]){const suffix=Number(match[2]);start=Math.max(0,info.size-suffix);if(suffix<=0)start=info.size;}
    else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.setHeader('Content-Range',`bytes */${info.size}`);throw fail(416,'Geçersiz dosya aralığı.');}
    status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
   }
   res.setHeader('Content-Type',item.platform==='Windows'?'application/vnd.microsoft.portable-executable':'application/x-apple-diskimage');res.setHeader('Content-Disposition',`attachment; filename="${item.file}"`);
   res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);res.writeHead(status);
   if(req.method==='HEAD')return res.end();
   const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);
  }
  const assets={'/':['index.html','text/html'],'/distribution/portal.css':['portal.css','text/css'],'/distribution/portal.js':['portal.js','text/javascript']};
  if((req.method==='GET'||req.method==='HEAD')&&assets[path]){
   const [name,type]=assets[path],contents=await readFile(resolve(root,'public',name));res.setHeader('Content-Type',type+'; charset=utf-8');res.setHeader('Content-Length',contents.length);res.writeHead(200);return res.end(req.method==='HEAD'?undefined:contents);
  }
  throw fail(404,'Sayfa bulunamadı.');
 }catch(error){if(res.headersSent)return res.destroy();json(res,error.status||503,{error:error.status?error.message:'Servise şu an erişilemiyor. Daha sonra tekrar dene.'});}
});
setInterval(()=>{const now=Date.now();for(const [key,value]of sessions)if(value.expires<=now)sessions.delete(key);for(const [key,value]of attempts)if(value.until<=now)attempts.delete(key);},60000).unref();
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||3040),process.env.HOST||'127.0.0.1',()=>console.log('ROOMS distribution service listening.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
