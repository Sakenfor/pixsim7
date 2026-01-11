import type { ComponentType } from 'react';

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import { pluginCatalog } from '@lib/plugins/pluginSystem';
import { debugFlags } from '@lib/utils/debugFlags';

import { arcNodeTypeRegistry } from '../nodeTypes/arcRegistry';
import type { NodeTypeDefinition, NodeTypeRegistry } from '../nodeTypes/registry';
import { sceneNodeTypeRegistry } from '../nodeTypes/sceneRegistry';

import {
  arcNodeRendererRegistry,
  sceneNodeRendererRegistry,
  type NodeRenderer,
  type NodeRendererRegistry,
  type NodeRendererProps,
} from './nodeRendererRegistry';

const placeholderRenderer: ComponentType<NodeRendererProps<unknown>> = () => null;

/**
 * Auto-wire renderers from node type definitions
 *
 * This module discovers all renderer components in the graph directory and
 * automatically registers them based on the `rendererComponent` field in
 * NodeTypeDefinition. This eliminates the need to manually import and register
 * plugin renderers in pluginRenderers.ts.
 */

/**
 * Dynamically import all renderer components
 * Maps filename (without extension) to lazy-loaded component
 */
const rendererModules = import.meta.glob<{
  default: ComponentType<NodeRendererProps<unknown>>;
}>('/src/features/graph/components/graph/**/*Renderer.{tsx,ts}', { eager: false });

/**
 * Extract renderer name from file path
 */
function getRendererNameFromPath(path: string): string {
  const filename = path.split('/').pop() || '';
  return filename.replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Build a map of renderer names to their lazy loaders
 */
function buildRendererMap(): Map<string, () => Promise<ComponentType<NodeRendererProps<unknown>>>> {
  const rendererMap = new Map<string, () => Promise<ComponentType<NodeRendererProps<unknown>>>>();

  for (const [path, moduleLoader] of Object.entries(rendererModules)) {
    const rendererName = getRendererNameFromPath(path);

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

async function registerRenderersFromRegistry(
  registry: NodeTypeRegistry<NodeTypeDefinition>,
  rendererRegistry: NodeRendererRegistry<unknown>,
  options: {
    verbose?: boolean;
    strict?: boolean;
    trackInCatalog?: boolean;
  } = {}
) {
  const { verbose = true, strict = false, trackInCatalog = true } = options;

  const rendererMap = buildRendererMap();

  if (verbose) {
    console.log(`[RendererAutoRegister] Discovered ${rendererMap.size} renderer components`);
  }

  const nodeTypes = registry.getAll();

  let registeredCount = 0;
  let skippedCount = 0;
  const missingRenderers: string[] = [];

  for (const nodeType of nodeTypes) {
    if (!nodeType.rendererComponent) {
      continue;
    }

    const rendererName = nodeType.rendererComponent;

    if (rendererRegistry.has(nodeType.id)) {
      skippedCount++;
      if (verbose) {
        debugFlags.log('registry', `  Skipped ${nodeType.id} (renderer already registered)`);
      }
      continue;
    }

    const rendererLoader = rendererMap.get(rendererName);

    if (!rendererLoader) {
      missingRenderers.push(`${nodeType.id} -> ${rendererName}`);

      if (strict) {
        throw new Error(
          `Renderer component "${rendererName}" not found for node type "${nodeType.id}". ` +
          `Expected a file matching *${rendererName}.{tsx,ts} in /src/components/graph/`
        );
      }

      if (verbose) {
        console.warn(`  Missing renderer: ${nodeType.id} expects "${rendererName}" (file not found in /src/components/graph/)`);
      }
      continue;
    }

    if (trackInCatalog && rendererRegistry === sceneNodeRendererRegistry) {
      const nodeTypeMetadata = pluginCatalog.get(nodeType.id);
      const origin = nodeTypeMetadata?.origin || 'builtin';

      await registerPluginDefinition({
        id: `renderer:${nodeType.id}`,
        family: 'renderer',
        origin,
        source: 'source',
        plugin: {
          nodeType: nodeType.id,
          component: placeholderRenderer,
          loader: rendererLoader as NodeRenderer['loader'],
          defaultSize: { width: 220, height: 200 },
          preloadPriority: nodeType.preloadPriority,
        },
      });
    } else {
      const renderer: NodeRenderer<unknown> = {
        nodeType: nodeType.id,
        component: placeholderRenderer,
        loader: rendererLoader as NodeRenderer<unknown>['loader'],
        defaultSize: { width: 220, height: 200 },
        preloadPriority: nodeType.preloadPriority,
      };
      rendererRegistry.register(renderer);
    }

    registeredCount++;

    if (verbose) {
      debugFlags.log('registry', `  Auto-registered renderer for "${nodeType.id}" -> ${rendererName}`);
    }
  }

  if (verbose) {
    console.log(`[RendererAutoRegister] Auto-registered ${registeredCount} renderer(s) from node types (skipped ${skippedCount} already registered)`);

    if (missingRenderers.length > 0) {
      console.warn(`[RendererAutoRegister] Warning: ${missingRenderers.length} node type(s) specify rendererComponent but the renderer file was not found:\n  ${missingRenderers.join('\n  ')}`);
    }
  }

  return {
    registered: registeredCount,
    skipped: skippedCount,
    missing: missingRenderers.length,
  };
}

export async function registerRenderersFromNodeTypes(options: {
  verbose?: boolean;
  strict?: boolean;
} = {}) {
  return await registerRenderersFromRegistry(sceneNodeTypeRegistry, sceneNodeRendererRegistry, options);
}

export async function registerArcRenderersFromNodeTypes(options: {
  verbose?: boolean;
  strict?: boolean;
} = {}) {
  return await registerRenderersFromRegistry(arcNodeTypeRegistry, arcNodeRendererRegistry, {
    ...options,
    trackInCatalog: false,
  });
}

export async function preloadRenderers(
  nodeTypes?: string[],
  registry: NodeRendererRegistry<unknown> = sceneNodeRendererRegistry
): Promise<void> {
  await registry.preload(nodeTypes);
}
