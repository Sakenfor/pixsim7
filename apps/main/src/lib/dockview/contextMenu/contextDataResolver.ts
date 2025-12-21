/**
 * Context Data Resolver
 *
 * Generic infrastructure for context menu data resolution.
 * DOM carries minimal pointers (type, id, label), full data is resolved at action time.
 *
 * Two patterns supported:
 *
 * 1. Component-level registration (preferred for rendered items):
 * ```tsx
 * function AssetCard({ asset }) {
 *   // Register data while component is mounted
 *   useRegisterContextData('asset', asset.id, {
 *     id: asset.id,
 *     name: asset.name,
 *     asset, // full object for actions
 *   }, [asset.id, asset.updated_at]);
 *
 *   return <div {...contextMenuAttrs('asset', asset.id, asset.name)}>...</div>;
 * }
 * ```
 *
 * 2. Feature-level resolver (for store-backed lookups):
 * ```ts
 * contextDataRegistry.register('node', (id) => nodeStore.getById(id));
 * ```
 */

import { useEffect } from 'react';

export type ContextDataResolver = (id: string) => Record<string, unknown> | null;

class ContextDataRegistry {
  private resolvers = new Map<string, ContextDataResolver>();

  /**
   * Register a resolver for a context type.
   * The resolver takes an ID and returns the full data object.
   */
  register(type: string, resolver: ContextDataResolver): void {
    this.resolvers.set(type, resolver);
  }

  /**
   * Unregister a resolver.
   */
  unregister(type: string): void {
    this.resolvers.delete(type);
  }

  /**
   * Check if a resolver is registered for a type.
   */
  has(type: string): boolean {
    return this.resolvers.has(type);
  }

  /**
   * Resolve data for a context type and ID.
   * Returns null if no resolver is registered or resolver returns null.
   */
  resolve(type: string, id: string): Record<string, unknown> | null {
    const resolver = this.resolvers.get(type);
    if (!resolver) return null;
    try {
      return resolver(id);
    } catch (error) {
      console.error(`[ContextDataRegistry] Error resolving ${type}:${id}:`, error);
      return null;
    }
  }

  /**
   * Get all registered types.
   */
  getTypes(): string[] {
    return Array.from(this.resolvers.keys());
  }
}

/** Global context data resolver registry */
export const contextDataRegistry = new ContextDataRegistry();

/**
 * Data attributes for context menu triggers.
 * Use as spread: <div {...contextMenuAttrs('asset', asset.id, asset.name)}>
 */
export interface ContextMenuAttrs {
  'data-context-type': string;
  'data-context-id': string;
  'data-context-label'?: string;
}

/**
 * Helper to create context menu data attributes.
 * These are minimal pointers - full data is resolved via contextDataRegistry.
 *
 * @param type - Context type (e.g., 'asset', 'node', 'edge')
 * @param id - ID to resolve data from (string or will be converted)
 * @param label - Optional display label
 */
export function contextMenuAttrs(
  type: string,
  id: string | number,
  label?: string,
): ContextMenuAttrs {
  const attrs: ContextMenuAttrs = {
    'data-context-type': type,
    'data-context-id': String(id),
  };
  if (label) {
    attrs['data-context-label'] = label;
  }
  return attrs;
}

/**
 * Marker attribute for elements that should not trigger context menu.
 * Use on nested interactive areas.
 */
export const contextMenuIgnore = {
  'data-context-ignore': 'true',
} as const;

/**
 * Extract context info from a DOM element.
 * Walks up the tree to find data-context-type, respecting data-context-ignore.
 * Supports both HTML and SVG elements (icons, graphics).
 *
 * @returns Context info or null if not found or ignored
 */
export function extractContextFromElement(
  target: EventTarget | null,
): { type: string; id: string; label?: string } | null {
  // Accept any Element (HTML or SVG), not just HTMLElement
  if (!(target instanceof Element)) return null;

  // Walk up to find context element, but stop if we hit an ignore marker
  let el: Element | null = target;
  while (el) {
    // Check for ignore marker (use getAttribute for SVG compatibility)
    if (el.getAttribute('data-context-ignore') === 'true') {
      return null;
    }
    // Check for context type
    const contextType = el.getAttribute('data-context-type');
    const contextId = el.getAttribute('data-context-id');
    if (contextType && contextId) {
      return {
        type: contextType,
        id: contextId,
        label: el.getAttribute('data-context-label') || undefined,
      };
    }
    el = el.parentElement;
  }
  return null;
}

// ============================================================================
// Generic Component-Level Data Cache
// ============================================================================

/**
 * In-memory cache for context data registered by components.
 * Keyed by "type:id" for O(1) lookups.
 */
class ContextDataCache {
  private cache = new Map<string, Record<string, unknown>>();

  private key(type: string, id: string | number): string {
    return `${type}:${id}`;
  }

  /** Register data for a type+id. */
  set(type: string, id: string | number, data: Record<string, unknown>): void {
    this.cache.set(this.key(type, id), data);
  }

  /** Unregister data for a type+id. */
  delete(type: string, id: string | number): void {
    this.cache.delete(this.key(type, id));
  }

  /** Get data for a type+id. Returns undefined if not cached. */
  get(type: string, id: string | number): Record<string, unknown> | undefined {
    return this.cache.get(this.key(type, id));
  }

  /** Check if data exists for a type+id. */
  has(type: string, id: string | number): boolean {
    return this.cache.has(this.key(type, id));
  }

  /** Clear all cached data (e.g., on logout). */
  clear(): void {
    this.cache.clear();
  }

  /** Get count of cached entries. */
  get size(): number {
    return this.cache.size;
  }
}

/** Global context data cache for component-registered data */
export const contextDataCache = new ContextDataCache();

// Register cache-based resolver as fallback
// This runs after feature-specific resolvers, checking the generic cache
contextDataRegistry.register('__cache__', () => null); // Placeholder

// Patch resolve to check cache first for any type
const originalResolve = contextDataRegistry.resolve.bind(contextDataRegistry);
contextDataRegistry.resolve = (type: string, id: string) => {
  // First check the generic cache
  const cached = contextDataCache.get(type, id);
  if (cached) return cached;
  // Fall back to type-specific resolver
  return originalResolve(type, id);
};

/**
 * Hook to register context data while a component is mounted.
 * Generic alternative to feature-specific hooks.
 *
 * @param type - Context type (e.g., 'asset', 'node')
 * @param id - Unique ID within the type
 * @param data - Data object to return when context menu resolves this item
 * @param deps - Dependency array for re-registration (default: [id])
 *
 * @example
 * ```tsx
 * useRegisterContextData('asset', asset.id, {
 *   id: asset.id,
 *   name: asset.name,
 *   asset,
 * }, [asset.id, asset.updated_at]);
 * ```
 */
export function useRegisterContextData(
  type: string,
  id: string | number | null | undefined,
  data: Record<string, unknown>,
  deps?: React.DependencyList,
): void {
  useEffect(() => {
    if (id === null || id === undefined) return;
    contextDataCache.set(type, id, data);
    return () => {
      contextDataCache.delete(type, id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? [id]);
}
