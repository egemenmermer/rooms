/** Check actual private release metadata against local bytes and exact pushed source. */
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [version,sourceCommit,previous,acceptance='recovery-blackjack']=process.argv.slice(2);
assert(['recovery-blackjack','whiteboard','holdem','no-demo'].includes(acceptance));
assert(/^\d+\.\d+\.\d+$/.test(version));assert(/^[a-f0-9]{40}$/.test(sourceCommit));assert(/^\d+\.\d+\.\d+$/.test(previous));assert.notEqual(version,previous);
const api=path=>JSON.parse(execFileSync('gh',['api',`repos/egemenmermer/rooms${path?"/"+path:""}`],{encoding:'utf8',timeout:30000}));
const repository=api('');assert.equal(repository.private,true);
const release=api(`releases/tags/v${version}`);assert.equal(release.prerelease,true);assert.equal(release.draft,false);
let ref=api(`git/ref/tags/v${version}`).object;while(ref.type==='tag')ref=api(`git/tags/${ref.sha}`).object;assert.equal(ref.type,'commit');assert.equal(ref.sha,sourceCommit);
const packaged=JSON.parse(await readFile('docs/PACKAGE_TEST_RESULTS.json','utf8'));
assert.equal(packaged.appVersion,version);assert.equal(packaged.status,'PASS');
const checks=[`actual packaged launch/local video and ${packaged.bundledFileCount} bundled files match`];
if(acceptance==='no-demo'){
 const actual=JSON.parse(await readFile('infra/production/NATIVE_NO_DEMO_RESULTS.json','utf8'));
 const personal=JSON.parse(await readFile('infra/production/NATIVE_PERSONAL_PLAYBACK_RESULTS.json','utf8'));
 for(const evidence of [actual,personal]){assert.equal(evidence.appVersion,version);assert.equal(evidence.status,'PASS');assert.equal(evidence.packaged,true);assert.equal(evidence.rendererErrors,0);}
 assert.equal(actual.actualDesktopClients,2);assert.equal(actual.ownedChannelRemoved,true);
 for(const required of ['two-native-real-sign-in-and-community-navigation','native-real-send-edit-delete-delivered','authenticated-cinema-has-no-sample-media','legacy-poll-navigation-opens-shared-activity','logout-clears-real-ui-without-demo-fallback'])assert(actual.cases.includes(required));
 checks.push('legacy fixtures removed preserving device preferences; eight native empty-state routes and no bundled sample movie','two public packaged accounts exchange/edit/delete messages and logout without demo fallback','actual macOS personal-file selection, scoped native media playback, pause/seek/speed');
}else if(acceptance==='holdem'){
 const game=JSON.parse(await readFile('infra/production/NATIVE_HOLDEM_FULL_RESULTS.json','utf8'));assert.equal(game.appVersion,version);assert.equal(game.status,'PASS');assert.equal(game.packaged,true);assert.equal(game.rendererErrors,0);assert.equal(game.ownedChannelRemoved,true);
 const table=game.cases[0];assert.equal(table.status,'PASS');assert.equal(table.insufficientChipsBlocked,true);assert(table.controls.includes('confirm-close'));assert(table.rounds.length>=2);assert(table.rounds[0].actions.some(a=>a.type==='call'));assert(table.rounds[0].actions.some(a=>a.type==='check'));assert(table.rounds.slice(1).some(r=>r.actions.some(a=>a.type==='raise-all-in')));
 for(const round of table.rounds){assert.equal(round.status,'PASS');assert.equal(round.totalVirtualChips,2000);assert.equal(round.pot,round.paid);assert.equal(round.nativeFinishedVisible,true);}
 checks.push('native Holdem call/check through every street, all-in showdown, hidden hands before reveal, conserved virtual chips and native matching history; insufficient-blind restart disabled with precise reason');
}else if(acceptance==='whiteboard'){
 const board=JSON.parse(await readFile('infra/production/NATIVE_WHITEBOARD_RESULTS.json','utf8'));
 assert.equal(board.appVersion,version);assert.equal(board.buildKind,'packaged');assert.equal(board.status,'PASS');assert.equal(board.rendererErrors,0);assert.equal(board.serviceLeftStopped,false);assert.equal(board.ownedChannelRemoved,true);assert.equal(board.ownedExportRemoved,true);assert.equal(board.actualDesktopClients,2);
 for(const required of ['owner-add-undo-preserves-guest-note','guest-removal-undo-restores-shared-note','undo-sequence-follows-restored-element-id','activity-recovery-preserves-unsent-note-and-undo-history','native-save-cancel','native-svg-file-contains-shared-artwork-without-identities-or-auth'])assert(board.cases.includes(required));
 checks.push('two public native whiteboard clients: per-user add/remove undo, restoration sequence, draft/history after Activity-process recovery and actual macOS SVG save/cancel');
}else{
 const recovery=JSON.parse(await readFile('infra/production/NATIVE_ACTIVITY_RECOVERY_RESULTS.json','utf8'));
 const blackjack=JSON.parse(await readFile('infra/production/NATIVE_BLACKJACK_ADVANCED_RESULTS.json','utf8'));
 for(const evidence of [recovery,blackjack]){assert.equal(evidence.appVersion,version);assert.equal(evidence.status,'PASS');}
 assert.equal(recovery.preciseActivityOutageCopy,true);assert.equal(recovery.serviceLeftStopped,false);assert.equal(recovery.ownedChannelRemoved,true);assert.equal(blackjack.ownedChannelRemoved,true);assert.equal(blackjack.cases[0].privateHandLabelCorrect,true);
 checks.push('two public native Activity-process recovery clients, preserved note/poll/vote and live social chat',`native Blackjack correct hand label, double/hit/split/stand and ${blackjack.cases[0].rounds.length} natural settled rounds`);
}
const assets=[];
for(const name of [`ROOMS-${version}-arm64.dmg`,`ROOMS-${version}-arm64-mac.zip`,`RELEASE_SHA256_${version}.txt`]){
 const file=await readFile(name.startsWith('RELEASE_')?`docs/${name}`:`release/${name}`),sha256=createHash('sha256').update(file).digest('hex');
 const asset=release.assets.find(a=>a.name===name);assert(asset);assert.equal(asset.size,file.length);assert.equal(asset.digest,`sha256:${sha256}`);assets.push({name,size:file.length,sha256,uploadedDigestMatches:true});
}
const old=api(`releases/tags/v${previous}`),oldEvidence=JSON.parse(await readFile(`infra/production/RELEASE_${previous}_RESULTS.json`,'utf8'));
for(const asset of oldEvidence.assets){const remote=old.assets.find(a=>a.name===asset.name);assert(remote);assert.equal(remote.size,asset.size);assert.equal(remote.digest,asset.digest??`sha256:${asset.sha256}`);}
const result={at:new Date().toISOString(),tag:`v${version}`,url:release.html_url,sourceCommit,tagMatchesSourceCommit:true,privateRepository:true,prerelease:true,immutable:release.immutable??null,publishedAssetsPreservedByPolicy:true,previousReleaseAssetsUnchanged:true,unsigned:true,notarized:false,assets,checks,limits:['whole-network interruption and six distinct native clients','physical second computer and packaged capture permissions','advanced native 101 acceptance, multi-player poker rules and physical friends games','separate Agent and live provider accounts','Apple signing/notarization','Windows validation deferred','908-second soak and official shared YouTube apply to 0.1.4; ten-game suite and 101 draft isolation apply to 0.1.5; complete Batak hands, Blackjack and poll recovery apply to 0.1.6; whiteboard save/undo and canvas controls/layout apply to 0.1.7']};
await writeFile(`infra/production/RELEASE_${version}_RESULTS.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'PASS',tag:result.tag,sourceCommit,assets:assets.length,previousReleaseAssetsUnchanged:true}));
