import { create } from 'zustand';

export interface GestureSecondaryState {
  /** Available duration values in seconds (e.g., [5, 8]) */
  options: number[];
  /** Currently selected duration */
  current: number;
  /** Pixel distance per step (default 40) */
  stepPixels: number;
  /** Unit label for overlay display */
  unit: string;
  // Actions
  setDurationOptions: (options: number[], current: number) => void;
  clear: () => void;
}

export const useGestureSecondaryStore = create<GestureSecondaryState>((set) => ({
  options: [],
  current: 0,
  stepPixels: 40,
  unit: 's',
  setDurationOptions: (options, current) => set({ options, current }),
  clear: () => set({ options: [], current: 0 }),
}));

/**
 * Map a vertical pixel offset to a duration value from the options array.
 *
 * - dy = 0 -> current value (center)
 * - Moving **up** (negative dy) -> lower index (shorter duration)
 * - Moving **down** (positive dy) -> higher index (longer duration)
 * - Snaps to nearest option, clamped to bounds
 */
export function resolveDurationFromDy(
  dy: number,
  state: Pick<GestureSecondaryState, 'options' | 'current' | 'stepPixels'>,
): number {
  const { options, current, stepPixels } = state;
  if (options.length === 0) return current;

  const currentIndex = options.indexOf(current);
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;

  // Positive dy = pointer moved down = higher duration (higher index)
  const steps = Math.round(dy / stepPixels);
  const targetIndex = Math.max(0, Math.min(options.length - 1, baseIndex + steps));
  return options[targetIndex];
}
