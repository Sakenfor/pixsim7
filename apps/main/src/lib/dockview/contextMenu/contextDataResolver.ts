/**
 * Context Data Resolver
 *
 * Registry for resolving context menu data from type + ID.
 * DOM carries minimal pointers (type, id, label), full data is resolved at action time.
 *
 * Usage:
 * ```ts
 * // Register a resolver
 * contextDataRegistry.register('asset', (id) => {
 *   return assetStore.getById(id);
 * });
 *
 * // In component - just add data attributes
 * <div {...contextMenuAttrs('asset', asset.id, asset.name)}>
 *
 * // Resolver is called when context menu needs the data
 * const data = contextDataRegistry.resolve('asset', '123');
 * ```
 */

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
 *
 * @returns Context info or null if not found or ignored
 */
export function extractContextFromElement(
  target: EventTarget | null,
): { type: string; id: string; label?: string } | null {
  if (!(target instanceof HTMLElement)) return null;

  // Walk up to find context element, but stop if we hit an ignore marker
  let el: HTMLElement | null = target;
  while (el) {
    // Check for ignore marker
    if (el.dataset.contextIgnore === 'true') {
      return null;
    }
    // Check for context type
    if (el.dataset.contextType && el.dataset.contextId) {
      return {
        type: el.dataset.contextType,
        id: el.dataset.contextId,
        label: el.dataset.contextLabel,
      };
    }
    el = el.parentElement;
  }
  return null;
}
