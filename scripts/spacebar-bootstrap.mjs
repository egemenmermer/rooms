// Creates local integration accounts only. Credentials are saved mode0600, never logged.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const base = process.env.SPACEBAR_URL ?? 'http://127.0.0.1:3003';
const configPath = new URL('../infra/local/config/config.json', import.meta.url);
const fixturePath = new URL('../infra/local/test-accounts.json', import.meta.url);
const restart = async () => {
  if (process.env.SPACEBAR_NATIVE === '1') {
    const pid = Number(await readFile('.local/spacebar.pid', 'utf8'));
    if (Number.isInteger(pid) && pid > 1) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    await new Promise(r => setTimeout(r, 1500));
    execFileSync(process.execPath, ['scripts/spacebar-native.mjs'], {stdio:'ignore'});
  } else execFileSync('docker', [...compose, 'restart', 'spacebar'], {stdio:'ignore'});
};
const compose = ['compose', '--env-file', 'infra/local/.env', '-f', 'infra/docker-compose.yml'];
const wait = async () => { for (let n = 0; n < 60; n++) { try { if ((await fetch(base + '/api/v9/gateway')).ok) return; } catch {} await new Promise(r => setTimeout(r, 1000)); } throw new Error('Spacebar startup timed out'); };
const api = async (path, method = 'GET', body, token) => { const r = await fetch(base + '/api/v9' + path, {method, headers: {'Content-Type':'application/json', ...(token ? {Authorization:token} : {})}, ...(body ? {body:JSON.stringify(body)} : {})}); if (!r.ok) { const data = await r.json().catch(()=>({})); throw new Error(`Spacebar ${method} ${path} failed ${r.status}: ${String(data.code ?? 'REQUEST_FAILED')}`); } return r.status === 204 ? null : r.json(); };
let existing; try { existing = JSON.parse(await readFile(fixturePath, 'utf8')); } catch {}
if (existing) { console.log('Existing local test accounts retained.'); process.exit(0); }
const config = JSON.parse(await readFile(configPath, 'utf8'));
try {
  // Bootstrap exception is loopback-only and reverted even on failure.
  config.register.requireInvite = false;
  await writeFile(configPath, JSON.stringify(config,null,2), {mode:0o600});
  await restart();
  await wait();
  const owner = {email:`owner-${randomBytes(4).toString('hex')}@rooms.local`, password:randomBytes(24).toString('base64url'), username:'RoomsHost'};
  const auth = await api('/auth/register','POST',{...owner,consent:true});
  const profile = await api('/users/@me','GET',undefined,auth.token);
  const guild = await api('/guilds','POST',{name:'Evening Club'},auth.token);
  const text = await api(`/guilds/${guild.id}/channels`,'POST',{name:'tonight',type:0},auth.token);
  const voice = await api(`/guilds/${guild.id}/channels`,'POST',{name:'Lounge',type:2},auth.token);
  const invitation = await api(`/channels/${text.id}/invites`,'POST',{max_age:86400,max_uses:0,temporary:false},auth.token);
  await writeFile(fixturePath, JSON.stringify({base,owner:{...owner,id:profile.id,token:auth.token},guildId:guild.id,textId:text.id,voiceId:voice.id,inviteCode:invitation.code},null,2), {mode:0o600});
  console.log('Owner, private space, text and voice rooms created. Local fixture stored privately.');
} finally {
  config.register.requireInvite = true;
  await writeFile(configPath, JSON.stringify(config,null,2), {mode:0o600});
  await restart();
  await wait();
  console.log('Invite-only registration restored.');
}
const fixture = JSON.parse(await readFile(fixturePath,'utf8'));
const guest = {email:`friend-${randomBytes(4).toString('hex')}@rooms.local`,password:randomBytes(24).toString('base64url'),username:'RoomsFriend'};
const auth = await api('/auth/register','POST',{...guest,invite:fixture.inviteCode,consent:true});
const profile = await api('/users/@me','GET',undefined,auth.token);
fixture.guest = {...guest,id:profile.id,token:auth.token};
await writeFile(fixturePath,JSON.stringify(fixture,null,2),{mode:0o600});
console.log('Second distinct invited account created. No credentials logged.');
