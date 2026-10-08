// Loopback-only development reverse proxy and access broker. No global services are changed.
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
await import('./build-access.mjs');
const values=Object.fromEntries(readFileSync(new URL('../infra/local/.env',import.meta.url),'utf8').split('\n').filter(line=>line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const child=spawn(process.execPath,['dist-services/access.cjs'],{stdio:'inherit',env:{...process.env,LIVEKIT_API_KEY:values.LIVEKIT_API_KEY,LIVEKIT_API_SECRET:values.LIVEKIT_API_SECRET,SPACEBAR_INTERNAL_URL:'http://127.0.0.1:3003',LIVEKIT_INTERNAL_URL:'http://127.0.0.1:7880',LIVEKIT_PUBLIC_URL:'ws://127.0.0.1:7880',PORT:'3002',SERVICE_HOST:'127.0.0.1'}});
const proxy=http.createServer((request,response)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname).replace(/\/+/g,'/');}catch{response.writeHead(400).end();return;}
  const auth=pathname.match(/^\/api(?:\/v\d+)?\/auth\/(login|register)\/?$/);
  const broker=pathname.startsWith('/rooms-access/');
  const port=auth||broker?3002:3003;
  const path=auth?`/api/v9/auth/${auth[1]}`:broker?request.url.slice('/rooms-access'.length):request.url;
  const upstream=http.request({hostname:'127.0.0.1',port,path,method:request.method,headers:request.headers},incoming=>{response.writeHead(incoming.statusCode??502,incoming.headers);incoming.pipe(response);});
  upstream.on('error',()=>{if(!response.headersSent)response.writeHead(503,{'Content-Type':'application/json'});response.end(JSON.stringify({message:'The local service is unavailable. Start the Spacebar and access services.'}));});request.pipe(upstream);
});
proxy.on('upgrade',(request,socket,head)=>{
  const upstream=net.connect(3003,'127.0.0.1',()=>{upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${Object.entries(request.headers).map(([key,value])=>`${key}: ${Array.isArray(value)?value.join(', '):value}`).join('\r\n')}\r\n\r\n`);if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);});
  upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
});
proxy.on('error',()=>{child.kill();console.error('Local proxy port unavailable. Stop the previous ROOMS proxy instance and retry.');process.exitCode=1;});
proxy.listen(3011,'127.0.0.1',()=>console.log('ROOMS private local proxy ready at http://127.0.0.1:3011. Request logging disabled.'));
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;proxy.close();child.kill();};process.on('SIGINT',stop);process.on('SIGTERM',stop);child.on('exit',()=>{proxy.close();});
