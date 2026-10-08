import { mkdir, access, readFile, writeFile, open } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.local');
const node = resolve(root, 'node-v24.21.0-darwin-arm64/bin/node');
const runtimeBin = resolve(root, 'node-v24.21.0-darwin-arm64/bin');
const upstream = process.env.SPACEBAR_SOURCE ?? '/tmp/rooms-spacebar-case-sensitive/upstream';
await mkdir(root,{recursive:true,mode:0o700});
try { await access(node); } catch {
  const response = await fetch('https://nodejs.org/dist/v24.21.0/node-v24.21.0-darwin-arm64.tar.gz');
  if (!response.ok) throw new Error('Official Node24 download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057') throw new Error('Node24 archive checksum mismatch');
  const archive=resolve(root,'node.tar.gz'); await writeFile(archive,bytes,{mode:0o600});
  execFileSync('tar',['-xzf',archive,'-C',root],{stdio:'ignore'});
}
if (!process.env.SPACEBAR_SOURCE) {
  try { await access('/tmp/rooms-spacebar-case-sensitive/upstream'); } catch {
    const image=resolve(root,'spacebar-source.sparseimage');
    try { await access(image); } catch { execFileSync('hdiutil',['create','-size','3g','-type','SPARSE','-fs','Case-sensitive APFS','-volname','RoomsSpacebarDev',image],{stdio:'ignore'}); }
    execFileSync('hdiutil',['attach',image,'-mountpoint','/tmp/rooms-spacebar-case-sensitive','-nobrowse'],{stdio:'ignore'});
  }
}

const pgData=resolve(root,'postgres');
try { await access(resolve(pgData,'PG_VERSION')); } catch { execFileSync('/opt/homebrew/opt/postgresql@16/bin/initdb',['-D',pgData,'-U','rooms','-A','trust','--no-locale'],{stdio:'ignore'}); }
try { execFileSync('/opt/homebrew/opt/postgresql@16/bin/pg_ctl',['-D',pgData,'status'],{stdio:'ignore'}); } catch { execFileSync('/opt/homebrew/opt/postgresql@16/bin/pg_ctl',['-D',pgData,'-l',resolve(root,'postgres.log'),'-o','-h 127.0.0.1 -p 55432','start'],{stdio:'ignore'}); }
try { execFileSync('/opt/homebrew/opt/postgresql@16/bin/createdb',['-h','127.0.0.1','-p','55432','-U','rooms','spacebar'],{stdio:'ignore'}); } catch {}
try { await access(resolve(upstream,'dist/bundle/start.js')); } catch {
  try { await access(resolve(upstream,'.git')); } catch { execFileSync('git',['clone','https://github.com/spacebarchat/server.git',upstream],{stdio:'ignore'}); execFileSync('git',['-C',upstream,'checkout','0eb6f04f6d8055dba0194d10c47c33e074a8a281'],{stdio:'ignore'}); }
  const env={...process.env,PATH:runtimeBin+':'+process.env.PATH};
  execFileSync(resolve(runtimeBin,'npm'),['ci','--include=dev'],{cwd:upstream,env,stdio:'ignore'});
  execFileSync(resolve(runtimeBin,'npm'),['run','build'],{cwd:upstream,env,stdio:'ignore'});
}
try {
  const ready=await fetch('http://127.0.0.1:3003/api/v9/gateway', {signal:AbortSignal.timeout(1500)});
  if (ready.ok) { console.log('Owned native social endpoint already ready; no second process started.'); process.exit(0); }
} catch {}
const config=resolve('infra/local/config/config.json');
const nativeConfig=JSON.parse(await readFile(config,'utf8'));
for(const key of ['api','cdn','gateway']){nativeConfig[key]??={};nativeConfig[key].endpointPublic=(key==='gateway'?'ws':'http')+'://127.0.0.1:3011';}
nativeConfig.general??={};nativeConfig.general.serverName='http://127.0.0.1:3011';
await writeFile(config,JSON.stringify(nativeConfig,null,2),{mode:0o600});
const output=await open(resolve(root,'spacebar.log'),'a',0o600);
const child=spawn(node,['--require',resolve('scripts/spacebar-loopback.cjs'),'dist/bundle/start.js'],{cwd:upstream,env:{...process.env,NODE_ENV:'production',PORT:'3003',WRTC_WS_PORT:'3004',THREADS:'1',DATABASE:'postgres://rooms@127.0.0.1:55432/spacebar',CONFIG_PATH:config,CONFIG_READONLY:'true'},detached:true,stdio:['ignore',output.fd,output.fd]});child.unref();
await writeFile(resolve(root,'spacebar.pid'),String(child.pid),{mode:0o600});
let ready = false;
for (let n = 0; n < 60; n++) { try { if ((await fetch('http://127.0.0.1:3003/api/v9/gateway')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 1000)); }
if (!ready) throw new Error('Native Spacebar did not become ready; inspect .local/spacebar.log.');
console.log('Native loopback PostgreSQL55432 and Spacebar3003 ready. Logs remain local.');
