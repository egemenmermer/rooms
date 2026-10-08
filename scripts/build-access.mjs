import { build } from 'esbuild';
await build({entryPoints:['apps/services/access/start.ts'],outfile:'dist-services/access.cjs',bundle:true,platform:'node',format:'cjs',target:'node24',external:['fastify','@fastify/rate-limit','livekit-server-sdk']});
