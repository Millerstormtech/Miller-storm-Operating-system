import { useSyncExternalStore } from "react";

/** Exactly one GuidedTour is mounted per visible view, so a single slot is
 *  enough. The Training Center swaps between its library tour and its course
 *  tour, and whichever is on screen owns this slot. */
let activeTourId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function getSnapshot(): string | null {
  return activeTourId;
}

/** Server rendering has no mounted tour, so the header renders no button and
 *  hydration stays consistent. */
function getServerSnapshot(): string | null {
  return null;
}

/** Announce that a tour is mounted. Returns the unregister function, so a
 *  caller can use it directly as a useEffect cleanup. */
export function registerTour(id: string): () => void {
  activeTourId = id;
  emit();
  return () => {
    if (activeTourId === id) {
      activeTourId = null;
      emit();
    }
  };
}

/** The id of the tour on screen, or null. Drives whether PageHeader shows "?". */
export function useActiveTourId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const restartListeners = new Set<() => void>();

/** Fired by the "?" button. No id is needed: exactly one tour is mounted, so
 *  the right one answers. */
export function requestTourRestart(): void {
  restartListeners.forEach((fn) => fn());
}

export function subscribeToRestart(fn: () => void): () => void {
  restartListeners.add(fn);
  return () => { restartListeners.delete(fn); };
}
