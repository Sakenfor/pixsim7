/**
 * Composition Package Store
 *
 * Zustand store for composition packages and roles.
 * Fetches registered packages from backend (core + plugins).
 */
import { create } from 'zustand';
import type { CompositionPackage, CompositionRoleDefinition } from '@pixsim7/shared.types';
import { getAvailableRoles } from '@pixsim7/shared.types';
import { getCompositionPackages } from '@lib/api/composition';

interface CompositionPackageState {
  // Data
  packages: CompositionPackage[];

  // Loading state
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;

  // Selectors
  getPackage: (packageId: string) => CompositionPackage | undefined;
  getRolesForPackages: (activePackageIds?: string[]) => CompositionRoleDefinition[];
  getRole: (roleId: string, activePackageIds?: string[]) => CompositionRoleDefinition | undefined;
}

export const useCompositionPackageStore = create<CompositionPackageState>((set, get) => ({
  // Initial state
  packages: [],
  isLoading: false,
  isInitialized: false,
  error: null,

  /**
   * Initialize - fetch packages from backend
   */
  initialize: async () => {
    const state = get();
    if (state.isInitialized || state.isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const packages = await getCompositionPackages();

      set({
        packages,
        isInitialized: true,
        isLoading: false,
      });

      console.log('[CompositionPackages] Initialized with', packages.length, 'packages');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load composition packages';
      console.error('[CompositionPackages] Initialization failed:', error);
      set({
        error: message,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  /**
   * Refresh packages from backend
   */
  refresh: async () => {
    set({ isLoading: true, error: null });

    try {
      const packages = await getCompositionPackages();
      set({ packages, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh composition packages';
      console.error('[CompositionPackages] Refresh failed:', error);
      set({ error: message, isLoading: false });
    }
  },

  /**
   * Get a package by ID
   */
  getPackage: (packageId: string) => {
    return get().packages.find(p => p.id === packageId);
  },

  /**
   * Get roles from active packages
   * Uses the shared helper which ensures core.base is always included
   */
  getRolesForPackages: (activePackageIds?: string[]) => {
    return getAvailableRoles(get().packages, activePackageIds ?? []);
  },

  /**
   * Get a specific role by ID from active packages
   */
  getRole: (roleId: string, activePackageIds?: string[]) => {
    const roles = get().getRolesForPackages(activePackageIds);
    return roles.find(r => r.id === roleId);
  },
}));

// ===== CONVENIENCE HOOK =====

/**
 * Hook to use composition packages with auto-initialization.
 *
 * @example
 * const { packages, isLoading, getRolesForPackages } = useCompositionPackages();
 * const roles = getRolesForPackages(world.meta.generation?.compositionPackages);
 */
export function useCompositionPackages() {
  const store = useCompositionPackageStore();

  // Auto-initialize on first use
  if (!store.isInitialized && !store.isLoading) {
    store.initialize();
  }

  return store;
}
