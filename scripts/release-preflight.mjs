import {existsSync,statfsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const RELEASE_SPACE_BYTES=6*1024**3;
function existingParent(path){let current=resolve(path);while(!existsSync(current)){const parent=dirname(current);if(parent===current)throw new Error('Release output filesystem is unavailable.');current=parent;}return current;}
/** Read-only gate; run before build, signing, packaging or any install operation. */
export function checkReleaseSpace({workspace=process.cwd(),output=resolve('release')}={},inspect=path=>statfsSync(path)){
 const results=[workspace,output].map(path=>{const fs=inspect(existingParent(path));const availableBytes=Number(fs.bavail)*Number(fs.bsize);if(!Number.isFinite(availableBytes)||availableBytes<0)throw new Error('Release filesystem free space could not be determined.');return{availableBytes,requiredBytes:RELEASE_SPACE_BYTES};});
 if(results.some(item=>item.availableBytes<RELEASE_SPACE_BYTES))throw new Error('Release requires at least 6 GiB free on workspace and output filesystems. Free space before packaging; installed ROOMS and user data have not been changed.');
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify({result:'PASS',filesystems:checkReleaseSpace({output:process.env.ROOMS_RELEASE_OUTPUT??resolve('release')})}));}catch(error){console.error(error.message);process.exitCode=1;}}
