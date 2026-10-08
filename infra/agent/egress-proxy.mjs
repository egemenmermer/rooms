import http from 'node:http';
import net from 'node:net';
import {lookup} from 'node:dns/promises';
import {readFileSync,statSync} from 'node:fs';

const policyFile=process.env.ROOMS_EGRESS_HOSTS_FILE??'/etc/rooms-egress/hosts.json';
function approvedHosts(){if(statSync(policyFile).mode&0o077)throw new Error('Private proxy policy required');const value=JSON.parse(readFileSync(policyFile,'utf8'));if(!Array.isArray(value)||value.some(host=>typeof host!=='string'||!/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z0-9-]+$/.test(host)))throw new Error('Invalid egress host policy');return new Set(value);}
function publicAddress(address){if(address.includes(':')){const a=address.toLowerCase();return /^[23]/.test(a)&&!a.startsWith('2001:db8:')&&!/^2001:(?:0{1,4}:|[01][0-9a-f]{0,2}:)/.test(a)&&!a.startsWith('2002:')&&!a.startsWith('3fff:');}const p=address.split('.').map(Number);return p.length===4&&!p.some(v=>!Number.isInteger(v)||v<0||v>255)&&!(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===192&&p[1]===0&&(p[2]===0||p[2]===2)||p[0]===198&&(p[1]===18||p[1]===19||p[1]===51&&p[2]===100)||p[0]===203&&p[1]===0&&p[2]===113);}
let active=0;
const server=http.createServer((_request,response)=>{response.writeHead(405);response.end('HTTPS CONNECT only.');});
server.on('connect',async(request,client,head)=>{
 let upstream=null;let counted=false;
 const deny=()=>{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');upstream?.destroy();};
 try{
  if(active>=64||head.length>16384||!request.url||request.url.length>300)return deny();
  const match=/^([a-zA-Z0-9.-]+):443$/.exec(request.url);if(!match||!approvedHosts().has(match[1].toLowerCase()))return deny();
  const addresses=await lookup(match[1],{all:true});if(!addresses.length||addresses.some(value=>!publicAddress(value.address)))return deny();
  active++;counted=true;const pinned=addresses[0];upstream=net.connect({host:pinned.address,port:443,family:pinned.family});
  upstream.setTimeout(120000,()=>upstream.destroy());client.setTimeout(120000,()=>client.destroy());
  upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
  upstream.on('error',()=>client.destroy());client.on('error',()=>upstream?.destroy());client.on('close',()=>upstream?.destroy());upstream.on('close',()=>client.destroy());
 }catch{deny();}
 finally{if(counted)client.once('close',()=>{active--;});}
});
server.headersTimeout=15000;server.requestTimeout=30000;
server.listen(Number(process.env.PORT??3128),'0.0.0.0',()=>{console.log('ROOMS restricted HTTPS egress proxy listening. Request logging disabled.');});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
