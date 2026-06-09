/**
 * Per-user preferences for the media-card generation button group.
 *
 * Global (not gallery- or surface-scoped): the same media card renders across
 * the gallery, viewer, pickers, recent strips, etc., so "which buttons / which
 * style dimensions I want, and in what order" is a personal default, not a
 * property of any one panel. Persisted to localStorage and owned in the stores
 * registry; cross-device backend sync is a one-line storage swap later
 * (createBackendStorage).
 *
 * Two slices, same shape:
 *   - style*  — which `STYLE_VARIATION_CATEGORIES` tabs show in the popover
 *   - action* — which button-group pills show, and their order
 *
 * Both store only *overrides* (hidden ids + explicit order), never a full
 * snapshot — so new entries appear by default and renamed/removed ids are
 * tolerated at read time. Action prefs compose ON TOP of context gating: they
 * can only hide/reorder pills that the card's context already made available.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

import type { GenerationActionId } from './useGenerationButtonGroup';

// ─────────────────────────────────────────────────────────────────────────────
// Catalogs
// ─────────────────────────────────────────────────────────────────────────────

export type StyleVariationCategory = { id: string; label: string };

/**
 * Style dimensions the media-card "style variations" popover can sweep.
 * Each `id` is a block-primitive `category` whose text is appended to the
 * source prompt before re-running the generation (see
 * handleGenerateStyleVariations). Curated to *look / aesthetic* dimensions —
 * content-shaping categories (pose, anatomy, camera, wardrobe…) are
 * intentionally excluded. Add a row to expose another sweep dimension; it
 * appears for existing users automatically (read-time merge below).
 */
export const STYLE_VARIATION_CATEGORIES: StyleVariationCategory[] = [
  { id: 'aesthetic_preset', label: 'Aesthetic' },
  { id: 'light', label: 'Lighting' },
  { id: 'color', label: 'Color' },
  { id: 'mood', label: 'Mood' },
  { id: 'rendering_technique', label: 'Rendering' },
];

export type GenerationActionDescriptor = { id: GenerationActionId; label: string };

/**
 * The customizable button-group pills, in their default order (matches the
 * order they are pushed in useGenerationButtonGroup). Context still gates
 * availability per card — these labels/order only drive the settings UI and
 * the user's hide/reorder overrides.
 */
export const GENERATION_ACTION_CATALOG: GenerationActionDescriptor[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'smart-action', label: 'Add to generation' },
  { id: 'quick-generate', label: 'Quick generate' },
  { id: 'extend-video', label: 'Extend video' },
  { id: 'regenerate', label: 'Regenerate' },
  { id: 'style-variations', label: 'Style variations' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Merge helpers (shared by both slices)
// ─────────────────────────────────────────────────────────────────────────────

export type Resolved<T> = T & { enabled: boolean };

/**
 * Merge a catalog with stored prefs: apply the user's order (ids not in
 * `order` keep catalog order, appended after) and flag hidden ids. Keeps hidden
 * entries in the list (for editors); unknown stored ids are dropped.
 */
export function resolveOrdered<T extends { id: string }>(
  all: T[],
  hidden: string[],
  order: string[],
): Resolved<T>[] {
  const orderIndex = new Map(order.map((id, i) => [id, i] as const));
  return all
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const ai = orderIndex.has(a.item.id) ? orderIndex.get(a.item.id)! : Number.POSITIVE_INFINITY;
      const bi = orderIndex.has(b.item.id) ? orderIndex.get(b.item.id)! : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return a.idx - b.idx; // stable: un-ordered ids keep catalog order
    })
    .map(({ item }) => ({ ...item, enabled: !hidden.includes(item.id) }));
}

/** Filter out hidden ids and apply the user's order. Used for live rendering. */
export function applyOrder<T extends { id: string }>(items: T[], hidden: string[], order: string[]): T[] {
  const hiddenSet = new Set(hidden);
  const orderIndex = new Map(order.map((id, i) => [id, i] as const));
  return items
    .filter((it) => !hiddenSet.has(it.id))
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => {
      const ai = orderIndex.has(a.it.id) ? orderIndex.get(a.it.id)! : Number.POSITIVE_INFINITY;
      const bi = orderIndex.has(b.it.id) ? orderIndex.get(b.it.id)! : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return a.idx - b.idx;
    })
    .map(({ it }) => it);
}

/** Swap an id with its neighbor in the resolved display order; null if no-op. */
function reorder<T extends { id: string }>(
  all: T[],
  hidden: string[],
  order: string[],
  id: string,
  dir: 'up' | 'down',
): string[] | null {
  const ids = resolveOrdered(all, hidden, order).map((c) => c.id);
  const idx = ids.indexOf(id);
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= ids.length) return null;
  [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
  return ids;
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pixsim:media-card:generation-button-prefs';

interface GenerationButtonPrefsState {
  styleHidden: string[];
  styleOrder: string[];
  actionHidden: string[];
  actionOrder: string[];
  toggleStyle: (id: string) => void;
  moveStyle: (id: string, dir: 'up' | 'down') => void;
  resetStyle: () => void;
  toggleAction: (id: string) => void;
  moveAction: (id: string, dir: 'up' | 'down') => void;
  resetAction: () => void;
}

export const useGenerationButtonPrefsStore = create<GenerationButtonPrefsState>()(
  persist(
    (set) => ({
      styleHidden: [],
      styleOrder: [],
      actionHidden: [],
      actionOrder: [],
      toggleStyle: (id) => set((s) => ({ styleHidden: toggleId(s.styleHidden, id) })),
      moveStyle: (id, dir) =>
        set((s) => {
          const next = reorder(STYLE_VARIATION_CATEGORIES, s.styleHidden, s.styleOrder, id, dir);
          return next ? { styleOrder: next } : s;
        }),
      resetStyle: () => set({ styleHidden: [], styleOrder: [] }),
      toggleAction: (id) => set((s) => ({ actionHidden: toggleId(s.actionHidden, id) })),
      moveAction: (id, dir) =>
        set((s) => {
          const next = reorder(GENERATION_ACTION_CATALOG, s.actionHidden, s.actionOrder, id, dir);
          return next ? { actionOrder: next } : s;
        }),
      resetAction: () => set({ actionHidden: [], actionOrder: [] }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        styleHidden: s.styleHidden,
        styleOrder: s.styleOrder,
        actionHidden: s.actionHidden,
        actionOrder: s.actionOrder,
      }),
    },
  ),
);

registerStore({ id: 'media-card-generation-button-prefs', key: STORAGE_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Read hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Visible style dimensions in user order. Falls back to the full catalog if the
 * user has somehow hidden every dimension (an empty tab row is never useful).
 */
export function useVisibleStyleCategories(): StyleVariationCategory[] {
  const hidden = useGenerationButtonPrefsStore((s) => s.styleHidden);
  const order = useGenerationButtonPrefsStore((s) => s.styleOrder);
  return useMemo(() => {
    const visible = applyOrder(STYLE_VARIATION_CATEGORIES, hidden, order);
    return visible.length > 0 ? visible : STYLE_VARIATION_CATEGORIES;
  }, [hidden, order]);
}

/** User overrides for the button-group pills, applied via `applyOrder`. */
export function useGenerationActionPrefs(): { hidden: string[]; order: string[] } {
  const hidden = useGenerationButtonPrefsStore((s) => s.actionHidden);
  const order = useGenerationButtonPrefsStore((s) => s.actionOrder);
  return useMemo(() => ({ hidden, order }), [hidden, order]);
}
