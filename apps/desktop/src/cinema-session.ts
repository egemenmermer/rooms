import { create } from 'zustand';

/** Private native capability only; never persist or publish to Activity state. */
export interface CinemaBinding {
  roomId: string;
  itemId: string;
  referenceId: string;
  timelineEpoch: number;
  sourceVersion: string;
  title: string;
}
export interface CinemaSource {
  url: string;
  name: string;
  binding?: CinemaBinding;
}
interface CinemaSession {
  media: CinemaSource | null;
  choosing: boolean;
}
export const useCinemaSession = create<CinemaSession>(() => ({ media: null, choosing: false }));
let selectionEpoch = 0;

export function releaseCinemaSource(source: CinemaSource): void {
  // The native bridge owns file authorization and can revoke this opaque capability.
  void window.rooms?.releaseMedia?.(source.url).catch(() => {});
}

export function clearCinemaSession(): void {
  selectionEpoch++;
  const source = useCinemaSession.getState().media;
  useCinemaSession.setState({ media: null });
  if (source) releaseCinemaSource(source);
}

/** Cancellation preserves the current source; account changes invalidate late results. */
export async function chooseCinemaMedia(
  binding?: Omit<CinemaBinding, 'sourceVersion'>,
): Promise<boolean> {
  if (!window.rooms || useCinemaSession.getState().choosing) return false;
  const epoch = ++selectionEpoch;
  useCinemaSession.setState({ choosing: true });
  try {
    const source = await window.rooms.chooseMedia();
    if (!source) return false;
    if (epoch !== selectionEpoch) {
      releaseCinemaSource(source);
      return false;
    }
    const previous = useCinemaSession.getState().media;
    useCinemaSession.setState({
      media: binding
        ? { ...source, binding: { ...binding, sourceVersion: crypto.randomUUID() } }
        : source,
    });
    if (previous && previous.url !== source.url) releaseCinemaSource(previous);
    return true;
  } finally {
    useCinemaSession.setState({ choosing: false });
  }
}
