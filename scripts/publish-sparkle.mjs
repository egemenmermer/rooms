import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
// Explicit invocation publishes signed binary artifacts only, never source or secrets.
const output=process.env.ROOMS_RELEASE_OUTPUT??'release';
const receipt=JSON.parse(readFileSync(join(output,'notarization.json'),'utf8'));
if(receipt.status!=='Accepted')throw new Error('Only Apple Accepted releases can enter the update feed');
const ssh=['-i',`${process.env.HOME}/.ssh/id_ed25519`,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=.local/ssh/known_hosts','root@community.example.invalid'];
const remote=(command,input)=>{const result=spawnSync('ssh',[...ssh,command],{input,stdio:input?['pipe','inherit','inherit']:'inherit'});if(result.status!==0)throw new Error('Update feed publication failed');};
const directory='/opt/rooms/config/data/caddy-data/rooms-updates';remote(`mkdir -p ${directory}`);
for(const file of readdirSync(join(output,'sparkle-feed')).filter(name=>name.endsWith('.zip'))){if(!/^ROOMS-[A-Za-z0-9.-]+-arm64-mac\.zip$/.test(file))throw new Error('Unexpected archive name');remote(`cat > ${directory}/${file}.stage && mv ${directory}/${file}.stage ${directory}/${file}`,readFileSync(join(join(output,'sparkle-feed'),file)));}
// Archive lands before appcast, so clients never discover a missing file.
remote(`cat > ${directory}/appcast.xml.stage && mv ${directory}/appcast.xml.stage ${directory}/appcast.xml`,readFileSync(join(output,'sparkle-feed/appcast.xml')));
