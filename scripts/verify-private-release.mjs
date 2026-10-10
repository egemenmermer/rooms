/** Check actual private release metadata against local bytes and exact pushed source. */
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [version,sourceCommit,previous]=process.argv.slice(2);
assert(/^\d+\.\d+\.\d+$/.test(version));assert(/^[a-f0-9]{40}$/.test(sourceCommit));assert(/^\d+\.\d+\.\d+$/.test(previous));assert.notEqual(version,previous);
const api=path=>JSON.parse(execFileSync('gh',['api',`repos/egemenmermer/rooms${path?"/"+path:""}`],{encoding:'utf8',timeout:30000}));
const repository=api('');assert.equal(repository.private,true);
const release=api(`releases/tags/v${version}`);assert.equal(release.prerelease,true);assert.equal(release.draft,false);
let ref=api(`git/ref/tags/v${version}`).object;while(ref.type==='tag')ref=api(`git/tags/${ref.sha}`).object;assert.equal(ref.type,'commit');assert.equal(ref.sha,sourceCommit);
const packaged=JSON.parse(await readFile('docs/PACKAGE_TEST_RESULTS.json','utf8'));
const recovery=JSON.parse(await readFile('infra/production/NATIVE_ACTIVITY_RECOVERY_RESULTS.json','utf8'));
const blackjack=JSON.parse(await readFile('infra/production/NATIVE_BLACKJACK_ADVANCED_RESULTS.json','utf8'));
for(const evidence of [packaged,recovery,blackjack]){assert.equal(evidence.appVersion,version);assert.equal(evidence.status,'PASS');}
assert.equal(recovery.preciseActivityOutageCopy,true);assert.equal(recovery.serviceLeftStopped,false);assert.equal(recovery.ownedChannelRemoved,true);assert.equal(blackjack.ownedChannelRemoved,true);assert.equal(blackjack.cases[0].privateHandLabelCorrect,true);
const assets=[];
for(const name of [`ROOMS-${version}-arm64.dmg`,`ROOMS-${version}-arm64-mac.zip`,`RELEASE_SHA256_${version}.txt`]){
 const file=await readFile(name.startsWith('RELEASE_')?`docs/${name}`:`release/${name}`),sha256=createHash('sha256').update(file).digest('hex');
 const asset=release.assets.find(a=>a.name===name);assert(asset);assert.equal(asset.size,file.length);assert.equal(asset.digest,`sha256:${sha256}`);assets.push({name,size:file.length,sha256,uploadedDigestMatches:true});
}
const old=api(`releases/tags/v${previous}`),oldEvidence=JSON.parse(await readFile(`infra/production/RELEASE_${previous}_RESULTS.json`,'utf8'));
for(const asset of oldEvidence.assets){const remote=old.assets.find(a=>a.name===asset.name);assert(remote);assert.equal(remote.size,asset.size);assert.equal(remote.digest,asset.digest??`sha256:${asset.sha256}`);}
const result={at:new Date().toISOString(),tag:`v${version}`,url:release.html_url,sourceCommit,tagMatchesSourceCommit:true,privateRepository:true,prerelease:true,immutable:release.immutable??null,publishedAssetsPreservedByPolicy:true,previousReleaseAssetsUnchanged:true,unsigned:true,notarized:false,assets,checks:[`actual packaged launch/local video and ${packaged.bundledFileCount} bundled files match`,'two public native Activity-process recovery clients, preserved note/poll/vote and live social chat',`native Blackjack correct hand label, double/hit/split/stand and ${blackjack.cases[0].rounds.length} natural settled rounds`],limits:['whole-network interruption and six distinct native clients','physical second computer and packaged capture permissions','advanced native 101/Batak/Holdem acceptance','separate Agent and live provider accounts','Apple signing/notarization','Windows validation deferred','908-second soak and official shared YouTube apply to 0.1.4; ten-game suite and 101 draft isolation apply to 0.1.5']};
await writeFile(`infra/production/RELEASE_${version}_RESULTS.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'PASS',tag:result.tag,sourceCommit,assets:assets.length,previousReleaseAssetsUnchanged:true}));
