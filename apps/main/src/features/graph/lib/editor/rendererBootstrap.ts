/**
 * Renderer Bootstrap Module
 *
 * Provides utilities for registering node renderers with priority-based preloading.
 * This module bridges the gap between NodeTypeDefinition metadata (preloadPriority,
 * rendererComponent) and the NodeRendererRegistry, enabling lazy-loaded renderers
 * with smart preloading based on priority.
 *
 * Usage:
 * 1. Register renderers with registerRendererFromNodeType() to inherit priority
 * 2. Call preloadHighPriorityRenderers() after all registrations
 * 3. Heavy/rare renderers stay lazy, core ones are preloaded
 */

import { sceneNodeTypeRegistry } from '@lib/registries';
import { sceneNodeRendererRegistry, type NodeRenderer } from './nodeRendererRegistry';
import type { ComponentType } from 'react';
import type { NodeRendererProps } from './nodeRendererRegistry';

const placeholderRenderer: ComponentType<NodeRendererProps> = () => null;

/**
 * Priority threshold for automatic preloading
 * Renderers with priority > 7 will be preloaded on app init
 */
export const HIGH_PRIORITY_THRESHOLD = 7;

/**
 * Register a node renderer, inheriting preloadPriority from the node type definition
 *
 * @param renderer - The renderer configuration
 * @param options - Optional override for priority or node type lookup
 *
 * @example
 * ```typescript
 * registerRendererFromNodeType({
 *   nodeType: 'video',
 *   component: VideoNodeRenderer,
 *   defaultSize: { width: 220, height: 180 },
 * });
 * // Priority will be automatically inherited from sceneNodeTypeRegistry.get('video').preloadPriority
 * ```
 */
export function registerRendererFromNodeType(
  renderer: NodeRenderer,
  options?: {
    /** Override the preloadPriority instead of using the one from node type */
    priorityOverride?: number;
    /** Skip node type lookup (use when node type doesn't exist yet) */
    skipNodeTypeLookup?: boolean;
  }
): void {
  let preloadPriority = renderer.preloadPriority;

  // If priority override is provided, use it
  if (options?.priorityOverride !== undefined) {
    preloadPriority = options.priorityOverride;
  }
  // Otherwise, try to inherit from node type
  else if (!options?.skipNodeTypeLookup) {
    const nodeType = sceneNodeTypeRegistry.getSync(renderer.nodeType);
    if (nodeType?.preloadPriority !== undefined) {
      preloadPriority = nodeType.preloadPriority;
    }
  }

  // Register with the computed priority
  sceneNodeRendererRegistry.register({
    ...renderer,
    preloadPriority,
  });
}

/**
 * Preload all high-priority renderers (priority > 7)
 *
 * This should be called in App.tsx after:
 * 1. All node types are registered (builtin + plugins)
 * 2. All renderers are registered (builtin + plugins)
 *
 * @returns Promise that resolves when all high-priority renderers are loaded
 *
 * @example
 * ```typescript
 * // In App.tsx
 * registerBuiltinNodeTypes();
 * registerPluginNodeTypes();
 * registerBuiltinRenderers();
 * registerPluginRenderers();
 *
 * // Preload core renderers
 * await preloadHighPriorityRenderers();
 * ```
 */
export async function preloadHighPriorityRenderers(): Promise<void> {
  const allRenderers = sceneNodeRendererRegistry.getAll();

  // Find renderers with high priority
  const highPriorityRenderers = allRenderers
    .filter(r => (r.preloadPriority || 0) > HIGH_PRIORITY_THRESHOLD)
    .sort((a, b) => (b.preloadPriority || 0) - (a.preloadPriority || 0));

  if (highPriorityRenderers.length === 0) {
    console.log('ℹ No high-priority renderers to preload');
    return;
  }

  console.log(
    `⏳ Preloading ${highPriorityRenderers.length} high-priority renderers:`,
    highPriorityRenderers.map(r => `${r.nodeType} (priority ${r.preloadPriority})`)
  );

  // Preload in parallel
  await Promise.all(
    highPriorityRenderers.map(r => sceneNodeRendererRegistry.getAsync(r.nodeType))
  );

  console.log('✓ High-priority renderers preloaded');
}

/**
 * Preload specific node types by name
 *
 * Useful for preloading a custom set of renderers beyond the automatic high-priority ones.
 *
 * @param nodeTypes - Array of node type IDs to preload
 * @returns Promise that resolves when all specified renderers are loaded
 *
 * @example
 * ```typescript
 * // Preload specific renderers
 * await preloadRenderers(['video', 'choice', 'seduction']);
 * ```
 */
export async function preloadRenderers(nodeTypes: string[]): Promise<void> {
  if (nodeTypes.length === 0) {
    return;
  }

  console.log(`⏳ Preloading ${nodeTypes.length} specific renderers:`, nodeTypes);

  await Promise.all(
    nodeTypes.map(nodeType => sceneNodeRendererRegistry.getAsync(nodeType))
  );

  console.log('✓ Specific renderers preloaded');
}

/**
 * Create a lazy-loaded renderer with a dynamic import
 *
 * Helper function to create renderer configurations with lazy loading support.
 *
 * @param nodeType - The node type this renderer handles
 * @param loader - Function that returns a promise of the component
 * @param options - Additional renderer options
 * @returns NodeRenderer configuration with lazy loading
 *
 * @example
 * ```typescript
 * const videoRenderer = createLazyRenderer(
 *   'video',
 *   () => import('../../components/graph/VideoNodeRenderer').then(m => m.VideoNodeRenderer),
 *   {
 *     defaultSize: { width: 220, height: 180 },
 *     preloadPriority: 9, // High priority - preload this
 *   }
 * );
 *
 * registerRendererFromNodeType(videoRenderer);
 * ```
 */
export function createLazyRenderer(
  nodeType: string,
  loader: () => Promise<ComponentType<NodeRendererProps>>,
  options?: Partial<Omit<NodeRenderer, 'nodeType' | 'component' | 'loader'>>
): NodeRenderer {
  return {
    nodeType,
    component: placeholderRenderer, // Will be loaded lazily
    loader,
    ...options,
  };
}

/**
 * Get preload statistics for debugging
 *
 * @returns Information about registered renderers and their preload status
 */
export function getPreloadStats() {
  const allRenderers = sceneNodeRendererRegistry.getAll();
  const highPriority = allRenderers.filter(r => (r.preloadPriority || 0) > HIGH_PRIORITY_THRESHOLD);
  const lazy = allRenderers.filter(r => r.loader !== undefined);
  const eager = allRenderers.filter(r => r.loader === undefined);

  return {
    total: allRenderers.length,
    highPriority: highPriority.length,
    lazy: lazy.length,
    eager: eager.length,
    byPriority: allRenderers
      .filter(r => r.preloadPriority !== undefined)
      .sort((a, b) => (b.preloadPriority || 0) - (a.preloadPriority || 0))
      .map(r => ({ nodeType: r.nodeType, priority: r.preloadPriority })),
  };
}

/**
 * Print preload statistics to console (useful for debugging)
 */
export function printPreloadStats() {
  const stats = getPreloadStats();

  console.group('📊 Renderer Preload Statistics');
  console.log(`Total renderers: ${stats.total}`);
  console.log(`High-priority (>${HIGH_PRIORITY_THRESHOLD}): ${stats.highPriority}`);
  console.log(`Lazy-loaded: ${stats.lazy}`);
  console.log(`Eager-loaded: ${stats.eager}`);

  if (stats.byPriority.length > 0) {
    console.group('By Priority:');
    stats.byPriority.forEach(({ nodeType, priority }) => {
      console.log(`  ${nodeType}: ${priority}`);
    });
    console.groupEnd();
  }

  console.groupEnd();
}
