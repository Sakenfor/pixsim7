/**
 * Composition Package Store
 *
 * Zustand store for composition packages and roles.
 * Fetches registered packages from backend (core + plugins).
 *
 * This is the single source of truth for composition role data at runtime.
 * Replaces build-time generated constants with dynamic API data.
 */
import { getAvailableRoles } from '@pixsim7/core.image-composition';
import type { CompositionPackage, CompositionRoleDefinition } from '@pixsim7/shared.types';
import { create } from 'zustand';

import { getCompositionPackages } from '@lib/api/composition';
import { getConceptRoles, type RoleConceptResponse } from '@lib/api/concepts';

interface CompositionPackageState {
  // Data
  packages: CompositionPackage[];
  roles: RoleConceptResponse[];
  priority: string[];

  // Derived mappings (computed from roles)
  slugToRole: Record<string, string>;
  namespaceToRole: Record<string, string>;

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

  // Role inference (replaces generated functions)
  inferRoleFromTag: (tag: string) => string | undefined;
  inferRoleFromTags: (tags: string[]) => string | undefined;

  // Role metadata helpers
  getRoleDescription: (roleId: string) => string;
  getRoleColor: (roleId: string) => string;
}

/**
 * Build derived mappings from roles
 */
function buildMappings(roles: RoleConceptResponse[]): {
  slugToRole: Record<string, string>;
  namespaceToRole: Record<string, string>;
} {
  const slugToRole: Record<string, string> = {};
  const namespaceToRole: Record<string, string> = {};

  for (const role of roles) {
    for (const slug of role.slug_mappings) {
      slugToRole[slug.toLowerCase()] = role.id;
    }
    for (const ns of role.namespace_mappings) {
      namespaceToRole[ns.toLowerCase()] = role.id;
    }
  }

  return { slugToRole, namespaceToRole };
}

export const useCompositionPackageStore = create<CompositionPackageState>((set, get) => ({
  // Initial state
  packages: [],
  roles: [],
  priority: [],
  slugToRole: {},
  namespaceToRole: {},
  isLoading: false,
  isInitialized: false,
  error: null,

  /**
   * Initialize - fetch packages and roles from backend
   */
  initialize: async () => {
    const state = get();
    if (state.isInitialized || state.isLoading) return;

    set({ isLoading: true, error: null });

    try {
      // Fetch both packages and concept roles in parallel
      const [packages, conceptRolesResponse] = await Promise.all([
        getCompositionPackages(),
        getConceptRoles(),
      ]);

      const { roles, priority } = conceptRolesResponse;
      const { slugToRole, namespaceToRole } = buildMappings(roles);

      set({
        packages,
        roles,
        priority,
        slugToRole,
        namespaceToRole,
        isInitialized: true,
        isLoading: false,
      });

      console.log('[CompositionPackages] Initialized with', packages.length, 'packages,', roles.length, 'roles');
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
   * Refresh packages and roles from backend
   */
  refresh: async () => {
    set({ isLoading: true, error: null });

    try {
      const [packages, conceptRolesResponse] = await Promise.all([
        getCompositionPackages(),
        getConceptRoles(),
      ]);

      const { roles, priority } = conceptRolesResponse;
      const { slugToRole, namespaceToRole } = buildMappings(roles);

      set({
        packages,
        roles,
        priority,
        slugToRole,
        namespaceToRole,
        isLoading: false,
      });
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

  /**
   * Infer composition role from a single tag string.
   *
   * Strategy:
   * 1. Check exact slug match (e.g., "bg", "char:hero")
   * 2. Extract namespace prefix (e.g., "npc:alex" -> "npc") and check namespace mapping
   */
  inferRoleFromTag: (tag: string) => {
    const { slugToRole, namespaceToRole } = get();
    const normalized = tag.toLowerCase().trim();

    // 1. Direct slug match
    if (normalized in slugToRole) {
      return slugToRole[normalized];
    }

    // 2. Namespace extraction (split on first colon)
    const colonIdx = normalized.indexOf(':');
    if (colonIdx > 0) {
      const namespace = normalized.slice(0, colonIdx);
      if (namespace in namespaceToRole) {
        return namespaceToRole[namespace];
      }
    }

    return undefined;
  },

  /**
   * Infer composition role from multiple tags.
   * Returns highest-priority role found.
   */
  inferRoleFromTags: (tags: string[]) => {
    const { priority, inferRoleFromTag } = get();
    const found = new Set<string>();

    for (const tag of tags) {
      const role = inferRoleFromTag(tag);
      if (role) found.add(role);
    }

    // Return highest priority role
    for (const role of priority) {
      if (found.has(role)) return role;
    }

    // Return any found role if not in priority list (plugin roles)
    if (found.size > 0) {
      return Array.from(found).sort()[0]; // Deterministic: alphabetical
    }

    return undefined;
  },

  /**
   * Get description for a role
   */
  getRoleDescription: (roleId: string) => {
    const role = get().roles.find(r => r.id === roleId);
    return role?.description ?? '';
  },

  /**
   * Get color for a role
   */
  getRoleColor: (roleId: string) => {
    const role = get().roles.find(r => r.id === roleId);
    return role?.color ?? 'gray';
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
