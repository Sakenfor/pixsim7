/**
 * Centralized Registry Exports
 *
 * This module provides a single canonical source for all plugin registries.
 * Always import registries from this file to avoid duplication issues.
 *
 * @example
 * ```typescript
 * // ✅ DO: Import from centralized registries
 * import { sessionHelperRegistry, interactionRegistry, nodeTypeRegistry } from '@lib/registries';
 *
 * // ❌ DON'T: Import from multiple sources
 * import { sessionHelperRegistry } from '@pixsim7/game.engine';
 * import { interactionRegistry } from './game/interactions/types';
 * ```
 */

// ===== Shared Types =====
// Re-export commonly used types from shared packages for convenience
export type {
  // Game types
  GameSessionDTO,
  GameWorldDetail,
  GameWorldSummary,
  GameLocationDetail,
  GameLocationSummary,
  GameNpcDetail,
  GameNpcSummary,
  GameHotspotDTO,
  NpcSlot2d,
  NpcExpressionDTO,
  NpcPresenceDTO,
  NpcSurfacePackage,
  Scene,
  SessionUpdatePayload,
  PickpocketRequest,
  PickpocketResponse,
  SensualTouchRequest,
  SensualTouchResponse,
  QuestObjectiveDTO,
  QuestDTO,
  InventoryItemDTO,
  WorldManifest,
  // Links/template resolution types
  ResolveTemplateResponse,
  ResolveBatchResponse,
  TemplateKind,
  TemplateRef,
} from '@pixsim7/shared.types';

// ===== Session Helper Registry =====
// Manages session state helpers (built-in and custom)
// Source:@pixsim7/game.engine
export {
  sessionHelperRegistry,
  SessionHelperRegistry,
  VALID_HELPER_CATEGORIES,
} from '@pixsim7/game.engine';

export type {
  HelperFunction,
  HelperDefinition,
  RegistryOptions,
  HelperSchema,
} from '@pixsim7/game.engine';

// ===== Interaction Registry =====
// Manages NPC interaction plugins
// Source: frontend/src/lib/game/interactions
export { interactionRegistry, InteractionRegistry } from './game/interactions/types';

export type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
  InteractionState,
  InteractionAPI,
  SessionHelpers,
  FormField,
  FormFieldType,
} from './game/interactions/types';

// ===== Node Type Registries =====
// Manages scene + arc graph node types
// Source: @features/graph (moved from @pixsim7/shared.types in migration)
export {
  nodeTypeRegistry,
  sceneNodeTypeRegistry,
  arcNodeTypeRegistry,
  NodeTypeRegistry,
} from '@features/graph';

export type {
  NodeTypeDefinition,
  PortDefinition,
  PortConfig,
  SceneNodeTypeDefinition,
} from '@features/graph';

// Node type registration helpers (for plugins)
export {
  registerBuiltinNodeTypes,
  registerArcNodeTypes,
} from '@features/graph';

/**
 * Re-export registration helper functions
 */
export { registerBuiltinHelpers } from '@pixsim7/game.engine';
export { generateHelper } from '@pixsim7/game.engine';

/**
 * Registry summary for debugging
 */
export function getRegistrySummary() {
  return {
    helpers: {
      total: sessionHelperRegistry.getAll().length,
      byCategory: VALID_HELPER_CATEGORIES.map(cat => ({
        category: cat,
        count: sessionHelperRegistry.getByCategory(cat).length,
      })),
    },
    interactions: {
      total: interactionRegistry.getAll().length,
      plugins: interactionRegistry.getAll().map(p => ({ id: p.id, name: p.name })),
    },
    nodeTypes: {
      total: nodeTypeRegistry.getAll().length,
      userCreatable: nodeTypeRegistry.getUserCreatable().length,
    },
  };
}

/**
 * Print registry summary to console (useful for debugging)
 */
export function printRegistrySummary() {
  const summary = getRegistrySummary();

  console.group('📊 Plugin Registry Summary');

  console.group('Session Helpers');
  console.log(`Total: ${summary.helpers.total}`);
  summary.helpers.byCategory.forEach(({ category, count }) => {
    if (count > 0) {
      console.log(`  ${category}: ${count}`);
    }
  });
  console.groupEnd();

  console.group('Interactions');
  console.log(`Total: ${summary.interactions.total}`);
  summary.interactions.plugins.forEach(({ id, name }) => {
    console.log(`  ${id}: ${name}`);
  });
  console.groupEnd();

  console.group('Node Types');
  console.log(`Total: ${summary.nodeTypes.total}`);
  console.log(`User Creatable: ${summary.nodeTypes.userCreatable}`);
  console.groupEnd();

  console.groupEnd();
}
