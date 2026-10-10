/** Bucket grouping matches unmodified Stoat v0.15.5 DeltaRatelimits.
 * Headers remain authoritative for remaining calls and window duration.
 */
export function restBucket(path:string,method:string):string{
 const [segment,resource,extra]=path.split('?')[0].split('/').slice(1);
 if(segment==='users')return method==='PATCH'?`user_edit:${resource}`:extra==='default_avatar'?'default_avatar':'users';
 if(segment==='channels'&&resource)return `${method==='POST'&&extra==='messages'?'messaging':'channels'}:${resource}`;
 if(segment==='servers'&&resource)return `servers:${resource}`;
 if(segment==='auth')return method==='DELETE'?'auth_delete':'auth';
 if(segment==='safety')return resource==='report'?'safety_report':'safety';
 return ['bots','swagger'].includes(segment)?segment:'any_dlta';
}
export function resetDelay(response:Response,body?:Record<string,unknown>):number|null{
 const header=response.headers.get('x-ratelimit-reset-after');
 const raw=header===null?body?.retry_after:header;
 if(raw===undefined||raw===null)return null;
 const value=Number(raw);return Number.isFinite(value)&&value>=0&&value<=30000?Math.max(25,Math.ceil(value)+25):null;
}
