import {build} from 'esbuild';
for(const service of ['access','activities','agent'])await build({entryPoints:[`apps/services/${service}/start.ts`],outfile:`dist-services/${service}.cjs`,bundle:true,platform:'node',format:'cjs',target:'node22',external:['pg-native']});
