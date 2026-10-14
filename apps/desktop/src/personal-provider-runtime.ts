import type { ProviderBridge } from '../electron/provider-contracts';

const fixtures: { bridge: ProviderBridge }[] = [];

/** Private opt-in renderer boundary; production always uses the native bridge. */
export function getPersonalProviders(): ProviderBridge | undefined {
  if (import.meta.env.DEV && fixtures.length) return fixtures[fixtures.length - 1].bridge;
  return typeof window === 'undefined' ? undefined : window.rooms?.providers;
}

export function installPersonalProviderFixture(bridge: ProviderBridge): () => void {
  if (!import.meta.env.DEV)
    throw new Error('Personal provider fixtures are unavailable in production.');
  const entry = { bridge };
  fixtures.push(entry);
  return () => {
    const index = fixtures.indexOf(entry);
    if (index !== -1) fixtures.splice(index, 1);
  };
}
