import {expect,it} from 'vitest';
// @ts-expect-error Plain Node helper is also used by the packaging entrypoint.
import {checkReleaseSpace,RELEASE_SPACE_BYTES} from '../scripts/release-preflight.mjs';
it('checks both workspace and a not-yet-created output without creating directories',()=>{
 const checked:string[]=[];const inspect=(path:string)=>{checked.push(path);return{bavail:RELEASE_SPACE_BYTES,bsize:1};};
 expect(checkReleaseSpace({workspace:process.cwd(),output:`${process.cwd()}/.local/qa-output-not-created/nested`},inspect)).toHaveLength(2);expect(checked).toHaveLength(2);
});
it('fails when either filesystem is short or unknown before any packaging work',()=>{
 let count=0;expect(()=>checkReleaseSpace({},()=>({bavail:++count===1?RELEASE_SPACE_BYTES:1,bsize:1}))).toThrow('6 GiB');expect(()=>checkReleaseSpace({},()=>({bavail:NaN,bsize:1}))).toThrow('could not be determined');
});
