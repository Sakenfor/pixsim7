import { create } from 'zustand';

/**
 * Transient portal target for the gallery chrome bar.
 *
 * The secondary-surface chrome bar (Assets.tsx) registers a DOM node here, and
 * the active surface portals compact *view* controls (e.g. Triage's Grid/Row
 * toggle, clips-per-row stepper, and batch pager) into it — so they sit in the
 * top strip alongside the layout/size controls instead of inside the surface's
 * own filter block. Not persisted: it's just a live DOM ref.
 */
interface SurfaceChromeSlotState {
  el: HTMLElement | null;
  setEl: (el: HTMLElement | null) => void;
}

export const useSurfaceChromeSlot = create<SurfaceChromeSlotState>((set) => ({
  el: null,
  setEl: (el) => set({ el }),
}));
