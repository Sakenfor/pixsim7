/**
 * Context Data Resolver
 *
 * Generic infrastructure for context menu data resolution.
 */

import { useEffect } from 'react';

export type ContextDataResolver = (id: string) => Record<string, unknown> | null;

class ContextDataRegistry {
  private resolvers = new Map<string, ContextDataResolver>();
  private cache: ContextDataCache | null = null;

  setFallbackCache(cache: ContextDataCache): void {
    this.cache = cache;
  }

  register(type: string, resolver: ContextDataResolver): void {
    this.resolvers.set(type, resolver);
  }

  unregister(type: string): void {
    this.resolvers.delete(type);
  }

  has(type: string): boolean {
    return this.resolvers.has(type);
  }

  resolve(type: string, id: string): Record<string, unknown> | null {
    const resolver = this.resolvers.get(type);
    if (resolver) {
      try {
        const result = resolver(id);
        if (result !== null) {
          return result;
        }
      } catch (error) {
        console.error(`[ContextDataRegistry] Error resolving ${type}:${id}:`, error);
      }
    }

    if (this.cache) {
      return this.cache.get(type, id) ?? null;
    }

    return null;
  }

  getTypes(): string[] {
    return Array.from(this.resolvers.keys());
  }
}

export const contextDataRegistry = new ContextDataRegistry();

export interface ContextMenuAttrs {
  'data-context-type': string;
  'data-context-id': string;
  'data-context-label'?: string;
}

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

export const contextMenuIgnore = {
  'data-context-ignore': 'true',
} as const;

export function extractContextFromElement(
  target: EventTarget | null,
): { type: string; id: string; label?: string } | null {
  if (!(target instanceof Element)) return null;

  let el: Element | null = target;
  while (el) {
    if (el.getAttribute('data-context-ignore') === 'true') {
      return null;
    }
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

// Component-Level Data Cache

class ContextDataCache {
  private cache = new Map<string, Record<string, unknown>>();

  private key(type: string, id: string | number): string {
    return `${type}:${id}`;
  }

  set(type: string, id: string | number, data: Record<string, unknown>): void {
    this.cache.set(this.key(type, id), data);
  }

  delete(type: string, id: string | number): void {
    this.cache.delete(this.key(type, id));
  }

  get(type: string, id: string | number): Record<string, unknown> | undefined {
    return this.cache.get(this.key(type, id));
  }

  has(type: string, id: string | number): boolean {
    return this.cache.has(this.key(type, id));
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const contextDataCache = new ContextDataCache();

// Wire up cache as fallback
contextDataRegistry.setFallbackCache(contextDataCache);

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
