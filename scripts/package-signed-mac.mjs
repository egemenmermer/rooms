import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Signed release packaging requires the Apple Silicon macOS host.');
const identity=process.env.ROOMS_SIGNING_IDENTITY;
if(!identity?.startsWith('Developer ID Application: '))throw new Error('Set ROOMS_SIGNING_IDENTITY to your own Developer ID Application identity. No automatic keychain identity selection.');
if(!process.env.APPLE_ID||!process.env.APPLE_APP_SPECIFIC_PASSWORD||!process.env.APPLE_TEAM_ID)throw new Error('Provide notarization credentials through environment variables; never commit them.');
const build=spawnSync('pnpm',['build'],{stdio:'inherit',env:process.env});if(build.status!==0)process.exit(build.status??1);
if(process.env.ROOMS_UPDATE_FEED){const url=new URL(process.env.ROOMS_UPDATE_FEED);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Use a public HTTPS update feed without credentials.');writeFileSync('dist/update-config.json',JSON.stringify({feed:url.href,teamId:process.env.APPLE_TEAM_ID}));}
const args=['exec','electron-builder','--mac','dmg','zip','--arm64',`--config.mac.identity=${identity}`,'--config.mac.notarize=true'];
if(process.env.ROOMS_UPDATE_FEED)args.push('--config.publish.provider=generic',`--config.publish.url=${process.env.ROOMS_UPDATE_FEED}`);
const result=spawnSync('pnpm',args,{stdio:'inherit',env:process.env});if(result.status!==0)process.exit(result.status??1);
