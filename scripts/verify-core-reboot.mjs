/** Owned core reboot acceptance. Never targets the existing Hoppers host. */
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const c=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
assert.equal(new URL(c.base).hostname,'62.238.119.134');
const args=['-i','/Users/egemenmermer/.ssh/id_ed25519','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=5','-o','UserKnownHostsFile=.local/ssh/known_hosts','root@62.238.119.134'];
const ssh=cmd=>execFileSync('ssh',[...args,cmd],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const request=async path=>{const r=await fetch(c.base+path,{headers:{Authorization:'Bearer '+c.owner.token,'X-Session-Token':c.owner.token},signal:AbortSignal.timeout(6000)});assert.equal(r.status,200);return r.json();};
const beforeBoot=ssh('cat /proc/sys/kernel/random/boot_id');
const beforeRoom=(await request('/rooms-activities/v1/rooms/'+c.voiceId+'/activity')).room;
await request('/api/users/@me');
// Stop/restart is intentional and covered by the owner's full deployment authorization.
try{ssh('systemctl reboot');}catch(error){if(![0,255].includes(error.status))throw error;}
let afterBoot;for(let attempt=0;attempt<60;attempt++){
 await new Promise(r=>setTimeout(r,3000));
 try{const id=ssh('cat /proc/sys/kernel/random/boot_id');if(id!==beforeBoot){afterBoot=id;break;}}catch{}
}
assert(afterBoot,'Core did not reboot within the acceptance window');
let afterRoom;for(let attempt=0;attempt<40;attempt++){
 try{await request('/api/users/@me');afterRoom=(await request('/rooms-activities/v1/rooms/'+c.voiceId+'/activity')).room;break;}catch{await new Promise(r=>setTimeout(r,3000));}
}
assert(afterRoom,'Authenticated services did not recover');
assert.deepEqual(afterRoom.polls,beforeRoom.polls);assert.deepEqual(afterRoom.whiteboard,beforeRoom.whiteboard);assert.deepEqual(afterRoom.queue,beforeRoom.queue);
let services=[];for(let attempt=0;attempt<40;attempt++){
 services=ssh('docker compose -f /opt/rooms/config/compose.yml ps --format "{{.Service}} {{.State}}"').split('\n');
 if(services.length===16&&services.every(s=>s.endsWith(' running')))break;
 await new Promise(r=>setTimeout(r,3000));
}
assert.equal(services.length,16);assert(services.every(s=>s.endsWith(' running')));
assert.equal(ssh('systemctl is-active rooms-backup.timer'),'active');assert.equal(ssh('systemctl is-active rooms-renew.timer'),'active');
const result={at:new Date().toISOString(),host:'62.238.119.134',actualReboot:true,bootIdChanged:true,authenticatedSessionSurvived:true,activityPollsWhiteboardQueuePreserved:true,runningServices:services.length,backupAndCertificateTimersActive:true,physicalMediaReconnectVerified:false};
await writeFile('infra/production/REBOOT_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
