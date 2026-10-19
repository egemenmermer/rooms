import { create } from 'zustand';
import { useCommunity } from '../community';

/**
 * Who shows the hall. Its page owns the screen while it is mounted (Settings keeps the page
 * mounted underneath). When the page closes while something plays and this person has a seat,
 * a corner player in the app shell keeps it going on the same seat, so joining a voice room
 * never stops the film. Without a shell host the page gives up the seat, as before.
 */
interface HallBackgroundState {
  /** Hall pages mounted now. */
  pages: number;
  /** Shell surfaces that can show the corner player. */
  hosts: number;
  /** The hall playing in the corner, or null. */
  hallId: string | null;
}

export const useHallBackground = create<HallBackgroundState>(() => ({
  pages: 0,
  hosts: 0,
  hallId: null,
}));

/** The hall page mounted: it takes the screen, and the seat, back from the corner. */
export function hallPageOpened() {
  useHallBackground.setState((state) => ({ pages: state.pages + 1, hallId: null }));
}

/**
 * The hall page unmounted. True when the corner player keeps `hallId` going on the same seat;
 * false when the page should leave the seat.
 */
export function hallPageClosed(hallId: string, watching: boolean) {
  const state = useHallBackground.getState();
  const pages = Math.max(0, state.pages - 1);
  const keep = watching && pages === 0 && state.hosts > 0 && !!useCommunity.getState().user;
  useHallBackground.setState({ pages, hallId: keep ? hallId : null });
  return keep;
}

/** A shell surface that can show the corner player; returns its unregister. */
export function registerHallBackgroundHost() {
  useHallBackground.setState((state) => ({ hosts: state.hosts + 1 }));
  return () => useHallBackground.setState((state) => ({ hosts: Math.max(0, state.hosts - 1) }));
}

/** Stops the corner player: the person closed it, or there is nothing left to watch. */
export function stopHallBackground() {
  useHallBackground.setState({ hallId: null });
}

// Another account or server never inherits a seat in this hall.
useCommunity.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.serverUrl !== previous.serverUrl)
    stopHallBackground();
});
