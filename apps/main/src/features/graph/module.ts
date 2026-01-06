import { registerGraphActions } from '@lib/capabilities/registerCoreFeatures';

import { registerArcRenderers } from '@features/graph/lib/editor/arcRenderers';
import { registerRenderersFromNodeTypes } from '@features/graph/lib/editor/autoRegisterRenderers';
import { registerBuiltinRenderers } from '@features/graph/lib/editor/builtinRenderers';
import { registerPluginRenderers } from '@features/graph/lib/editor/pluginRenderers';
import { preloadHighPriorityRenderers } from '@features/graph/lib/editor/rendererBootstrap';

import type { Module } from '@app/modules/types';

/**
 * Graph System Module
 *
 * Manages the scene graph node type system and renderers.
 * This module handles:
 * - Registering built-in and arc node types (TODO: need to implement these functions)
 * - Registering node renderers (built-in, arc, and plugin)
 * - Preloading high-priority renderers for performance
 * - Auto-registering renderers from node type definitions
 */
export const graphSystemModule: Module = {
  id: 'graph-system',
  name: 'Graph System Module',
  priority: 75, // Core system
  dependsOn: ['plugin-bootstrap'], // Needs plugins loaded first

  async initialize() {
    // Register graph actions in the capability registry
    registerGraphActions();

    // Register builtin node types
    // TODO: Implement registerBuiltinNodeTypes() and registerArcNodeTypes()
    // registerBuiltinNodeTypes();
    // registerArcNodeTypes();

    // Register builtin node renderers
    registerBuiltinRenderers();
    registerArcRenderers();

    // Register plugin node renderers
    registerPluginRenderers();

    // Preload high-priority renderers (priority > 7)
    // This eagerly loads core renderers (video, choice, scene_call, etc.)
    // while leaving rare/heavy renderers lazy-loaded
    await preloadHighPriorityRenderers();

    // Auto-register renderers from node types (after plugins are loaded)
    // This discovers renderer components and registers them based on the
    // rendererComponent field in NodeTypeDefinition
    registerRenderersFromNodeTypes({
      verbose: true,
      strict: false, // Don't fail if a renderer is missing
    });
  },
};
