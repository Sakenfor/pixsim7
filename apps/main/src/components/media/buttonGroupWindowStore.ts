import { create } from 'zustand';

/**
 * Per-surface wheel-cycle window offset for the generation button group.
 *
 * The pill windows its buttons when it can't show them all, and the mouse wheel
 * cycles through that window. That scroll position is a property of the *surface*
 * (gallery, viewer, signal-triage, …) — not the individual card — so wheeling on
 * one card advances every card's pill on the same surface, matching how the
 * set-badge expansion is shared per surface (see {@link useSetBadgeExpansionStore}).
 *
 * Intentionally NOT persisted: a window offset is transient view state, and
 * restoring a half-scrolled window across reloads would be more surprising than
 * useful. Absent surface → undefined → each pill uses its own auto-centered
 * default until the user first wheels.
 */
interface ButtonGroupWindowState {
  /** Window offset keyed by surface id; absent = use the auto-centered default. */
  offsetBySurface: Record<string, number>;
  setOffset: (surface: string, offset: number) => void;
}

export const useButtonGroupWindowStore = create<ButtonGroupWindowState>((set) => ({
  offsetBySurface: {},
  setOffset: (surface, offset) =>
    set((s) =>
      s.offsetBySurface[surface] === offset
        ? s
        : { offsetBySurface: { ...s.offsetBySurface, [surface]: offset } },
    ),
}));

/**
 * Reactive read of one surface's window offset. Selects the value (not the map)
 * so a card only re-renders when *its* surface scrolls. Undefined until the
 * surface is first wheeled, letting the pill fall back to its auto-centered view.
 */
export const useSurfaceButtonWindowOffset = (surface: string): number | undefined =>
  useButtonGroupWindowStore((s) => s.offsetBySurface[surface]);
