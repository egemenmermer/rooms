import { QueryClient } from '@tanstack/react-query';
/** Shared public server-state cache; secrets remain in native services. */
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30000,gcTime:5*60000,refetchOnWindowFocus:false}}});
