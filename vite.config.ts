import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  root: 'apps/desktop', base: './', plugins: [react()],
  resolve: { alias: {
    '@rooms/contracts': path.resolve('packages/shared-contracts/src/index.ts'),
    '@rooms/activities': path.resolve('packages/activity-sdk/src/index.ts'),
    '@rooms/design': path.resolve('packages/design-system/src/index.tsx'),
    '@rooms/spacebar': path.resolve('packages/spacebar-adapter/src/index.ts'),
    '@rooms/social':path.resolve('packages/social-domain/src/index.ts'),'@rooms/stoat':path.resolve('packages/stoat-adapter/src/index.ts'),'@rooms/activity-protocol':path.resolve('packages/activity-protocol/src/index.ts'),'@rooms/games':path.resolve('packages/games/src/index.ts'),'@rooms/media': path.resolve('packages/media-providers/src/index.ts'),
  } },
  server: { port: 5173, strictPort: true }, build: { outDir: '../../dist', emptyOutDir: true }
});
