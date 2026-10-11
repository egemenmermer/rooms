import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const graph=JSON.parse(execFileSync('pnpm',['list','--prod','--depth','Infinity','--json'],{encoding:'utf8',maxBuffer:20_000_000}));
const packages=new Map();
function collect(node){if(node.path&&node.version)packages.set(`${node.from}@${node.version}`,node);for(const child of Object.values({...node.dependencies,...node.optionalDependencies}))collect(child);}
for(const root of graph)for(const child of Object.values({...root.dependencies,...root.optionalDependencies}))collect(child);
let output=readFileSync('docs/THIRD_PARTY_NOTICES.md','utf8')+'\n\nBundled Inter font license\n'+readFileSync('apps/desktop/public/reference-brand/fonts/OFL-Inter.txt','utf8')+'\n\nInstalled production dependency notices\n';
for(const [name,node] of [...packages].sort(([a],[b])=>a.localeCompare(b))){const metadata=JSON.parse(readFileSync(join(node.path,'package.json'),'utf8'));output+=`\n${'='.repeat(72)}\n${name}\nLicense: ${JSON.stringify(metadata.license??'See upstream')}. Source: ${JSON.stringify(metadata.repository??metadata.homepage??node.resolved)}\n`;for(const file of readdirSync(node.path).filter(name=>/^(LICENSE|LICENCE|NOTICE|COPYING|COPYRIGHT)(\.|$)/i.test(name))){try{output+=`\n${file}\n${readFileSync(join(node.path,file),'utf8')}\n`;}catch{/* Directory notices are covered by upstream source links. */}}}
writeFileSync('dist/THIRD_PARTY_NOTICES.txt',output);console.log(`Bundled notices for ${packages.size} installed production dependencies.`);
