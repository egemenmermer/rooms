import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
const referenceRoot = process.env.ROOMS_REFERENCE_ROOT || '/Users/maintainer/Downloads/ROOMS_Design_Package';
const referenceAssets = {
  name: 'rooms-development-reference-assets',
  apply: 'serve' as const,
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use('/__reference/06_handoff/examples/weekend-list.pdf', async (_req, res) => {
      try { res.setHeader('Content-Type', 'application/pdf'); res.end(await readFile(path.join(referenceRoot, '06_handoff/examples/weekend-list.pdf'))); }
      catch { res.statusCode = 404; res.end('Reference example not found'); }
    });
    server.middlewares.use('/__reference/01_brand', async (req, res, next) => {
      const filename = (req.url || '').split('?')[0].slice(1);
      if (!/^(avatar-(deniz|ece|can|zeynep|mert)|community-bizim-oda|cinema-still)\.svg$/.test(filename)) return next();
      try { res.setHeader('Content-Type', 'image/svg+xml'); res.end(await readFile(path.join(referenceRoot, '01_brand', filename))); }
      catch { res.statusCode = 404; res.end('Reference asset not found'); }
    });
  },
};
export default defineConfig({
  root: 'apps/desktop', base: './', plugins: [react(), referenceAssets],
  resolve: { alias: {
    '@rooms/contracts': path.resolve('packages/shared-contracts/src/index.ts'),
    '@rooms/activities': path.resolve('packages/activity-sdk/src/index.ts'),
    '@rooms/design': path.resolve('packages/design-system/src/index.tsx'),
    '@rooms/spacebar': path.resolve('packages/spacebar-adapter/src/index.ts'),
    '@rooms/social':path.resolve('packages/social-domain/src/index.ts'),'@rooms/stoat':path.resolve('packages/stoat-adapter/src/index.ts'),'@rooms/activity-protocol':path.resolve('packages/activity-protocol/src/index.ts'),'@rooms/games':path.resolve('packages/games/src/index.ts'),'@rooms/media': path.resolve('packages/media-providers/src/index.ts'),
  } },
  server: { port: 5173, strictPort: true }, build: { outDir: '../../dist', emptyOutDir: true }
});
