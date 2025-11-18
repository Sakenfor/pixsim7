import type { ComponentType } from 'react';
import { nodeRendererRegistry, type NodeRendererProps } from './nodeRendererRegistry';
import { nodeTypeRegistry } from '@pixsim7/types';
import { registerRenderer } from '../plugins/registryBridge';
import { pluginCatalog } from '../plugins/pluginSystem';

/**
 * Auto-wire renderers from node type definitions
 *
 * This module discovers all renderer components in the graph directory and
 * automatically registers them based on the `rendererComponent` field in
 * NodeTypeDefinition. This eliminates the need to manually import and register
 * plugin renderers in pluginRenderers.ts.
 *
 * USAGE:
 * Call registerRenderersFromNodeTypes() after node types are registered
 * but before scenes are rendered (typically in App.tsx initialization).
 *
 * @example
 * ```typescript
 * // In App.tsx
 * registerBuiltinNodeTypes();
 * loadAllPlugins(); // Registers plugin node types
 * registerRenderersFromNodeTypes(); // Auto-register their renderers
 * ```
 */

/**
 * Dynamically import all renderer components
 * Maps filename (without extension) to lazy-loaded component
 *
 * Pattern matches:
 * - /src/components/graph/SeductionNodeRenderer.tsx → 'SeductionNodeRenderer'
 * - /src/components/graph/QuestTriggerRenderer.tsx → 'QuestTriggerRenderer'
 * - etc.
 */
const rendererModules = import.meta.glob<{
  default: ComponentType<NodeRendererProps>;
}>('/src/components/graph/**/*Renderer.{tsx,ts}', { eager: false });

/**
 * Extract renderer name from file path
 *
 * @example
 * getRendererNameFromPath('/src/components/graph/SeductionNodeRenderer.tsx')
 * // Returns: 'SeductionNodeRenderer'
 */
function getRendererNameFromPath(path: string): string {
  const filename = path.split('/').pop() || '';
  return filename.replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Build a map of renderer names to their lazy loaders
 *
 * @returns Map<rendererName, loaderFunction>
 */
function buildRendererMap(): Map<string, () => Promise<ComponentType<NodeRendererProps>>> {
  const rendererMap = new Map<string, () => Promise<ComponentType<NodeRendererProps>>>();

  for (const [path, moduleLoader] of Object.entries(rendererModules)) {
    const rendererName = getRendererNameFromPath(path);

    // Create a loader function that imports the module and extracts the default export
    const loader = async () => {
      try {
        const module = await moduleLoader();
        if (!module.default) {
          throw new Error(`Renderer module ${path} does not have a default export`);
        }
        return module.default;
      } catch (error) {
        console.error(`Failed to load renderer ${rendererName} from ${path}:`, error);
        throw error;
      }
    };

    rendererMap.set(rendererName, loader);
  }

  return rendererMap;
}

/**
 * Auto-register renderers based on node type definitions
 *
 * This function:
 * 1. Scans all registered node types
 * 2. For each type with a `rendererComponent` field, finds the matching renderer module
 * 3. Registers the renderer with nodeRendererRegistry using lazy loading
 *
 * Benefits:
 * - No need to manually import renderer components
 * - Plugin developers just set `rendererComponent` in their node type definition
 * - Renderers are loaded on demand, improving initial load time
 *
 * @param options Configuration options
 * @param options.verbose Whether to log registration details (default: true)
 * @param options.strict Whether to throw on missing renderers (default: false)
 */
export function registerRenderersFromNodeTypes(options: {
  verbose?: boolean;
  strict?: boolean;
} = {}) {
  const { verbose = true, strict = false } = options;

  // Build the renderer map
  const rendererMap = buildRendererMap();

  if (verbose) {
    console.log(`📦 Discovered ${rendererMap.size} renderer components`);
  }

  // Get all registered node types
  const nodeTypes = nodeTypeRegistry.getAll();

  let registeredCount = 0;
  let skippedCount = 0;
  const missingRenderers: string[] = [];

  for (const nodeType of nodeTypes) {
    // Skip if no renderer component specified
    if (!nodeType.rendererComponent) {
      continue;
    }

    const rendererName = nodeType.rendererComponent;

    // Check if we already have a renderer registered for this node type
    // (builtinRenderers.ts and arcRenderers.ts may have already registered some)
    if (nodeRendererRegistry.has(nodeType.id)) {
      skippedCount++;
      if (verbose) {
        console.log(`  ⏭️  Skipped ${nodeType.id} (renderer already registered)`);
      }
      continue;
    }

    // Find the matching renderer module
    const rendererLoader = rendererMap.get(rendererName);

    if (!rendererLoader) {
      missingRenderers.push(`${nodeType.id} → ${rendererName}`);

      if (strict) {
        throw new Error(
          `Renderer component "${rendererName}" not found for node type "${nodeType.id}". ` +
          `Expected a file matching *${rendererName}.{tsx,ts} in /src/components/graph/`
        );
      }

      if (verbose) {
        console.warn(
          `  ⚠️  Missing renderer: ${nodeType.id} expects "${rendererName}" ` +
          `(file not found in /src/components/graph/)`
        );
      }
      continue;
    }

    // Determine origin from the node type's catalog entry
    const nodeTypeMetadata = pluginCatalog.get(nodeType.id);
    const origin = nodeTypeMetadata?.origin || 'builtin';

    // Register the renderer with lazy loading and origin tracking
    registerRenderer(
      {
        nodeType: nodeType.id,
        component: null as any, // Will be loaded lazily
        loader: rendererLoader,
        defaultSize: { width: 220, height: 200 }, // Default size, can be overridden
        preloadPriority: nodeType.preloadPriority,
      },
      { origin }
    );

    registeredCount++;

    if (verbose) {
      console.log(`  ✓ Auto-registered renderer for "${nodeType.id}" → ${rendererName} (origin: ${origin})`);
    }
  }

  // Summary
  if (verbose) {
    console.log(
      `✓ Auto-registered ${registeredCount} renderer(s) from node types ` +
      `(skipped ${skippedCount} already registered)`
    );

    if (missingRenderers.length > 0) {
      console.warn(
        `⚠️  Warning: ${missingRenderers.length} node type(s) specify rendererComponent but ` +
        `the renderer file was not found:\n  ${missingRenderers.join('\n  ')}`
      );
    }
  }

  return {
    registered: registeredCount,
    skipped: skippedCount,
    missing: missingRenderers.length,
  };
}

/**
 * Preload high-priority renderers
 *
 * Call this after registerRenderersFromNodeTypes() to eagerly load
 * renderers that are likely to be needed soon.
 *
 * @param nodeTypes Optional list of node types to preload (defaults to high-priority types)
 */
export async function preloadRenderers(nodeTypes?: string[]): Promise<void> {
  await nodeRendererRegistry.preload(nodeTypes);
}
