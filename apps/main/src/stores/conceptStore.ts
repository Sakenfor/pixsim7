/**
 * Concept Store
 *
 * Zustand store for unified concepts across all kinds
 * (role, part, body_region, pose, influence_region).
 *
 * This provides the single source of truth for concept data at runtime,
 * replacing build-time generated constants with dynamic API data.
 */
import { create } from 'zustand';
import type { ConceptResponse, ConceptKind } from '@lib/api/concepts';
import { getConcepts } from '@lib/api/concepts';

// ============================================================================
// Types
// ============================================================================

/**
 * Label suggestion for autocomplete dropdowns.
 * Combines concepts from multiple kinds into a unified format.
 */
export interface LabelSuggestion {
  /** Label ID (used as value) */
  id: string;
  /** Human-readable display label */
  label: string;
  /** Category for grouping in UI */
  group: string;
}

interface ConceptState {
  // Data by kind (plain objects for immutability)
  conceptsByKind: Record<string, ConceptResponse[]>;
  priorityByKind: Record<string, string[]>;
  groupNameByKind: Record<string, string>;

  // Loading state
  loadedKinds: string[];
  loadingKinds: string[];
  error: string | null;

  // Actions
  fetchKind: (kind: ConceptKind | string) => Promise<void>;
  fetchKinds: (kinds: (ConceptKind | string)[]) => Promise<void>;
  fetchAllLabelKinds: () => Promise<void>;

  // Selectors
  getByKind: (kind: string) => ConceptResponse[];
  getById: (kind: string, id: string) => ConceptResponse | undefined;
  getPriority: (kind: string) => string[];
  getGroupName: (kind: string) => string;

  // Derived: labels for autocomplete (combines multiple kinds)
  getLabelsForAutocomplete: () => LabelSuggestion[];

  // Status
  isKindLoaded: (kind: string) => boolean;
  isKindLoading: (kind: string) => boolean;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useConceptStore = create<ConceptState>((set, get) => ({
  // Initial state
  conceptsByKind: {},
  priorityByKind: {},
  groupNameByKind: {},
  loadedKinds: [],
  loadingKinds: [],
  error: null,

  /**
   * Fetch concepts of a specific kind from the API.
   */
  fetchKind: async (kind) => {
    const state = get();

    // Skip if already loaded or loading
    if (state.loadedKinds.includes(kind) || state.loadingKinds.includes(kind)) {
      return;
    }

    // Mark as loading (immutable update)
    set((s) => ({
      loadingKinds: [...s.loadingKinds, kind],
      error: null,
    }));

    try {
      const response = await getConcepts(kind);

      // Immutable update with new data
      set((s) => ({
        conceptsByKind: { ...s.conceptsByKind, [kind]: response.concepts },
        priorityByKind: { ...s.priorityByKind, [kind]: response.priority },
        groupNameByKind: { ...s.groupNameByKind, [kind]: response.group_name },
        loadedKinds: [...s.loadedKinds, kind],
        loadingKinds: s.loadingKinds.filter((k) => k !== kind),
      }));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch concepts';
      set((s) => ({
        error: errorMessage,
        loadingKinds: s.loadingKinds.filter((k) => k !== kind),
      }));
    }
  },

  /**
   * Fetch multiple kinds in parallel.
   */
  fetchKinds: async (kinds) => {
    await Promise.all(kinds.map((kind) => get().fetchKind(kind)));
  },

  /**
   * Fetch all kinds needed for label autocomplete.
   */
  fetchAllLabelKinds: async () => {
    const labelKinds: ConceptKind[] = ['influence_region', 'role', 'part', 'body_region', 'pose'];
    await get().fetchKinds(labelKinds);
  },

  // Selectors
  getByKind: (kind) => get().conceptsByKind[kind] ?? [],

  getById: (kind, id) => {
    const concepts = get().conceptsByKind[kind] ?? [];
    return concepts.find((c) => c.id === id);
  },

  getPriority: (kind) => get().priorityByKind[kind] ?? [],

  getGroupName: (kind) => get().groupNameByKind[kind] ?? kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),

  /**
   * Get labels for autocomplete, combining multiple concept kinds.
   * Order: influence_region (builtins), role, part, body_region, pose
   */
  getLabelsForAutocomplete: () => {
    const state = get();
    const kinds: ConceptKind[] = ['influence_region', 'role', 'part', 'body_region', 'pose'];

    return kinds.flatMap((kind) =>
      (state.conceptsByKind[kind] ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        group: c.group || state.groupNameByKind[kind] || kind,
      }))
    );
  },

  // Status helpers
  isKindLoaded: (kind) => get().loadedKinds.includes(kind),
  isKindLoading: (kind) => get().loadingKinds.includes(kind),
}));

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook to get concepts of a specific kind, auto-fetching if not loaded.
 */
export function useConceptsOfKind(kind: ConceptKind | string): {
  concepts: ConceptResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const store = useConceptStore();
  const concepts = store.getByKind(kind);
  const isLoading = store.isKindLoading(kind);
  const error = store.error;

  // Auto-fetch if not loaded
  if (!store.isKindLoaded(kind) && !isLoading) {
    store.fetchKind(kind);
  }

  return { concepts, isLoading, error };
}

/**
 * Hook to get labels for autocomplete, auto-fetching all required kinds.
 */
export function useLabelsForAutocomplete(): {
  labels: LabelSuggestion[];
  isLoading: boolean;
  error: string | null;
} {
  const store = useConceptStore();
  const labels = store.getLabelsForAutocomplete();
  const error = store.error;

  // Check if all label kinds are loaded
  const labelKinds: ConceptKind[] = ['influence_region', 'role', 'part', 'body_region', 'pose'];
  const allLoaded = labelKinds.every((kind) => store.isKindLoaded(kind));
  const anyLoading = labelKinds.some((kind) => store.isKindLoading(kind));

  // Auto-fetch if not all loaded
  if (!allLoaded && !anyLoading) {
    store.fetchAllLabelKinds();
  }

  return { labels, isLoading: anyLoading, error };
}
