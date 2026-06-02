/**
 * Per-user preferences for the media-card "style variations" popover.
 *
 * Global (not gallery- or surface-scoped): the same media card renders across
 * the gallery, viewer, pickers, recent strips, etc., and "which style
 * dimensions I sweep" is a personal default, not a property of any one panel.
 * Persisted to localStorage and owned in the stores registry; upgrading to
 * cross-device backend sync is a one-line storage swap (createBackendStorage).
 *
 * Stores only *overrides* (disabled ids + explicit order), never a full
 * snapshot of the catalog — so new categories appear by default and
 * renamed/removed ids are tolerated at read time.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

export type StyleVariationCategory = { id: string; label: string };

/**
 * Style dimensions the media-card "style variations" popover can sweep.
 * Each `id` is a block-primitive `category` whose text is appended to the
 * source prompt before re-running the generation (see
 * handleGenerateStyleVariations). Curated to *look / aesthetic* dimensions —
 * content-shaping categories (pose, anatomy, camera, wardrobe…) are
 * intentionally excluded. Add a row here to expose another sweep dimension;
 * it appears for existing users automatically (read-time merge below).
 */
export const STYLE_VARIATION_CATEGORIES: StyleVariationCategory[] = [
  { id: 'aesthetic_preset', label: 'Aesthetic' },
  { id: 'light', label: 'Lighting' },
  { id: 'color', label: 'Color' },
  { id: 'mood', label: 'Mood' },
  { id: 'rendering_technique', label: 'Rendering' },
];

const STORAGE_KEY = 'pixsim:media-card:style-variation-prefs';

interface StyleVariationPrefsState {
  /** Category ids the user turned off. Unknown ids are ignored at read time. */
  disabled: string[];
  /** Explicit display order (subset/superset tolerated; missing ids appended). */
  order: string[];
  toggle: (id: string) => void;
  move: (id: string, dir: 'up' | 'down') => void;
  reset: () => void;
}

type StyleVariationPrefs = Pick<StyleVariationPrefsState, 'disabled' | 'order'>;

/** A catalog category plus its resolved enabled state (for editors). */
export type ResolvedStyleVariationCategory = StyleVariationCategory & { enabled: boolean };

/**
 * Merge stored prefs with the current catalog: apply the user's order (ids not
 * in `order` keep catalog order, appended after), and flag disabled ids.
 * Unknown ids in the stored prefs are silently dropped.
 */
export function resolveOrderedStyleCategories(
  all: StyleVariationCategory[],
  prefs: StyleVariationPrefs,
): ResolvedStyleVariationCategory[] {
  const orderIndex = new Map(prefs.order.map((id, i) => [id, i] as const));
  const ordered = all
    .map((cat, idx) => ({ cat, idx }))
    .sort((a, b) => {
      const ai = orderIndex.has(a.cat.id) ? orderIndex.get(a.cat.id)! : Number.POSITIVE_INFINITY;
      const bi = orderIndex.has(b.cat.id) ? orderIndex.get(b.cat.id)! : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return a.idx - b.idx; // stable: un-ordered ids keep catalog order
    })
    .map(({ cat }) => cat);
  return ordered.map((cat) => ({ ...cat, enabled: !prefs.disabled.includes(cat.id) }));
}

export const useStyleVariationPrefsStore = create<StyleVariationPrefsState>()(
  persist(
    (set) => ({
      disabled: [],
      order: [],
      toggle: (id) =>
        set((s) => ({
          disabled: s.disabled.includes(id)
            ? s.disabled.filter((x) => x !== id)
            : [...s.disabled, id],
        })),
      move: (id, dir) =>
        set((s) => {
          const ids = resolveOrderedStyleCategories(STYLE_VARIATION_CATEGORIES, s).map((c) => c.id);
          const idx = ids.indexOf(id);
          const swap = dir === 'up' ? idx - 1 : idx + 1;
          if (idx < 0 || swap < 0 || swap >= ids.length) return s;
          [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
          return { order: ids };
        }),
      reset: () => set({ disabled: [], order: [] }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ disabled: s.disabled, order: s.order }),
    },
  ),
);

registerStore({ id: 'media-card-style-variation-prefs', key: STORAGE_KEY });

/**
 * Visible style categories in user order. Falls back to the full catalog if the
 * user has somehow disabled every dimension (an empty tab row is never useful).
 */
export function useVisibleStyleCategories(): StyleVariationCategory[] {
  const disabled = useStyleVariationPrefsStore((s) => s.disabled);
  const order = useStyleVariationPrefsStore((s) => s.order);
  return useMemo(() => {
    const visible = resolveOrderedStyleCategories(STYLE_VARIATION_CATEGORIES, { disabled, order })
      .filter((c) => c.enabled)
      .map(({ id, label }) => ({ id, label }));
    return visible.length > 0 ? visible : STYLE_VARIATION_CATEGORIES;
  }, [disabled, order]);
}
