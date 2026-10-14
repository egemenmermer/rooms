import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// TypeScript is the single source for repository-local module aliases.
const config = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'));
export const roomsAliases: Record<string, string> = Object.fromEntries(
  Object.entries(config.compilerOptions.paths as Record<string, string[]>).map(([name, paths]) => [
    name,
    resolve(paths[0]),
  ]),
);
