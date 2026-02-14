/**
 * Layer–Role Binding
 *
 * Bridge between the pure visual layer model (@pixsim7/graphics.layers)
 * and the composition role system (@pixsim7/shared.types).
 *
 * This module gives layers semantic meaning for generation pipelines
 * without polluting the layer model itself.
 */

import type { Layer, LayerStack, LayerElement } from '@pixsim7/graphics.layers';
import type {
  CompositionRoleDefinition,
  CompositionSlotDefault,
  CompositionSlotPolicy,
} from '@pixsim7/shared.types';

// ============================================================================
// Types
// ============================================================================

/** How an asset/layer should be used relative to the generation intent */
export type LayerIntent = 'preserve' | 'modify' | 'generate' | 'add' | 'remove';

/** What kind of influence a layer exerts on generation */
export type LayerInfluenceType =
  | 'content'
  | 'style'
  | 'structure'
  | 'mask'
  | 'blend'
  | 'replacement'
  | 'reference';

/**
 * A layer with an optional role binding.
 * The bridge between visual layers and composition semantics.
 */
export interface BoundLayer<TElement extends LayerElement = LayerElement> {
  /** The underlying visual layer */
  layer: Layer<TElement>;
  /** Composition role ID (from CompositionRoleDefinition.id), if bound */
  roleId?: string;
  /** How this layer should be used in generation */
  intent?: LayerIntent;
  /** What kind of influence this layer has */
  influenceType?: LayerInfluenceType;
  /** Target region for the influence (e.g. 'full', 'foreground', 'mask:label') */
  influenceRegion?: string;
}

// ============================================================================
// Metadata Keys (convention for Layer.metadata)
// ============================================================================

/** Metadata key for explicitly bound role ID */
export const META_ROLE_ID = 'composition.roleId';
/** Metadata key for layer intent */
export const META_INTENT = 'composition.intent';
/** Metadata key for influence type */
export const META_INFLUENCE_TYPE = 'composition.influenceType';
/** Metadata key for influence region */
export const META_INFLUENCE_REGION = 'composition.influenceRegion';

// ============================================================================
// Binding
// ============================================================================

/**
 * Bind layers to roles using:
 * 1. Explicit metadata override (`composition.roleId` in layer.metadata)
 * 2. Layer name matching against role labels (fuzzy, case-insensitive)
 * 3. Layer type heuristics (e.g. type='mask' → mask influence)
 *
 * Layers without a matching role get `roleId: undefined`.
 */
export function bindLayersToRoles<TElement extends LayerElement>(
  stack: LayerStack<TElement>,
  roles: CompositionRoleDefinition[],
): BoundLayer<TElement>[] {
  const roleLabelMap = new Map(
    roles.map((r) => [r.label.toLowerCase(), r.id]),
  );
  const roleIdSet = new Set(roles.map((r) => r.id));

  return stack.layers.map((layer) => {
    // 1. Explicit metadata binding
    const explicitRole = layer.metadata?.[META_ROLE_ID] as string | undefined;
    if (explicitRole && roleIdSet.has(explicitRole)) {
      return buildBoundLayer(layer, explicitRole);
    }

    // 2. Name matching (case-insensitive, exact label match)
    const nameMatch = roleLabelMap.get(layer.name.toLowerCase());
    if (nameMatch) {
      return buildBoundLayer(layer, nameMatch);
    }

    // 3. No role match — still a valid bound layer, just unbound
    return buildBoundLayer(layer, undefined);
  });
}

function buildBoundLayer<TElement extends LayerElement>(
  layer: Layer<TElement>,
  roleId: string | undefined,
): BoundLayer<TElement> {
  return {
    layer,
    roleId,
    intent: (layer.metadata?.[META_INTENT] as LayerIntent) ?? inferIntent(layer),
    influenceType: (layer.metadata?.[META_INFLUENCE_TYPE] as LayerInfluenceType) ?? inferInfluenceType(layer),
    influenceRegion: (layer.metadata?.[META_INFLUENCE_REGION] as string) ?? undefined,
  };
}

function inferIntent(layer: Layer): LayerIntent {
  if (layer.type === 'mask') return 'modify';
  if (layer.elements.length === 0) return 'generate';
  return 'preserve';
}

function inferInfluenceType(layer: Layer): LayerInfluenceType {
  if (layer.type === 'mask') return 'mask';
  if (layer.type === 'annotation' || layer.type === 'region') return 'structure';
  return 'content';
}

// ============================================================================
// Defaults from Roles
// ============================================================================

/**
 * Apply default zIndex values from role definitions to bound layers.
 * Only applies to layers that have a role binding and haven't been manually reordered.
 *
 * Returns a new stack with updated z-indices.
 */
export function applyRoleLayerDefaults<TElement extends LayerElement>(
  stack: LayerStack<TElement>,
  bindings: BoundLayer<TElement>[],
  roles: CompositionRoleDefinition[],
): LayerStack<TElement> {
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  const updatedLayers = stack.layers.map((layer) => {
    const binding = bindings.find((b) => b.layer.id === layer.id);
    if (!binding?.roleId) return layer;

    const role = roleMap.get(binding.roleId);
    if (!role) return layer;

    // Only apply default layer ordering if the layer hasn't been explicitly positioned
    const hasExplicitZ = layer.metadata?.['layer.explicitZIndex'] === true;
    if (hasExplicitZ) return layer;

    return { ...layer, zIndex: role.defaultLayer };
  });

  return { ...stack, layers: updatedLayers };
}

// ============================================================================
// Export to Composition Slots
// ============================================================================

/**
 * Convert bound layers into a CompositionSlotPolicy suitable for
 * the generation pipeline.
 *
 * Layers with roles become slots. Layers without roles are skipped.
 */
export function toBoundCompositionSlots(
  bindings: BoundLayer[],
): CompositionSlotPolicy {
  const required: string[] = [];
  const optional: string[] = [];
  const defaults: Record<string, CompositionSlotDefault> = {};

  for (const binding of bindings) {
    if (!binding.roleId) continue;
    if (!binding.layer.visible) continue;

    // Layers with elements are required; empty layers are optional
    if (binding.layer.elements.length > 0) {
      if (!required.includes(binding.roleId)) required.push(binding.roleId);
    } else {
      if (!optional.includes(binding.roleId) && !required.includes(binding.roleId)) {
        optional.push(binding.roleId);
      }
    }

    defaults[binding.roleId] = {
      intent: binding.intent as CompositionSlotDefault['intent'],
      layer: binding.layer.zIndex,
      influenceType: binding.influenceType as CompositionSlotDefault['influenceType'],
    };
  }

  return { required, optional, defaults };
}
