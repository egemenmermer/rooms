import {describe,it,expect,vi} from 'vitest';
import {ExternalConnectors} from '../apps/services/agent/connectors';
describe('dedicated bot connector scopes',()=>{
 it('refreshes only at the fixed Google endpoint, caches across tasks, and refreshes before expiry',async()=>{
  const accounts={githubRepositories:[],driveFolderIds:['folder'],driveOAuth:{clientId:'fixture-client',clientSecret:'fixture-client-secret',refreshToken:'fixture-refresh-secret'}};
  let now=100000,refreshes=0;const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);const calls:{url:string;options:any}[]=[];
  const fetcher=async(url:string,options:any)=>{calls.push({url,options});if(url==='https://oauth2.googleapis.com/token'){refreshes++;return new Response(JSON.stringify({access_token:`fixture-access-${refreshes}`,token_type:'Bearer',expires_in:3600}));}return new Response(JSON.stringify({files:[{id:'file',name:'result.txt'}]}));};
  const make=()=>new ExternalConnectors(accounts,new Set(['drive.read']),async()=>{},undefined,fetcher);
  try{
   await expect(make().driveList('other')).rejects.toThrow('not authorized');expect(calls).toHaveLength(0);
   const results=await Promise.all([make().driveList('folder'),make().driveList('folder')]);expect(refreshes).toBe(1);expect(JSON.stringify(results)).not.toContain('fixture-access');
   const refresh=calls[0];expect(refresh.options.method).toBe('POST');expect(refresh.options.allowedHosts).toEqual(['oauth2.googleapis.com']);expect(new URLSearchParams(refresh.options.body).get('refresh_token')).toBe('fixture-refresh-secret');expect(refresh.options.headers.Authorization).toBeUndefined();
   now+=3500000;await make().driveList('folder');expect(refreshes).toBe(1);
   now+=50000;await make().driveList('folder');expect(refreshes).toBe(2);expect(calls.at(-1)!.options.headers.Authorization).toBe('Bearer fixture-access-2');
  }finally{clock.mockRestore();}
 });
 it('does not forward refresh secrets on redirects or leak provider failure bodies',async()=>{
  const accounts={githubRepositories:[],driveFolderIds:['folder'],driveOAuth:{clientId:'fixture-client',clientSecret:'private-client-secret',refreshToken:'private-refresh-secret'}};
  let calls=0;const redirected=new Response(JSON.stringify({access_token:'forbidden',token_type:'Bearer',expires_in:3600}));Object.defineProperty(redirected,'url',{value:'https://unapproved.example/token'});
  const connector=new ExternalConnectors(accounts,new Set(['drive.read']),async()=>{},undefined,async()=>{calls++;return redirected;});
  await expect(connector.driveList('folder')).rejects.toThrow('redirects are forbidden');expect(calls).toBe(1);
  const rejected=new ExternalConnectors(accounts,new Set(['drive.read']),async()=>{},undefined,async()=>new Response('private-refresh-secret',{status:400}));
  await expect(rejected.driveList('folder')).rejects.toThrow('OAuth refresh failed');
  const expired=new ExternalConnectors({githubRepositories:[],driveFolderIds:['folder'],driveToken:'fixture-old-access'},new Set(['drive.read']),async()=>{},undefined,async()=>new Response('provider-private-detail',{status:401}));
  await expect(expired.driveList('folder')).rejects.toThrow('access token expired or was revoked');
 });
 it('requires exact repositories and approvals, omits raw secret-bearing fields from public results',async()=>{
  const requests:{url:string;options:any}[]=[];let approvals=0;
  const fetcher=async(url:string,options:any)=>{requests.push({url,options});if(options?.method==='POST')return new Response(JSON.stringify({id:10,number:1,html_url:'https://github.com/bot/project/issues/1',internal:'not returned'}));return new Response(JSON.stringify({name:'readme.md',path:'readme.md',type:'file',encoding:'base64',content:'Zml4dHVyZQ==',sha:'f'.repeat(40),download_url:'https://private.invalid?token=hidden'}));};
  const connector=new ExternalConnectors({githubToken:'fixture-own-bot-key',githubRepositories:['bot/project'],driveFolderIds:[]},new Set(['github.read','github.write']),async()=>{approvals++;},undefined,fetcher);
  expect(await connector.githubRead('bot/project','readme.md')).not.toHaveProperty('download_url');
  expect(await connector.githubIssue('bot/project','Fixture','Body','a'.repeat(64))).toEqual({id:10,number:1,url:'https://github.com/bot/project/issues/1'});expect(approvals).toBe(1);
  await expect(connector.githubIssue('someone/other','Denied','Body','b'.repeat(64))).rejects.toThrow('not authorized');expect(requests).toHaveLength(2);
  expect(requests[1].options.body).toContain('rooms-operation:');
 });
 it('creates Drive metadata and content together and reconciles stable operation markers',async()=>{
  let calls=0,approvals=0;const bodies:string[]=[];
  const connector=new ExternalConnectors({githubRepositories:[],driveToken:'fixture-bot-drive',driveFolderIds:['authorized-folder']},new Set(['drive.write']),async()=>{approvals++;},undefined,async(_url,options)=>{calls++;if(!options?.method||options.method==='GET')return new Response(JSON.stringify({files:[]}));bodies.push(options.body!);return new Response(JSON.stringify({id:'new-file',name:'result.txt'}));});
  expect(await connector.driveCreate('authorized-folder','result.txt','UTF-8 generated text','c'.repeat(64))).toEqual({id:'new-file',name:'result.txt'});expect(calls).toBe(2);expect(approvals).toBe(1);expect(bodies[0]).toContain('roomsOperation');expect(bodies[0]).toContain('UTF-8 generated text');
  await expect(connector.driveCreate('not-authorized','x','x','d'.repeat(64))).rejects.toThrow('not authorized');expect(calls).toBe(2);
 });
 it('does not read a Drive file outside an explicitly configured bot folder',async()=>{
  let requests=0;const connector=new ExternalConnectors({githubRepositories:[],driveToken:'fixture-token',driveFolderIds:['folder']},new Set(['drive.read']),async()=>{},undefined,async()=>{requests++;return new Response(JSON.stringify({id:'private-file',parents:['other-folder'],mimeType:'text/plain'}));});
  await expect(connector.driveRead('folder','private-file')).rejects.toThrow('outside');expect(requests).toBe(1);
 });
});
