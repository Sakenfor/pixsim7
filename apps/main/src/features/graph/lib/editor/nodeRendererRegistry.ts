import type { ComponentType } from 'react';

import type { DraftSceneNode } from '@domain/sceneBuilder';
import type { ArcGraphNode } from '@features/graph/models/arcGraph';

export interface NodeRendererProps<TNode = DraftSceneNode> {
  node: TNode;
  isSelected: boolean;
  isStart: boolean;
  hasErrors: boolean;
}

export interface NodeRenderer<TNode = DraftSceneNode> {
  /** Node type this renders */
  nodeType: string;

  /** Render component for node body content */
  component: ComponentType<NodeRendererProps<TNode>>;

  /** Default size hint (used by layout algorithms) */
  defaultSize?: { width: number; height: number };

  /** Whether to use custom header (if false, uses default header) */
  customHeader?: boolean;

  /** Lazy loading: function to load the component on demand */
  loader?: () => Promise<ComponentType<NodeRendererProps<TNode>>>;

  /** Priority for preloading (higher = load sooner) */
  preloadPriority?: number;
}

export interface NodeRendererRegistryOptions {
  duplicatePolicy?: 'warn' | 'error';
}

/**
 * LRU Cache for frequently accessed renderers
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove if already exists (to update position)
    this.cache.delete(key);

    // Add to end
    this.cache.set(key, value);

    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Node Renderer Registry with performance optimizations:
 * - LRU cache for frequently accessed renderers (max 50 entries)
 * - Lazy loading support for plugin-based renderers
 * - Automatic preloading of high-priority renderers
 */
export class NodeRendererRegistry<TNode = DraftSceneNode> {
  private renderers = new Map<string, NodeRenderer<TNode>>();
  private cache = new LRUCache<string, NodeRenderer<TNode>>(50);
  private loadingPromises = new Map<string, Promise<NodeRenderer<TNode>>>();
  private preloadedIds = new Set<string>();
  private duplicatePolicy: 'warn' | 'error';

  constructor(options: NodeRendererRegistryOptions = {}) {
    this.duplicatePolicy = options.duplicatePolicy ?? 'warn';
  }

  /** Register a node renderer */
  register(renderer: NodeRenderer<TNode>) {
    if (this.renderers.has(renderer.nodeType)) {
      const message = `Node renderer for ${renderer.nodeType} already registered`;
      if (this.duplicatePolicy === 'error') {
        throw new Error(message);
      }
      console.warn(`${message}, overwriting`);
      this.preloadedIds.delete(renderer.nodeType);
      this.loadingPromises.delete(renderer.nodeType);
    }
    this.renderers.set(renderer.nodeType, renderer);

    // Update cache if already cached
    if (this.cache.has(renderer.nodeType)) {
      this.cache.set(renderer.nodeType, renderer);
    }
  }

  unregister(nodeType: string): boolean {
    if (!this.renderers.has(nodeType)) {
      return false;
    }

    this.renderers.delete(nodeType);
    this.cache.clear();
    this.preloadedIds.delete(nodeType);
    this.loadingPromises.delete(nodeType);
    return true;
  }

  /** Get renderer for a node type (with caching and lazy loading) */
  async getAsync(nodeType: string): Promise<NodeRenderer<TNode> | undefined> {
    // Check cache first
    const cached = this.cache.get(nodeType);
    if (cached && !cached.loader) {
      return cached;
    }

    // Check if renderer is registered
    const renderer = this.renderers.get(nodeType);
    if (!renderer) {
      return undefined;
    }

    // If has loader and not loaded yet, load it
    if (renderer.loader && !this.preloadedIds.has(nodeType)) {
      return this.loadRenderer(nodeType);
    }

    // Cache and return
    this.cache.set(nodeType, renderer);
    return renderer;
  }

  /** Synchronous get (use when you know the renderer is loaded) */
  get(nodeType: string): NodeRenderer<TNode> | undefined {
    // Check cache first
    const cached = this.cache.get(nodeType);
    if (cached) {
      return cached;
    }

    const renderer = this.renderers.get(nodeType);
    if (renderer && !renderer.loader) {
      this.cache.set(nodeType, renderer);
    }
    return renderer;
  }

  /** Load a lazy-loaded renderer */
  private async loadRenderer(nodeType: string): Promise<NodeRenderer<TNode> | undefined> {
    // Check if already loading
    if (this.loadingPromises.has(nodeType)) {
      return this.loadingPromises.get(nodeType);
    }

    const renderer = this.renderers.get(nodeType);
    if (!renderer || !renderer.loader) {
      return renderer;
    }

    // Start loading
    const loadPromise = renderer.loader()
      .then(component => {
        // Replace the stub with the loaded component
        const loadedRenderer: NodeRenderer<TNode> = {
          ...renderer,
          component,
          loader: undefined, // Remove loader after loading
        };
        this.renderers.set(nodeType, loadedRenderer);
        this.cache.set(nodeType, loadedRenderer);
        this.preloadedIds.add(nodeType);
        this.loadingPromises.delete(nodeType);
        return loadedRenderer;
      })
      .catch(error => {
        console.error(`Failed to load renderer for ${nodeType}:`, error);
        this.loadingPromises.delete(nodeType);
        return renderer; // Return stub on error
      });

    this.loadingPromises.set(nodeType, loadPromise);
    return loadPromise;
  }

  /** Preload renderers by priority or node types */
  async preload(nodeTypes?: string[]): Promise<void> {
    const toPreload = nodeTypes || this.getPreloadCandidates();

    await Promise.all(
      toPreload.map(nodeType => this.loadRenderer(nodeType))
    );
  }

  /** Get renderers that should be preloaded */
  private getPreloadCandidates(): string[] {
    const renderers = Array.from(this.renderers.values());
    return renderers
      .filter(r => r.loader && !this.preloadedIds.has(r.nodeType))
      .sort((a, b) => (b.preloadPriority || 0) - (a.preloadPriority || 0))
      .map(r => r.nodeType)
      .slice(0, 10); // Preload top 10
  }

  /** Check if renderer exists for a node type */
  has(nodeType: string): boolean {
    return this.renderers.has(nodeType);
  }

  /** Get renderer or fallback to default */
  getOrDefault(nodeType: string): NodeRenderer<TNode> {
    const renderer = this.get(nodeType);
    if (renderer) {
      return renderer;
    }

    const defaultRenderer = this.get('default');
    if (!defaultRenderer) {
      console.error(`[NodeRendererRegistry] No renderer found for '${nodeType}' and no default renderer registered`);
      throw new Error(`No renderer available for node type '${nodeType}' and no default fallback`);
    }

    return defaultRenderer;
  }

  /** Get all registered renderers */
  getAll(): NodeRenderer<TNode>[] {
    return Array.from(this.renderers.values());
  }

  /** Clear cache (useful for testing/debugging) */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get cache statistics */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: 50,
    };
  }
}

/** Global renderer registry instance */
export function createNodeRendererRegistry<TNode>(
  options: NodeRendererRegistryOptions = {}
): NodeRendererRegistry<TNode> {
  return new NodeRendererRegistry<TNode>(options);
}

export const sceneNodeRendererRegistry = createNodeRendererRegistry<DraftSceneNode>({
  duplicatePolicy: 'error',
});

export const arcNodeRendererRegistry = createNodeRendererRegistry<ArcGraphNode>({
  duplicatePolicy: 'error',
});

export type SceneNodeRendererProps = NodeRendererProps<DraftSceneNode>;
export type ArcNodeRendererProps = NodeRendererProps<ArcGraphNode>;

/** Compatibility alias for existing imports */
export const nodeRendererRegistry = sceneNodeRendererRegistry;
