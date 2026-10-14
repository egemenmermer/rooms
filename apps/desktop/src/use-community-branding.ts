import { useQuery } from '@tanstack/react-query';
import { useCommunity } from './community';
import { queryClient } from './query-client';
import { communityOrigin, defaultCommunityBranding, fetchBrandingAsset, resolveCommunityBranding } from './community-branding';

export function useCommunityBranding() {
  const serverUrl = useCommunity(state => state.serverUrl);
  const origin = communityOrigin(serverUrl);
  const result = useQuery({
    queryKey: ['community-branding', origin],
    enabled: !!origin && typeof window.fetch === 'function',
    staleTime: 300_000, retry: false,
    queryFn: async ({ signal }) => {
      try {
        const blob = await fetchBrandingAsset(`${origin}/rooms-branding/manifest.json`, AbortSignal.any([signal, AbortSignal.timeout(4000)]), 8192);
        return resolveCommunityBranding(JSON.parse(await blob.text()), origin!);
      } catch { return defaultCommunityBranding; }
    },
  }, queryClient);
  return result.data ?? defaultCommunityBranding;
}
