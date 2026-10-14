import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import net from 'node:net';
const directory=await mkdtemp(join(tmpdir(),'rooms-distribution-fixture-'));
let server;
try{
 await mkdir(join(directory,'artifacts'));
 const code='qa-fixture-invite-only-20261014',sha=value=>createHash('sha256').update(value).digest('hex');
 await writeFile(join(directory,'invites.json'),JSON.stringify({invites:{[sha(code)]:{expiresAt:new Date(Date.now()+60000).toISOString(),revoked:false}}}));
 const mac={id:'rc7-mac-fixture',version:'0.1.18-rc.7',platform:'macOS',arch:'arm64',file:'ROOMS-0.1.18-rc.7-arm64.dmg',signed:true,notarized:true,stapled:true,notes:['Local fixture, not a production signature claim'],date:new Date().toISOString(),size:4,sha256:sha('dmg!')};
 const windows={id:'rc7-windows-fixture',version:'0.1.18-rc.7',platform:'Windows',arch:'x64',file:'ROOMS-0.1.18-rc.7-windows-x64-setup.exe',signed:false,verified:true,friendPreview:true,notes:['Unsigned local fixture'],date:new Date().toISOString(),size:4,sha256:sha('exe!')};
 await writeFile(join(directory,'artifacts',mac.file),'dmg!');await writeFile(join(directory,'artifacts',windows.file),'exe!');
 await writeFile(join(directory,'releases.json'),JSON.stringify({releases:[mac,windows,{...mac,id:'bad-mac',signed:false},{...windows,id:'unverified-windows',verified:false},{...windows,id:'withdrawn-windows',withdrawn:true}]}));
 const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['apps/distribution/server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',ROOMS_DISTRIBUTION_DATA:directory,ROOMS_DISTRIBUTION_ORIGIN:origin},stdio:['ignore','pipe','inherit']});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',()=>reject(Error('Fixture service failed to start')));});
 const request=(path,options)=>fetch(origin+path,options);
 for(const path of ['/distribution/releases','/distribution/download/'+mac.id,'/distribution/download/'+windows.id])assert.equal((await request(path)).status,401);
 assert.equal((await request('/distribution/login',{method:'POST',headers:{Origin:'http://other.example','Content-Type':'application/json'},body:JSON.stringify({code})})).status,403);
 const login=await request('/distribution/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];const headers={Cookie:cookie};
 const catalog=await (await request('/distribution/releases',{headers})).json();assert.equal(catalog.releases.length,2);assert.deepEqual(catalog.releases.map(row=>row.platform),['macOS','Windows']);assert.equal(catalog.releases[1].signed,false);assert(!catalog.releases.some(row=>row.file));
 for(const [item,mime,text]of [[mac,'application/x-apple-diskimage','dmg!'],[windows,'application/vnd.microsoft.portable-executable','exe!']]){
  const head=await request('/distribution/download/'+item.id,{method:'HEAD',headers});assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),mime);assert.equal(head.headers.get('content-length'),'4');assert(head.headers.get('content-disposition').includes(item.file));
  const content=await request('/distribution/download/'+item.id,{headers});assert.equal(await content.text(),text);
  const range=await request('/distribution/download/'+item.id,{headers:{...headers,Range:'bytes=1-2'}});assert.equal(range.status,206);assert.equal(await range.text(),text.slice(1,3));
 }
 await request('/distribution/logout',{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},body:'{}'});
 assert.equal((await request('/distribution/download/'+windows.id,{headers})).status,401);
 console.log('PASS: isolated fixture verifies both platform catalogs, invite gate, trusted Mac filter, explicit unsigned Windows preview, MIME, HEAD/GET/ranges, origin and revoked-session denial; no production invites/accounts used');
}finally{
 if(server&&server.exitCode===null){const exit=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await exit;}
 assert(basename(directory).startsWith('rooms-distribution-fixture-'));assert(directory.startsWith(resolve(tmpdir())));await rm(directory,{recursive:true,force:true});
}
