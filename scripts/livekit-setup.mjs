import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const dir=new URL('../infra/local/',import.meta.url);await mkdir(dir,{recursive:true,mode:0o700});
const envPath=new URL('.env',dir);let env='';try{env=await readFile(envPath,'utf8');}catch{}
const get=name=>env.split('\n').find(line=>line.startsWith(name+'='))?.slice(name.length+1);
if(!get('LIVEKIT_API_KEY'))env+=`LIVEKIT_API_KEY=rooms-${randomBytes(12).toString('hex')}\n`;
if(!get('LIVEKIT_API_SECRET'))env+=`LIVEKIT_API_SECRET=${randomBytes(32).toString('hex')}\n`;
await writeFile(envPath,env,{mode:0o600});
const config=new URL('livekit.yaml',dir);try{await access(config);}catch{await writeFile(config,`port: 7880\nbind_addresses: ["0.0.0.0"]\nrtc:\n  tcp_port: 7881\n  port_range_start: 50000\n  port_range_end: 50020\n  use_external_ip: false\nkeys:\n  ${get('LIVEKIT_API_KEY')}: ${get('LIVEKIT_API_SECRET')}\n`,{mode:0o600});}
console.log('Local LiveKit credentials/config ready. Existing secrets preserved; no values logged.');
