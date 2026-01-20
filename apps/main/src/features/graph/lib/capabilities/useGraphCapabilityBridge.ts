/**
 * Graph Capability Bridge Hook
 *
 * Registers graph actions with ContextHub when the graph editor is active.
 * This hook should be called from the graph editor host component.
 *
 * @module graph/capabilities
 */

import type { SceneIdRef } from '@pixsim7/shared.types';
import { useEffect, useMemo, useRef, useCallback } from 'react';


import { useContextHubState } from '@features/contextHub/hooks/contextHubContext';

import { useGraphStore } from '../../stores/graphStore';
import { sceneNodeTypeRegistry } from '../nodeTypes/sceneRegistry';
import { normalizeSceneRef, extractSceneIdFromRef } from '../refs/graphRefs';
import { tryParseEntityRef } from '../refs/graphRefs';

import {
  CAP_GRAPH_ACTIONS,
  createGraphActionsProvider,
  type GraphActionsContext,
  type InsertNodeOptions,
  type InsertNodeResult,
  type RefValidationResult,
} from './graphCapability';

// ============================================================================
// Types
// ============================================================================

export interface UseGraphCapabilityBridgeOptions {
  /** Whether the graph editor is currently active/mounted */
  isActive?: boolean;
  /** Custom provider ID */
  providerId?: string;
  /** Provider priority */
  priority?: number;
}

export interface UseGraphCapabilityBridgeResult {
  /** The graph actions context (can be passed to children) */
  context: GraphActionsContext;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to register graph actions with ContextHub.
 *
 * Call this from your graph editor host component to expose graph actions
 * to other systems via ContextHub.
 *
 * @example
 * ```tsx
 * function GraphEditorHost() {
 *   const { context } = useGraphCapabilityBridge({ isActive: true });
 *   // context is automatically registered with ContextHub
 *   return <GraphEditor />;
 * }
 * ```
 */
export function useGraphCapabilityBridge(
  options: UseGraphCapabilityBridgeOptions = {}
): UseGraphCapabilityBridgeResult {
  const { isActive = true, providerId, priority } = options;

  const hub = useContextHubState();
  const disposerRef = useRef<(() => void) | null>(null);

  // Get graph store actions
  const loadScene = useGraphStore((s) => s.loadScene);
  const getCurrentSceneId = useGraphStore((s) => s.currentSceneId);
  const addNode = useGraphStore((s) => s.addNode);

  // Build the actions context
  const openScene = useCallback(
    (sceneId: string | number | SceneIdRef): boolean => {
      // Try to normalize to a scene ref
      const normalized = normalizeSceneRef(sceneId);

      if (normalized.success) {
        const id = extractSceneIdFromRef(normalized.ref);
        if (id !== null) {
          // For internal scenes, we use the string scene ID directly
          // The store uses string IDs, not the numeric database IDs
          loadScene(String(typeof normalized.rawValue === 'number' ? normalized.rawValue : sceneId));
          return true;
        }
      }

      // Fallback: try using the raw value as a string scene ID
      if (typeof sceneId === 'string') {
        loadScene(sceneId);
        return true;
      }

      return false;
    },
    [loadScene]
  );

  const insertNode = useCallback(
    (opts: InsertNodeOptions): InsertNodeResult => {
      const currentSceneId = getCurrentSceneId;
      if (!currentSceneId) {
        return { success: false, error: 'No scene is currently open' };
      }

      // Validate node type exists
      const typeDef = sceneNodeTypeRegistry.getSync(opts.nodeTypeId);
      if (!typeDef) {
        return { success: false, error: `Unknown node type: ${opts.nodeTypeId}` };
      }

      if (!typeDef.userCreatable) {
        return { success: false, error: `Node type ${opts.nodeTypeId} is not user-creatable` };
      }

      // Generate node ID
      const nodeId = `${opts.nodeTypeId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Create the node
      const newNode = {
        id: nodeId,
        type: opts.nodeTypeId,
        metadata: {
          ...typeDef.defaultData,
          ...opts.metadata,
          position: opts.position,
          label: opts.metadata?.label ?? typeDef.name,
        },
      };

      try {
        addNode(newNode);
        return { success: true, nodeId };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to insert node',
        };
      }
    },
    [getCurrentSceneId, addNode]
  );

  const validateRefs = useCallback((refs: string[]): RefValidationResult[] => {
    return refs.map((ref) => {
      const parsed = tryParseEntityRef(ref);
      if (!parsed) {
        return { ref, valid: false, error: 'Invalid ref format' };
      }
      return {
        ref,
        valid: true,
        entityType: parsed.type,
      };
    });
  }, []);

  const getAvailableNodeTypes = useCallback(() => {
    const types = sceneNodeTypeRegistry.getAllSync();
    return types
      .filter((t) => t.userCreatable)
      .map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        icon: t.icon,
        userCreatable: t.userCreatable ?? true,
      }));
  }, []);

  // Compute current scene ref
  const currentSceneRef = useMemo((): SceneIdRef | null => {
    const sceneId = getCurrentSceneId;
    if (!sceneId) return null;

    // Try to normalize the scene ID to a ref
    const normalized = normalizeSceneRef(sceneId);
    return normalized.success ? normalized.ref : null;
  }, [getCurrentSceneId]);

  // Build the context
  const context = useMemo(
    (): GraphActionsContext => ({
      openScene,
      insertNode,
      validateRefs,
      getCurrentSceneId: () => getCurrentSceneId,
      getAvailableNodeTypes,
      isActive,
      sceneRef: currentSceneRef,
    }),
    [openScene, insertNode, validateRefs, getCurrentSceneId, getAvailableNodeTypes, isActive, currentSceneRef]
  );

  // Get root hub for registration
  const rootHub = useMemo(() => {
    let current = hub;
    while (current?.parent) {
      current = current.parent;
    }
    return current;
  }, [hub]);

  // Register/unregister capability
  useEffect(() => {
    if (!rootHub || !isActive) {
      // Clean up if we become inactive
      if (disposerRef.current) {
        disposerRef.current();
        disposerRef.current = null;
      }
      return;
    }

    // Create provider
    const provider = createGraphActionsProvider(context, {
      id: providerId,
      priority,
    });

    // Register with root hub
    const dispose = rootHub.registry.register(CAP_GRAPH_ACTIONS, provider);
    disposerRef.current = dispose;

    return () => {
      dispose();
      disposerRef.current = null;
    };
  }, [rootHub, isActive, context, providerId, priority]);

  return { context };
}
