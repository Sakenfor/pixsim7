/**
 * Routine Graph Conversion
 *
 * Pure functions to convert between frontend RoutineGraph shapes (with position,
 * label, edge ids) and backend shapes (which lack those fields).
 *
 * Strategy: stash frontend-only fields in `meta.__editor` for round-tripping.
 * The backend's Pydantic schemas use `extra="ignore"` at top level, so position/label
 * sent at top level would be silently dropped. `meta` is a free-form dict that survives.
 */
import type {
  BackendRoutineGraph,
  BackendRoutineNode,
  BackendRoutineEdge,
} from '@lib/api/gameBehavior';

import type {
  RoutineGraph,
  RoutineNode,
  RoutineEdge,
} from '../types';

// ============================================================================
// Editor metadata shape stored in meta.__editor
// ============================================================================

interface NodeEditorMeta {
  position: { x: number; y: number };
  label?: string;
}

interface EdgeEditorMeta {
  id: string;
  label?: string;
}

// ============================================================================
// Frontend → Backend
// ============================================================================

/** Convert a frontend RoutineGraph to the backend-compatible shape. */
export function toBackendGraph(graph: RoutineGraph): BackendRoutineGraph {
  return {
    id: graph.id,
    version: graph.version,
    name: graph.name,
    nodes: graph.nodes.map(toBackendNode),
    edges: graph.edges.map(toBackendEdgeNew),
    startNodeId: graph.startNodeId,
    defaultPreferences: graph.defaultPreferences as Record<string, unknown> | undefined,
    meta: graph.meta,
  };
}

function toBackendNode(node: RoutineNode): BackendRoutineNode {
  const editorMeta: NodeEditorMeta = {
    position: node.position,
    ...(node.label != null ? { label: node.label } : {}),
  };

  return {
    id: node.id,
    nodeType: node.nodeType,
    timeRangeSeconds: node.timeRangeSeconds,
    preferredActivities: node.preferredActivities,
    decisionConditions: node.decisionConditions,
    meta: {
      ...node.meta,
      __editor: editorMeta,
    },
  };
}

function toBackendEdgeNew(edge: RoutineEdge): BackendRoutineEdge {
  const editorMeta: EdgeEditorMeta = {
    id: edge.id,
    ...(edge.label != null ? { label: edge.label } : {}),
  };

  return {
    fromNodeId: edge.from,
    toNodeId: edge.to,
    conditions: edge.conditions,
    weight: edge.weight,
    transitionEffects: edge.transitionEffects as Record<string, unknown> | undefined,
    meta: {
      ...edge.meta,
      __editor: editorMeta,
    },
  };
}

// ============================================================================
// Backend → Frontend
// ============================================================================

/** Default auto-layout: stack nodes vertically with some spacing. */
const AUTO_LAYOUT_X = 100;
const AUTO_LAYOUT_Y_START = 80;
const AUTO_LAYOUT_Y_STEP = 140;

let _edgeIdCounter = 0;
function generateFallbackEdgeId(): string {
  return `edge_restored_${Date.now()}_${_edgeIdCounter++}`;
}

/** Convert a backend routine graph to frontend shape, restoring editor metadata. */
export function fromBackendGraph(backend: BackendRoutineGraph): RoutineGraph {
  return {
    id: backend.id,
    version: backend.version,
    name: backend.name,
    nodes: backend.nodes.map((node, idx) => fromBackendNode(node, idx)),
    edges: backend.edges.map(fromBackendEdgeNew),
    startNodeId: backend.startNodeId,
    defaultPreferences: backend.defaultPreferences as RoutineGraph['defaultPreferences'],
    meta: stripEditorMeta(backend.meta),
  };
}

function fromBackendNode(node: BackendRoutineNode, index: number): RoutineNode {
  const editor = (node.meta?.__editor ?? {}) as Partial<NodeEditorMeta>;

  const position = editor.position ?? {
    x: AUTO_LAYOUT_X,
    y: AUTO_LAYOUT_Y_START + index * AUTO_LAYOUT_Y_STEP,
  };

  return {
    id: node.id,
    nodeType: node.nodeType as RoutineNode['nodeType'],
    position,
    timeRangeSeconds: node.timeRangeSeconds,
    preferredActivities: node.preferredActivities as RoutineNode['preferredActivities'],
    decisionConditions: node.decisionConditions as RoutineNode['decisionConditions'],
    label: editor.label,
    meta: stripEditorMeta(node.meta),
  };
}

function fromBackendEdgeNew(edge: BackendRoutineEdge): RoutineEdge {
  const editor = (edge.meta?.__editor ?? {}) as Partial<EdgeEditorMeta>;

  return {
    id: editor.id ?? generateFallbackEdgeId(),
    from: edge.fromNodeId,
    to: edge.toNodeId,
    conditions: edge.conditions as RoutineEdge['conditions'],
    weight: edge.weight,
    transitionEffects: edge.transitionEffects as RoutineEdge['transitionEffects'],
    label: editor.label,
    meta: stripEditorMeta(edge.meta),
  };
}

/** Remove __editor key from meta dict so it doesn't leak into the domain model. */
function stripEditorMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return meta;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { __editor, ...rest } = meta;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

// ============================================================================
// Batch conversion: Record<id, BackendRoutineGraph> → Record<id, RoutineGraph>
// ============================================================================

/**
 * Convert a record of backend routines to frontend shapes.
 * Skips malformed entries (missing id/nodes) with a console warning.
 */
export function fromBackendRoutines(
  record: Record<string, BackendRoutineGraph>,
): Record<string, RoutineGraph> {
  const result: Record<string, RoutineGraph> = {};

  for (const [key, raw] of Object.entries(record)) {
    if (!raw || typeof raw !== 'object') {
      console.warn(`[routineGraphConversion] Skipping malformed routine "${key}": not an object`);
      continue;
    }
    if (!raw.id || !Array.isArray(raw.nodes)) {
      console.warn(`[routineGraphConversion] Skipping malformed routine "${key}": missing id or nodes`);
      continue;
    }
    try {
      result[key] = fromBackendGraph(raw);
    } catch (err) {
      console.warn(`[routineGraphConversion] Skipping routine "${key}" due to conversion error:`, err);
    }
  }

  return result;
}
