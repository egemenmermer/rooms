import {mkdir,open,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {StoatError} from '@rooms/stoat';
const invitation=z.object({accountInviteCode:z.string().min(2).max(128),communityInviteCode:z.string().min(2).max(128),expiresAt:z.string().datetime(),createdAt:z.string().datetime(),state:z.enum(['available','claiming','used','failed']),claim:z.string().optional()}).strict();
const schema=z.object({version:z.literal(1),invites:z.record(z.string().regex(/^[a-f0-9]{64}$/),invitation)}).strict();
export type RegistrationLedger=z.infer<typeof schema>;
export const inviteDigest=(code:string)=>createHash('sha256').update(code).digest('hex');
/** Owned durable gate; upstream account creation remains unmodified. One service instance per ledger. */
export class RegistrationGate {
 constructor(readonly path:string){}
 private async persist(ledger:RegistrationLedger){const temp=`${this.path}.${randomUUID()}.tmp`;const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(ledger)+'\n');await file.sync();}finally{await file.close();}await rename(temp,this.path);const directory=await open(dirname(this.path),'r');try{await directory.sync();}finally{await directory.close();}}
 async inspect(code:string){
  let ledger:RegistrationLedger;try{ledger=schema.parse(JSON.parse(await readFile(this.path,'utf8')));}catch{throw new StoatError(403,'INVITE_UNAVAILABLE');}
  const item=ledger.invites[inviteDigest(code)];if(!item||Date.parse(item.expiresAt)<=Date.now())throw new StoatError(404,'INVITE_EXPIRED');if(item.state!=='available')throw new StoatError(409,'INVITE_ALREADY_CLAIMED');return {communityInviteCode:item.communityInviteCode,expiresAt:item.expiresAt};
 }
 async consume<T>(code:string,register:(invitation:{accountInviteCode:string;communityInviteCode:string})=>Promise<T>):Promise<T>{
  await mkdir(dirname(this.path),{recursive:true,mode:0o700});
  let lock;try{lock=await open(`${this.path}.lock`,'wx',0o600);}catch{throw new StoatError(409,'REGISTRATION_BUSY');}
  try{
   let ledger:RegistrationLedger;try{ledger=schema.parse(JSON.parse(await readFile(this.path,'utf8')));}catch{throw new StoatError(403,'INVITE_UNAVAILABLE');}
   const item=ledger.invites[inviteDigest(code)];
   if(!item||Date.parse(item.expiresAt)<=Date.now())throw new StoatError(404,'INVITE_EXPIRED');
   if(item.state!=='available')throw new StoatError(409,'INVITE_ALREADY_CLAIMED');
   item.state='claiming';item.claim=randomUUID();await this.persist(ledger);
   // Persist intent before any external action. Crashes and uncertain HTTP outcomes never make a ticket reusable.
   try{const value=await register(item);item.state='used';await this.persist(ledger);return value;}
   catch(error){item.state='failed';await this.persist(ledger);throw error;}
  }finally{await lock.close();await unlink(`${this.path}.lock`).catch(()=>{});}
 }
}

/** Provision through a delegated account_invites-only Mongo connection; never expose it to clients. */
export async function issueRegistrationInvite(path:string,accountInviteCode:string,communityInviteCode:string,seconds=86400){
 if(!Number.isInteger(seconds)||seconds<60||seconds>604800)throw new StoatError(400,'INVALID_INVITE_EXPIRY');
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 let lock;try{lock=await open(`${path}.lock`,'wx',0o600);}catch{throw new StoatError(409,'REGISTRATION_BUSY');}
 try{
  let ledger:RegistrationLedger;try{ledger=schema.parse(JSON.parse(await readFile(path,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new StoatError(503,'REGISTRATION_LEDGER_INVALID');ledger={version:1,invites:{}};}
  const code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');const expiresAt=new Date(Date.now()+seconds*1000).toISOString();
  ledger.invites[inviteDigest(code)]={accountInviteCode,communityInviteCode,expiresAt,createdAt:new Date().toISOString(),state:'available'};
  const temp=`${path}.${randomUUID()}.tmp`;const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(ledger)+'\n');await file.sync();}finally{await file.close();}await rename(temp,path);const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
  return {code,expiresAt};
 }finally{await lock.close();await unlink(`${path}.lock`).catch(()=>{});}
}
