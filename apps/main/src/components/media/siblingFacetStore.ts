/**
 * siblingFacetStore
 *
 * The user's saved "similarity lenses" behind the media-card similarity badges.
 * Each lens is a combination of three facets — Inputs, Prompt, Seed — and the
 * media card renders one badge per lens (up to {@link MAX_LENSES}), each showing
 * the count of assets matching that combo. The 7-way cohort-counts map loads
 * lazily per asset into `siblingCountsStore` (on hover), so once present any
 * number of lenses is free data-wise.
 *
 * Fully user-configurable inline on the card: hover a badge to toggle its
 * facets or remove it; a "+" handle adds a new lens. The list is a single
 * shared, backend-synced preference, so edits apply to every card at once.
 *
 * Ships two default lenses — "Prompt" (broad cohort) and "Reproductions"
 * (Inputs+Prompt+Seed, near-duplicate re-rolls). Persisted via
 * {@link createBackendStorage} (localStorage key `siblingFacets_local`,
 * user-pref key `siblingFacets`). See plan `media-card-sibling-badges` and
 * `stores-registry-canon`.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';
import { createBackendStorage } from '@lib/utils/storage';
import { exposeStoreForDebugging, manuallyRehydrateStore } from '@lib/utils/zustandPersist';

/** Real localStorage key written by createBackendStorage('siblingFacets'). */
export const SIBLING_FACET_LOCAL_KEY = 'siblingFacets_local';

/** Max badges in the top-left stack — keeps it glanceable, not noisy. */
export const MAX_LENSES = 3;

export interface SiblingFacets {
  inputs: boolean;
  prompt: boolean;
  seed: boolean;
}

/** A saved, user-named-by-its-facets similarity lens → one badge. */
export interface SiblingLens {
  id: string;
  facets: SiblingFacets;
}

const DEFAULT_LENSES: SiblingLens[] = [
  { id: 'prompt', facets: { inputs: false, prompt: true, seed: false } },
  { id: 'reproductions', facets: { inputs: true, prompt: true, seed: true } },
];

/** Facets a freshly-added lens starts with (inputs + prompt; user tweaks it). */
const NEW_LENS_FACETS: SiblingFacets = { inputs: true, prompt: true, seed: false };

function newLensId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // crypto.randomUUID is unavailable in some non-secure contexts; the index
    // keeps ids distinct within a session (persistence re-reads them anyway).
    return `lens-${Date.now()}`;
  }
}

/**
 * Cohort-map key for a facet selection, letters in canonical i<p<s order to
 * match the backend `cohort_counts` keys. Empty string when no facet is lit.
 */
export function facetComboKey(facets: SiblingFacets): string {
  return [facets.inputs && 'i', facets.prompt && 'p', facets.seed && 's']
    .filter(Boolean)
    .join('');
}

interface SiblingFacetStoreState {
  lenses: SiblingLens[];
  addLens: (facets?: SiblingFacets) => void;
  removeLens: (id: string) => void;
  toggleLensFacet: (id: string, facet: keyof SiblingFacets) => void;
}

export const useSiblingFacetStore = create<SiblingFacetStoreState>()(
  persist(
    (set) => ({
      lenses: DEFAULT_LENSES,
      addLens: (facets = NEW_LENS_FACETS) =>
        set((state) =>
          state.lenses.length >= MAX_LENSES
            ? state
            : { lenses: [...state.lenses, { id: newLensId(), facets: { ...facets } }] },
        ),
      removeLens: (id) =>
        set((state) => ({ lenses: state.lenses.filter((l) => l.id !== id) })),
      toggleLensFacet: (id, facet) =>
        set((state) => ({
          lenses: state.lenses.map((l) =>
            l.id === id ? { ...l, facets: { ...l.facets, [facet]: !l.facets[facet] } } : l,
          ),
        })),
    }),
    {
      name: 'sibling_facets_v2',
      storage: createJSONStorage(() => createBackendStorage('siblingFacets')),
      partialize: (state) => ({ lenses: state.lenses }),
      version: 2,
      // v1 stored a single `{ facets }` lens; reset to the default list.
      migrate: (persisted) => {
        if (
          persisted &&
          typeof persisted === 'object' &&
          Array.isArray((persisted as { lenses?: unknown }).lenses)
        ) {
          return persisted as { lenses: SiblingLens[] };
        }
        return { lenses: DEFAULT_LENSES };
      },
    },
  ),
);

registerStore({ id: 'media-card:sibling-facets', key: SIBLING_FACET_LOCAL_KEY });

if (typeof window !== 'undefined') {
  exposeStoreForDebugging(useSiblingFacetStore, 'siblingFacets');
  setTimeout(() => {
    manuallyRehydrateStore(useSiblingFacetStore, SIBLING_FACET_LOCAL_KEY, 'SiblingFacets');
  }, 50);
}
