import { registerArcRenderers } from '@features/graph/lib/editor/arcRenderers';
import { registerRenderersFromNodeTypes } from '@features/graph/lib/editor/autoRegisterRenderers';
import { registerBuiltinRenderers } from '@features/graph/lib/editor/builtinRenderers';
import { registerPluginRenderers } from '@features/graph/lib/editor/pluginRenderers';
import { preloadHighPriorityRenderers } from '@features/graph/lib/editor/rendererBootstrap';
import { registerArcNodeTypes } from '@features/graph/lib/nodeTypes/arc';
import { registerBuiltinNodeTypes } from '@features/graph/lib/nodeTypes/builtin';

import { defineModule } from '@app/modules/types';

/**
 * Graph System Module
 *
 * Manages the scene graph node type system and renderers.
 * This module handles:
 * - Registering built-in and arc node types
 * - Registering node renderers (built-in, arc, and plugin)
 * - Preloading high-priority renderers for performance
 * - Auto-registering renderers from node type definitions
 *
 * Note: Graph actions are registered via arcGraphModule.page.actions
 * in routes/index.ts (Phase 1 action consolidation).
 */
export const graphSystemModule = defineModule({
  id: 'graph-system',
  name: 'Graph System Module',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for graph system module.',
  featureHighlights: ['Graph system module now participates in shared latest-update metadata.'],
  priority: 75, // Core system
  dependsOn: ['plugin-bootstrap'], // Needs plugins loaded first

  async initialize() {
    // Register builtin node types
    registerBuiltinNodeTypes();
    registerArcNodeTypes();

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
    await registerRenderersFromNodeTypes({
      verbose: true,
      strict: false, // Don't fail if a renderer is missing
    });
  },
});
