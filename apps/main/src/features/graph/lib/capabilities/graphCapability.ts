/**
 * Graph Feature ContextHub Capability
 *
 * Exposes graph actions and context to other systems via ContextHub.
 * This allows external components to interact with the graph editor
 * without direct coupling.
 *
 * @module graph/capabilities
 */

import type { CapabilityKey, CapabilityProvider } from "@pixsim7/shared.capabilities.core";
import type { SceneIdRef } from '@pixsim7/shared.types';

import { registerCapabilityDescriptor } from '@features/contextHub/domain/descriptorRegistry';

// ============================================================================
// Capability Key
// ============================================================================

export const CAP_GRAPH_ACTIONS = 'graphActions' as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Position for inserting nodes.
 */
export interface GraphNodePosition {
  x: number;
  y: number;
}

/**
 * Options for inserting a node.
 */
export interface InsertNodeOptions {
  /** Node type ID from the node type registry */
  nodeTypeId: string;
  /** Position to insert at */
  position: GraphNodePosition;
  /** Initial metadata for the node */
  metadata?: Record<string, unknown>;
  /** Whether to select the node after insertion */
  select?: boolean;
}

/**
 * Result of inserting a node.
 */
export interface InsertNodeResult {
  success: boolean;
  nodeId?: string;
  error?: string;
}

/**
 * Ref validation result.
 */
export interface RefValidationResult {
  ref: string;
  valid: boolean;
  entityType?: string;
  error?: string;
}

/**
 * Graph actions capability context.
 *
 * Exposes graph operations that other systems can invoke.
 */
export interface GraphActionsContext {
  /**
   * Open a scene in the graph editor.
   *
   * @param sceneId - Scene ID to open (number, string, or SceneIdRef)
   * @returns true if scene was opened successfully
   */
  openScene: (sceneId: string | number | SceneIdRef) => boolean;

  /**
   * Insert a new node into the current scene.
   *
   * @param options - Node insertion options
   * @returns Result with node ID on success
   */
  insertNode: (options: InsertNodeOptions) => InsertNodeResult;

  /**
   * Validate entity refs against the current graph context.
   *
   * @param refs - Array of ref strings to validate
   * @returns Validation results for each ref
   */
  validateRefs: (refs: string[]) => RefValidationResult[];

  /**
   * Get the current scene ID.
   */
  getCurrentSceneId: () => string | null;

  /**
   * Get available node types for insertion.
   */
  getAvailableNodeTypes: () => Array<{
    id: string;
    name: string;
    category: string;
    icon?: string;
    userCreatable: boolean;
  }>;

  /**
   * Whether the graph editor is currently active.
   */
  isActive: boolean;

  /**
   * Scene ref for the current scene (if any).
   */
  sceneRef?: SceneIdRef | null;
}

// ============================================================================
// Register Descriptor
// ============================================================================

registerCapabilityDescriptor({
  key: CAP_GRAPH_ACTIONS,
  label: 'Graph Actions',
  description: 'Actions and context for the scene graph editor.',
  kind: 'action',
  source: 'contextHub',
});

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Create a graph actions capability provider.
 *
 * This should be called by the graph editor host component to register
 * its actions with ContextHub.
 *
 * @param context - Graph actions context implementation
 * @param options - Provider options
 * @returns CapabilityProvider for registration
 */
export function createGraphActionsProvider(
  context: GraphActionsContext,
  options?: {
    id?: string;
    priority?: number;
  }
): CapabilityProvider<GraphActionsContext> {
  return {
    id: options?.id ?? 'graph-editor',
    label: 'Graph Editor',
    description: 'Scene graph editing actions',
    priority: options?.priority ?? 10,
    exposeToContextMenu: false,
    isAvailable: () => context.isActive,
    getValue: () => context,
  };
}

// ============================================================================
// Null Provider (for when graph is not active)
// ============================================================================

/**
 * Null/inactive graph actions context.
 * Used when no graph editor is active.
 */
export const nullGraphActionsContext: GraphActionsContext = {
  openScene: () => false,
  insertNode: () => ({ success: false, error: 'Graph editor not active' }),
  validateRefs: () => [],
  getCurrentSceneId: () => null,
  getAvailableNodeTypes: () => [],
  isActive: false,
  sceneRef: null,
};

// ============================================================================
// Re-exports
// ============================================================================

export type { CapabilityProvider, CapabilityKey };
