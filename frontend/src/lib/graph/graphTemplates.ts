import type { DraftSceneNode, DraftEdge } from '../../modules/scene-builder';
import { nodeTypeRegistry } from '@pixsim7/types';

/**
 * Graph Template - Reusable pattern of nodes and edges
 *
 * Templates allow designers to save and reuse common graph patterns
 * (e.g., "quest intro with branching outcomes", "flirt → success/fail → follow-up scene")
 */
export interface GraphTemplate {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  nodeTypes: string[]; // Involved node types for validation
  data: {
    nodes: DraftSceneNode[];
    edges: DraftEdge[];
  };
}

/**
 * Selection data for creating a template
 */
export interface TemplateSelection {
  nodes: DraftSceneNode[];
  edges: DraftEdge[];
}

/**
 * Captures a selection of nodes and edges as a template
 */
export function captureTemplate(
  selection: TemplateSelection,
  metadata: { name: string; description?: string }
): GraphTemplate {
  const { nodes, edges } = selection;

  // Extract unique node types
  const nodeTypes = Array.from(new Set(nodes.map((n) => n.type)));

  // Create template with current timestamp
  const template: GraphTemplate = {
    id: `template_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: metadata.name,
    description: metadata.description,
    createdAt: Date.now(),
    nodeTypes,
    data: {
      nodes: JSON.parse(JSON.stringify(nodes)), // Deep clone
      edges: JSON.parse(JSON.stringify(edges)), // Deep clone
    },
  };

  return template;
}

/**
 * Options for applying a template
 */
export interface ApplyTemplateOptions {
  /** Offset position for the template nodes (default: { x: 100, y: 100 }) */
  offsetPosition?: { x: number; y: number };

  /** Node ID prefix for generated nodes (default: template name slug) */
  nodeIdPrefix?: string;
}

/**
 * Apply template result
 */
export interface ApplyTemplateResult {
  nodes: DraftSceneNode[];
  edges: DraftEdge[];
  warnings: string[];
}

/**
 * Applies a template to create new nodes and edges with fresh IDs
 *
 * This function:
 * 1. Validates that all node types exist in the registry
 * 2. Clones nodes with new IDs
 * 3. Updates edge references to use new node IDs
 * 4. Applies position offset to nodes
 *
 * @param template The template to apply
 * @param options Application options
 * @returns New nodes, edges, and any warnings
 */
export function applyTemplate(
  template: GraphTemplate,
  options: ApplyTemplateOptions = {}
): ApplyTemplateResult {
  const warnings: string[] = [];
  const offsetPosition = options.offsetPosition || { x: 100, y: 100 };

  // Generate ID prefix from template name or use provided prefix
  const idPrefix = options.nodeIdPrefix ||
    template.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  // Validate node types
  const unknownTypes = template.nodeTypes.filter(
    (type) => !nodeTypeRegistry.has(type)
  );

  if (unknownTypes.length > 0) {
    warnings.push(
      `Unknown node types: ${unknownTypes.join(', ')}. These nodes will be skipped.`
    );
  }

  // Create mapping from old IDs to new IDs
  const idMap = new Map<string, string>();
  const timestamp = Date.now();

  template.data.nodes.forEach((node, index) => {
    const newId = `${idPrefix}_${timestamp}_${index}`;
    idMap.set(node.id, newId);
  });

  // Clone nodes with new IDs and positions
  const newNodes: DraftSceneNode[] = [];

  template.data.nodes.forEach((node) => {
    // Skip nodes with unknown types
    if (!nodeTypeRegistry.has(node.type)) {
      return;
    }

    const newId = idMap.get(node.id);
    if (!newId) return;

    // Clone node
    const clonedNode = JSON.parse(JSON.stringify(node)) as DraftSceneNode;

    // Update ID
    clonedNode.id = newId;

    // Update position if node has metadata.position
    if (clonedNode.metadata?.position) {
      clonedNode.metadata.position = {
        x: clonedNode.metadata.position.x + offsetPosition.x,
        y: clonedNode.metadata.position.y + offsetPosition.y,
      };
    }

    // Update label if present
    if (clonedNode.metadata?.label) {
      clonedNode.metadata.label = `${clonedNode.metadata.label} (from template)`;
    }

    newNodes.push(clonedNode);
  });

  // Clone edges with new node IDs
  const newEdges: DraftEdge[] = [];

  template.data.edges.forEach((edge) => {
    const newFromId = idMap.get(edge.from);
    const newToId = idMap.get(edge.to);

    // Only include edge if both nodes exist in the new set
    if (newFromId && newToId) {
      const clonedEdge = JSON.parse(JSON.stringify(edge)) as DraftEdge;

      // Generate new edge ID
      clonedEdge.id = `edge_${newFromId}_${newToId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      clonedEdge.from = newFromId;
      clonedEdge.to = newToId;

      newEdges.push(clonedEdge);
    }
  });

  return {
    nodes: newNodes,
    edges: newEdges,
    warnings,
  };
}

/**
 * Validates a template to ensure it can be applied
 */
export function validateTemplate(template: GraphTemplate): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for empty template
  if (template.data.nodes.length === 0) {
    errors.push('Template has no nodes');
  }

  // Validate node types
  const unknownTypes = template.nodeTypes.filter(
    (type) => !nodeTypeRegistry.has(type)
  );

  if (unknownTypes.length > 0) {
    warnings.push(
      `Unknown node types: ${unknownTypes.join(', ')}. These nodes will be skipped.`
    );
  }

  // Check for orphaned edges (edges referencing non-existent nodes)
  const nodeIds = new Set(template.data.nodes.map((n) => n.id));
  const orphanedEdges = template.data.edges.filter(
    (edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to)
  );

  if (orphanedEdges.length > 0) {
    warnings.push(
      `Template has ${orphanedEdges.length} orphaned edge(s) that reference non-existent nodes`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
