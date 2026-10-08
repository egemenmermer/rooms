import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const [userId,rooms]=process.argv.slice(2);const path=process.env.ROOMS_AGENT_AUTH_FILE;
if(process.platform!=='linux'||!path||!/^[-\w]{1,128}$/.test(userId??'')||!rooms?.split(',').every(r=>/^[-\w]{1,128}$/.test(r)))throw new Error('Run on the separate Linux agent host with ROOMS_AGENT_AUTH_FILE: node scripts/agent-issue-access.mjs STOAT_USER_ID ROOM_IDS_COMMA_SEPARATED');
let grants=[];try{grants=JSON.parse(readFileSync(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const token=randomBytes(32).toString('base64url');const grant={userId,roomIds:rooms.split(','),canManage:true,enabled:true,tokenSha256:createHash('sha256').update(token).digest('hex')};grants=grants.filter(g=>g.userId!==userId);grants.push(grant);mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path+'.tmp',JSON.stringify(grants,null,2),{mode:0o600});renameSync(path+'.tmp',path);const delivery=resolve(dirname(path),`delivery-${userId}.json`);writeFileSync(delivery,JSON.stringify({userId,token,roomIds:grant.roomIds}),{mode:0o600});console.log('Access issued. Deliver the private delivery file through your secure channel; token is not printed.');console.log(delivery);
