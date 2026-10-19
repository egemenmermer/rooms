import { lazy, Suspense, useEffect } from 'react';
import { registerHallBackgroundHost, useHallBackground } from './hall-background';

// The player brings hls.js and the hall styles: load them only when the corner is in use.
const HallBackgroundPlayer = lazy(() => import('./HallBackgroundPlayer'));

/**
 * The shell's slot for a hall that keeps playing after its page closed, for example while
 * the person talks in a voice room. Mounted once, in a surface that outlives page changes.
 */
export function HallBackground({ notify }: { notify(message: string): void }) {
  useEffect(() => registerHallBackgroundHost(), []);
  const hallId = useHallBackground((state) => (state.pages > 0 ? null : state.hallId));
  if (!hallId) return null;
  return (
    <Suspense fallback={null}>
      <HallBackgroundPlayer key={hallId} hallId={hallId} notify={notify} />
    </Suspense>
  );
}
