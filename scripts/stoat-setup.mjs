import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes,generateKeyPairSync,createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const pin=JSON.parse(await readFile('infra/stoat/UPSTREAM.json','utf8'));
const directory=resolve('.local/stoat');
await mkdir(directory,{recursive:true,mode:0o700});
try{await access(join(directory,'Revolt.toml'));console.log('Owned Stoat configuration already exists. It was preserved.');process.exit(0);}catch{}
const source=`https://raw.githubusercontent.com/stoatchat/self-hosted/${pin.commit}`;
const hashes={};
for(const name of ['compose.yml','Caddyfile','LICENSE','Guides.md']){const response=await fetch(`${source}/${name}`,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Could not retrieve pinned upstream ${name}`);const text=await response.text();hashes[name]=createHash('sha256').update(text).digest('hex');await writeFile(join(directory,name),text,{mode:0o600});}
const hex=()=>randomBytes(32).toString('hex');const rabbit=hex(),minio=hex();
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const jwk=pair.publicKey.export({format:'jwk'});
const publicVapid=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
const privateVapid=Buffer.from(pair.privateKey.export({format:'pem',type:'sec1'})).toString('base64').replace(/=+$/,'');
const env=[`REVOLT__RABBIT__PASSWORD=${rabbit}`,`REVOLT__FILES__S3__ACCESS_KEY_ID=roomsuploads`,`REVOLT__FILES__S3__SECRET_ACCESS_KEY=${minio}`,`REVOLT__FILES__ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,`REVOLT__PUSHD__VAPID__PRIVATE_KEY=${privateVapid}`,`REVOLT__PUSHD__VAPID__PUBLIC_KEY=${publicVapid}`].join('\n')+'\n';
await writeFile(join(directory,'secrets.env'),env,{mode:0o600});
await writeFile(join(directory,'.env'),`ROOMS_RABBIT_PASSWORD=${rabbit}\nROOMS_MINIO_PASSWORD=${minio}\nSTOAT_DOMAIN=\n`,{mode:0o600});
await writeFile(join(directory,'.env.web'),'HOSTNAME=:80\nROOMS_ACCESS_UPSTREAM=host.docker.internal:3002\nROOMS_ACTIVITY_UPSTREAM=host.docker.internal:3031\n',{mode:0o600});
await writeFile(join(directory,'stoat.json'),'{"api":"http://127.0.0.1:3021/api"}\n',{mode:0o600});
const toml=`[hosts]\napp = "http://127.0.0.1:3021"\napi = "http://127.0.0.1:3021/api"\nevents = "ws://127.0.0.1:3021/ws"\nautumn = "http://127.0.0.1:3021/autumn"\njanuary = "http://127.0.0.1:3021/january"\ngifbox = "http://127.0.0.1:3021/gifbox"\n\n[api.registration]\ninvite_only = true\n`;
await writeFile(join(directory,'Revolt.toml'),toml,{mode:0o600});
// Deployment overrides stay outside upstream application code. No global Docker/VM changes.
let compose=await readFile(join(directory,'compose.yml'),'utf8');
compose=compose.replace('name: stoat','name: rooms-stoat').replace('RABBITMQ_DEFAULT_PASS: rabbitpass','RABBITMQ_DEFAULT_PASS: ${ROOMS_RABBIT_PASSWORD}').replace('MINIO_ROOT_USER: minioautumn','MINIO_ROOT_USER: roomsuploads').replace('MINIO_ROOT_PASSWORD: minioautumn','MINIO_ROOT_PASSWORD: ${ROOMS_MINIO_PASSWORD}').replace('http://minio:9000 minioautumn minioautumn','http://minio:9000 roomsuploads ${ROOMS_MINIO_PASSWORD}').replace('      - "80:80"\n      - "443:443"','      - "127.0.0.1:3021:80"');
for(const service of ['voice-ingress','livekit','web'])compose=compose.replace(`  ${service}:\n`,`  ${service}:\n    profiles: ["upstream-native-disabled"]\n`);
compose=compose.replace(/^  database:\n/m,'  database:\n    ports: [\"127.0.0.1:3023:27017\"]\n');
compose=compose.replace(/^  api:\n/m,'  api:\n    ports: [\"127.0.0.1:3022:14702\"]\n');
compose=compose.replace('    env_file: .env.web\n    ports:','    env_file: .env.web\n    extra_hosts: ["host.docker.internal:host-gateway"]\n    ports:');
await writeFile(join(directory,'compose.yml'),compose,{mode:0o600});
let caddy=await readFile(join(directory,'Caddyfile'),'utf8');
caddy=caddy.replace('{$HOSTNAME} {','{$HOSTNAME} {\n route /rooms-access/* {\n  uri strip_prefix /rooms-access\n  reverse_proxy {$ROOMS_ACCESS_UPSTREAM}\n }\n route /rooms-activities/* {\n  uri strip_prefix /rooms-activities\n  reverse_proxy {$ROOMS_ACTIVITY_UPSTREAM}\n }');
caddy=caddy.replace('uri strip_prefix /api','uri strip_prefix /api\n\t\t@account_create path /auth/account/create /auth/account/create/*\n\t\trespond @account_create \"Use a ROOMS signup invitation.\" 403');
caddy=caddy.replace('reverse_proxy http://web:5000','respond "ROOMS Stoat social API; use the ROOMS desktop client." 200');
await writeFile(join(directory,'Caddyfile'),caddy,{mode:0o600});
await writeFile(join(directory,'SOURCE_EVIDENCE.json'),JSON.stringify({commit:pin.commit,hashes,generatedAt:new Date().toISOString(),modifiedFiles:['compose.yml','Caddyfile'],secretOutput:false},null,2)+'\n',{mode:0o600});
await writeFile(join(directory,'broker.env'),'STOAT_INTERNAL_URL=http://127.0.0.1:3022\nROOMS_ACCOUNT_INVITE_MONGO_URL=mongodb://127.0.0.1:3023/revolt\nROOMS_REGISTRATION_INVITES_FILE=.local/stoat/registration-invites.json\n',{mode:0o600});
console.log('Owned Stoat configuration created in .local/stoat. Invite-only enabled; secrets hidden. Docker startup is separate.');
