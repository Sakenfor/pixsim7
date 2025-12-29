/**
 * Context Data Resolver
 *
 * Generic infrastructure for context menu data resolution.
 * DOM carries minimal pointers (type, id, label), full data is resolved at action time.
 *
 * Two patterns supported (use based on data source):
 *
 * ============================================================================
 * Pattern A: Store-backed resolver (for types with stable global stores)
 * ============================================================================
 * Best for: Core types with reliable store lookups (nodes, edges, etc.)
 * Zero boilerplate in components - just add data attributes.
 *
 * ```ts
 * // Register once at feature init:
 * contextDataRegistry.register('node', (id) => {
 *   const node = useNodeStore.getState().getById(id);
 *   return node ? { id: node.id, label: node.data.label, node } : null;
 * });
 *
 * // In component - just attrs, no hook needed:
 * return <div {...contextMenuAttrs('node', node.id, node.data.label)}>...</div>;
 * ```
 *
 * ============================================================================
 * Pattern B: Component-level hook (for ephemeral/computed data)
 * ============================================================================
 * Best for: Ephemeral objects, derived/computed data, expensive lookups,
 * or data requiring component context.
 *
 * ```tsx
 * // Combined hook: registers data AND returns attrs
 * const ctxProps = useContextMenuItem('prompt', prompt.id, {
 *   id: prompt.id,
 *   name: prompt.title,
 *   prompt,
 * }, [prompt.id, prompt.title]);
 *
 * return <div {...ctxProps}>...</div>;
 * ```
 *
 * ============================================================================
 * When to use which:
 * ============================================================================
 * - Pattern A: Type has a stable store with getById, data rarely changes
 * - Pattern B: Ephemeral data, computed fields, or no global store
 * - Both can coexist: resolver takes precedence, cache is fallback
 */

import { useEffect } from 'react';

export type ContextDataResolver = (id: string) => Record<string, unknown> | null;

/**
 * Resolution precedence:
 * 1. Type-specific resolver (if registered and returns non-null)
 * 2. Component cache fallback (always checked as fallback)
 *
 * This means:
 * - Resolvers and cache can complement each other
 * - Resolver handles store-backed lookups (e.g., global stores)
 * - Cache handles component-level or ephemeral data
 * - If resolver returns null, cache is still checked
 * - Components can override resolver data by registering in cache
 */
class ContextDataRegistry {
  private resolvers = new Map<string, ContextDataResolver>();
  private cache: ContextDataCache | null = null;

  /**
   * Set the fallback cache for types without resolvers.
   * Called internally during module initialization.
   */
  setFallbackCache(cache: ContextDataCache): void {
    this.cache = cache;
  }

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
   *
   * Precedence:
   * 1. Type-specific resolver (if registered and returns non-null)
   * 2. Component cache fallback (always checked if resolver returns null)
   *
   * This allows resolvers and component-level cache to complement each other:
   * - Resolver can handle store-backed lookups
   * - Cache provides component-level overrides or ephemeral data
   * - If both exist, resolver is tried first, cache is fallback
   *
   * Returns null if neither source has data.
   */
  resolve(type: string, id: string): Record<string, unknown> | null {
    // 1. Try type-specific resolver first
    const resolver = this.resolvers.get(type);
    if (resolver) {
      try {
        const result = resolver(id);
        // Only use resolver result if non-null
        // This allows component cache to supplement resolvers
        if (result !== null) {
          return result;
        }
      } catch (error) {
        console.error(`[ContextDataRegistry] Error resolving ${type}:${id}:`, error);
        // Fall through to cache on error
      }
    }

    // 2. Fall back to component cache
    // This runs even if a resolver exists but returned null
    if (this.cache) {
      return this.cache.get(type, id) ?? null;
    }

    return null;
  }

  /**
   * Get all registered resolver types.
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

// Wire up cache as fallback for types without resolvers
contextDataRegistry.setFallbackCache(contextDataCache);

/**
 * Hook to register context data while a component is mounted.
 * Generic alternative to feature-specific hooks.
 *
 * @param type - Context type (e.g., 'asset', 'node')
 * @param id - Unique ID within the type
 * @param data - Data object to return when context menu resolves this item
 * @param deps - Dependency array for re-registration (REQUIRED)
 *
 * IMPORTANT: deps should include any fields that affect the data object.
 * Common patterns:
 * - [id, updatedAt] - re-register when item updates
 * - [id, name, thumbnailUrl] - re-register when display fields change
 * - [id] - only re-register when ID changes (use with caution)
 *
 * @example
 * ```tsx
 * // Good: includes fields that affect context menu display/actions
 * useRegisterContextData('asset', asset.id, {
 *   id: asset.id,
 *   name: asset.name,
 *   asset,
 * }, [asset.id, asset.updated_at]);
 *
 * // Good: explicit about which fields trigger re-registration
 * useRegisterContextData('node', node.id, {
 *   id: node.id,
 *   label: node.data.label,
 *   node,
 * }, [node.id, node.data.label]);
 * ```
 */
export function useRegisterContextData(
  type: string,
  id: string | number | null | undefined,
  data: Record<string, unknown>,
  deps: React.DependencyList,
): void {
  useEffect(() => {
    if (id === null || id === undefined) return;
    contextDataCache.set(type, id, data);
    return () => {
      contextDataCache.delete(type, id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Combined hook: registers context data AND returns data attributes.
 * Preferred for Pattern B (component-level registration).
 *
 * @param type - Context type (e.g., 'asset', 'prompt')
 * @param id - Unique ID within the type
 * @param data - Data object with at least { name?: string } for label
 * @param deps - Dependency array for re-registration (REQUIRED)
 * @returns Props to spread on the element
 *
 * @example
 * ```tsx
 * const ctxProps = useContextMenuItem('asset', asset.id, {
 *   id: asset.id,
 *   name: asset.description,
 *   asset,
 * }, [asset.id, asset.description, asset.updated_at]);
 *
 * return <div {...ctxProps}>...</div>;
 * ```
 */
export function useContextMenuItem(
  type: string,
  id: string | number | null | undefined,
  data: Record<string, unknown> & { name?: string },
  deps: React.DependencyList,
): ContextMenuAttrs | Record<string, never> {
  useRegisterContextData(type, id, data, deps);

  if (id === null || id === undefined) {
    return {};
  }

  return contextMenuAttrs(type, id, data.name);
}
