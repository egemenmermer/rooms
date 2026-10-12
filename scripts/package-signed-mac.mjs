import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Signed release packaging requires the Apple Silicon macOS host.');
const identity=process.env.ROOMS_SIGNING_IDENTITY??'Developer ID Application: Çagatay Yucelen (U95637XJ6C)';
if(!identity?.startsWith('Developer ID Application: '))throw new Error('Set ROOMS_SIGNING_IDENTITY to your own Developer ID Application identity. No automatic keychain identity selection.');
const profile=process.env.ROOMS_NOTARY_KEYCHAIN_PROFILE||process.env.APPLE_KEYCHAIN_PROFILE||'ROOMS-notary';
process.env.APPLE_TEAM_ID??='U95637XJ6C';
if(profile){
  if(profile.length>256||/[\r\n\0]/.test(profile))throw new Error('Invalid notarization Keychain profile name.');
  process.env.APPLE_KEYCHAIN_PROFILE=profile;
}else if(!process.env.APPLE_ID||!process.env.APPLE_APP_SPECIFIC_PASSWORD||!process.env.APPLE_TEAM_ID)throw new Error('Provide a notarization Keychain profile or explicit credentials; never commit secrets.');
process.env.ROOMS_SPARKLE='1';
const sparkle=spawnSync('node',['scripts/prepare-sparkle.mjs'],{stdio:'inherit',env:process.env});if(sparkle.status!==0)process.exit(sparkle.status??1);
const build=spawnSync('pnpm',['build'],{stdio:'inherit',env:process.env});if(build.status!==0)process.exit(build.status??1);
if(!process.env.ROOMS_UPDATE_FEED)process.env.ROOMS_UPDATE_FEED='https://62.238.119.134/rooms-updates/';
if(process.env.ROOMS_UPDATE_FEED){if(!process.env.APPLE_TEAM_ID)throw new Error('An explicit team ID is required for update configuration.');const url=new URL(process.env.ROOMS_UPDATE_FEED);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Use a public HTTPS update feed without credentials.');writeFileSync('dist/update-config.json',JSON.stringify({feed:url.href,teamId:process.env.APPLE_TEAM_ID}));}
const output=process.env.ROOMS_RELEASE_OUTPUT??`/tmp/rooms-signed-${process.env.ROOMS_RELEASE_VERSION??'release'}`;
const args=['exec','electron-builder','--mac','dmg','zip','--arm64',`--config.mac.identity=${identity.slice('Developer ID Application: '.length)}`,'--config.mac.notarize=false','--config.mac.hardenedRuntime=true','--config.mac.extendInfo.SUPublicEDKey=K6W7OQfKBZ3Hzm6Eu1GS5LRsax6cU174AF9IAMwM2cs=',`--config.mac.extendInfo.SUFeedURL=${process.env.ROOMS_UPDATE_FEED}appcast.xml`,'--config.mac.extendInfo.SUEnableAutomaticChecks=true','--config.mac.extendInfo.SUAutomaticallyUpdate=true','--config.mac.extendInfo.SUVerifyUpdateBeforeExtraction=true'];
if(process.env.ROOMS_UPDATE_FEED)args.push('--config.publish.provider=generic',`--config.publish.url=${process.env.ROOMS_UPDATE_FEED}`);
if(process.env.ROOMS_RELEASE_VERSION)args.push(`--config.extraMetadata.version=${process.env.ROOMS_RELEASE_VERSION}`);
args.push(`--config.directories.output=${output}`);
args.push(`--config.buildVersion=${Math.floor(Date.now()/1000)}`);
const result=spawnSync('pnpm',args,{stdio:'inherit',env:process.env});if(result.status!==0)process.exit(result.status??1);

// Notarytool is explicit because electron-builder does not consume Keychain profiles.
const {readdirSync}=await import('node:fs');
const {join}=await import('node:path');
const dmg=readdirSync(output).find(name=>name.endsWith('.dmg')&&name.includes(process.env.ROOMS_RELEASE_VERSION??''));
if(!dmg)throw new Error('No release DMG found');
const credentials=profile?['--keychain-profile',profile]:['--apple-id',process.env.APPLE_ID,'--team-id',process.env.APPLE_TEAM_ID,'--password',process.env.APPLE_APP_SPECIFIC_PASSWORD];
const submit=spawnSync('xcrun',['notarytool','submit',join(output,dmg),...credentials,'--wait','--output-format','json'],{encoding:'utf8',env:process.env});
let receipt;try{receipt=JSON.parse(submit.stdout);}catch{throw new Error('Apple notarization did not return a valid receipt');}
writeFileSync(join(output,'notarization.json'),JSON.stringify(receipt,null,2));
if(submit.status!==0||receipt.status!=='Accepted')throw new Error('Apple did not accept this release; do not publish it');
for(const target of [join(output,dmg),join(output,'mac-arm64/ROOMS.app')])for(const action of ['staple','validate']){const r=spawnSync('xcrun',['stapler',action,target],{stdio:'inherit'});if(r.status!==0)throw new Error('Apple ticket '+action+' failed');}
const gate=spawnSync('spctl',['--assess','--type','execute','--verbose=2',join(output,'mac-arm64/ROOMS.app')],{stdio:'inherit'});if(gate.status!==0)throw new Error('Gatekeeper rejected this release');
const zip=readdirSync(output).find(name=>name.endsWith('-mac.zip')&&name.includes(process.env.ROOMS_RELEASE_VERSION??''));
if(!zip)throw new Error('Release ZIP missing');
const archive=spawnSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',join(output,'mac-arm64/ROOMS.app'),join(output,zip)],{stdio:'inherit'});if(archive.status!==0)throw new Error('Stapled app archive failed');
const feedDir=join(output,'sparkle-feed');const {mkdirSync,copyFileSync}=await import('node:fs');mkdirSync(feedDir,{recursive:true});copyFileSync(join(output,zip),join(feedDir,zip));
const cast=spawnSync('.local/sparkle/bin/generate_appcast',['--account','ROOMS-Sparkle','--download-url-prefix',process.env.ROOMS_UPDATE_FEED,feedDir],{stdio:'inherit'});if(cast.status!==0)throw new Error('Signed appcast generation failed');

if(process.env.ROOMS_PUBLISH_UPDATES==='1'){const publish=spawnSync('node',['scripts/publish-sparkle.mjs'],{stdio:'inherit',env:{...process.env,ROOMS_RELEASE_OUTPUT:output}});if(publish.status!==0)throw new Error('Signed release built, but update publication failed');}
