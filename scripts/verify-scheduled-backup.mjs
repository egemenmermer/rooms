/** Observe a real timer execution and preserve only the encrypted archive off-host. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmod, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const host='root@62.238.119.134';
const options=['-i','/Users/egemenmermer/.ssh/id_ed25519','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=.local/ssh/known_hosts'];
const expected=process.env.ROOMS_BACKUP_SCHEDULE??`${new Date().toISOString().slice(0,10)}T04:30:00Z`;
assert(Number.isFinite(Date.parse(expected)));
// No private configuration, dump or log contents are returned by this observer.
const remote=`python3 - <<'PY'
import subprocess,json,hashlib
from pathlib import Path
def props(unit,fields):
 out=subprocess.check_output(['systemctl','show',unit,'--property='+','.join(fields)],text=True)
 return dict(line.split('=',1) for line in out.splitlines() if '=' in line)
service=props('rooms-backup.service',['Result','ExecMainStatus','ExecMainStartTimestamp','ExecMainExitTimestamp','ActiveState'])
timer=props('rooms-backup.timer',['ActiveState','LastTriggerUSec'])
archives=sorted(Path('/opt/rooms/backups').glob('rooms-????????T??????Z.tar.age'))
archive=None
if archives:
 p=archives[-1]
 assert p.is_file() and not p.is_symlink()
 archive={'name':p.name,'size':p.stat().st_size,'mtimeMs':p.stat().st_mtime*1000,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
running=subprocess.check_output(['docker','compose','-f','/opt/rooms/config/compose.yml','ps','--services','--status','running'],text=True).splitlines()
print(json.dumps({'service':service,'timer':timer,'archive':archive,'runningServices':sorted(running)}))
PY`;
const result={at:new Date().toISOString(),expectedTimerExecution:expected,scope:'Observed actual systemd timer, completed encrypted backup and resumed services. No manual backup invocation or restore is inferred.',...JSON.parse(execFileSync('ssh',[...options,host,remote],{encoding:'utf8',timeout:30000}))};
try{
 const start=Date.parse(result.service.ExecMainStartTimestamp),trigger=Date.parse(result.timer.LastTriggerUSec);
 if(!Number.isFinite(start)||start<Date.parse(expected)||result.service.ActiveState==='activating'){
  result.status='PENDING';
 }else{
  assert.equal(result.timer.ActiveState,'active');assert.equal(result.service.Result,'success');assert.equal(result.service.ExecMainStatus,'0');
  assert(Number.isFinite(trigger)&&Math.abs(trigger-start)<5000,'Timer trigger must match service execution');
  assert(result.archive&&result.archive.mtimeMs>=start&&result.archive.size>0,'Completed archive must belong to this execution');
  assert(/^rooms-\d{8}T\d{6}Z\.tar\.age$/.test(result.archive.name));
  for(const writer of ['access','activities','api','events','autumn','crond','pushd','minio'])assert(result.runningServices.includes(writer),`Writer ${writer} must resume`);
  const local=`.local/production/${result.archive.name}`;
  execFileSync('scp',[...options,`${host}:/opt/rooms/backups/${result.archive.name}`,local],{timeout:30000,stdio:'pipe'});
  await chmod(local,0o600);const bytes=await readFile(local);
  assert.equal(bytes.length,result.archive.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),result.archive.sha256);
  result.offHostEncryptedCopyVerified=true;result.status='PASS';
 }
}catch(error){result.status='FAIL';result.failure=error.message.slice(0,250);}
await writeFile('infra/production/SCHEDULED_BACKUP_RESULTS.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,start:result.service.ExecMainStartTimestamp,archive:result.archive?.name,offHostEncryptedCopyVerified:result.offHostEncryptedCopyVerified,failure:result.failure}));
if(result.status==='FAIL')process.exitCode=1;
