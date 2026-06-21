import { create } from 'zustand';

/**
 * Which card currently has its long-press radial gesture menu open.
 *
 * Touch surfaces disable the desktop swipe/drag gestures (they fight native
 * scroll — see useCardGestures). The radial menu is the mobile entry point: a
 * long-press pops a cross that *shows* every mapped direction so they're
 * discoverable instead of blind-swiped. Only one card's radial may be open at a
 * time, so a single keyed id arbitrates — the matching MediaCard renders the
 * overlay and keeps the (per-card) action context local.
 *
 * Transient UI state: not persisted.
 */
interface GestureRadialState {
  openId: number | null;
  open: (id: number) => void;
  close: (id?: number) => void;
}

export const useGestureRadialStore = create<GestureRadialState>((set, get) => ({
  openId: null,
  open: (id) => set({ openId: id }),
  // Guarded close so a stale card unmounting can't clobber a newer card's menu.
  close: (id) => {
    if (id === undefined || get().openId === id) set({ openId: null });
  },
}));

/** True when `id`'s radial menu is the open one. */
export function useIsRadialOpen(id: number): boolean {
  return useGestureRadialStore((s) => s.openId === id);
}
