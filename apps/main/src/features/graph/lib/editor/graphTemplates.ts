import type { DraftSceneNode, DraftEdge } from '../../modules/scene-builder';
import { nodeTypeRegistry } from '@lib/registries';

/**
 * Template source type
 * - 'builtin': Shipped with the application (read-only)
 * - 'user': Created by the user (stored in localStorage)
 * - 'world': Stored in world metadata (per-world templates)
 */
export type TemplateSource = 'builtin' | 'user' | 'world';

/**
 * Template category for organization
 */
export type TemplateCategory =
  | 'Quest Flow'
  | 'Dialogue Branch'
  | 'Combat'
  | 'Minigame'
  | 'Relationship'
  | 'Condition Check'
  | 'Other';

/**
 * Template parameter definition for parameterized templates
 */
export interface TemplateParameter {
  /** Parameter ID (used for substitution) */
  id: string;
  /** Display name for the parameter */
  name: string;
  /** Parameter type */
  type: 'string' | 'number' | 'boolean';
  /** Default value */
  defaultValue: string | number | boolean;
  /** Description/help text */
  description?: string;
}

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
  updatedAt?: number; // Phase 6: Track last modification
  nodeTypes: string[]; // Involved node types for validation
  source?: TemplateSource; // Where the template comes from
  worldId?: number; // For world-scoped templates

  // Phase 6: Favorites
  isFavorite?: boolean;

  // Phase 7: Categories and tags
  category?: TemplateCategory;
  tags?: string[];

  // Phase 8: Preview
  preview?: string; // Data URL or base64 encoded SVG preview

  // Phase 10: Parameters
  parameters?: TemplateParameter[];

  // Phase 8: Preconditions for compatibility checking
  preconditions?: TemplatePreconditions;

  // Phase 9: Template pack ID
  packId?: string;

  data: {
    nodes: DraftSceneNode[];
    edges: DraftEdge[];
  };
}

/**
 * Phase 9: Template Pack - Collection of related templates
 *
 * Packs allow grouping templates for organization and bulk export/import
 */
export interface TemplatePack {
  id: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  createdAt: number;
  updatedAt?: number;
  worldId?: number; // Optional world scope
  tags?: string[];
  icon?: string; // Emoji or icon identifier

  // Pack metadata
  templateCount?: number; // Cached count, updated when templates change
}

/**
 * Phase 9: Template Pack with templates for export
 */
export interface TemplatePackExport {
  pack: TemplatePack;
  templates: GraphTemplate[];
}

/**
 * Phase 8: Template preconditions for validation
 *
 * Defines requirements that must be met before a template can be inserted
 */
export interface TemplatePreconditions {
  /** Required cast roles (e.g., ["protagonist", "mentor"]) */
  requiredRoles?: string[];

  /** Required arc IDs that must exist in the scene */
  requiredArcs?: string[];

  /** Required flags or variables (e.g., ["quest_started", "has_key"]) */
  requiredFlags?: string[];

  /** Minimum number of nodes the scene should have */
  minNodes?: number;

  /** Maximum number of nodes the scene should have */
  maxNodes?: number;

  /** Custom validation message */
  customMessage?: string;
}

/**
 * Selection data for creating a template
 */
export interface TemplateSelection {
  nodes: DraftSceneNode[];
  edges: DraftEdge[];
}

/**
 * Metadata for capturing a template
 */
export interface CaptureTemplateMetadata {
  name: string;
  description?: string;
  source?: TemplateSource;
  worldId?: number;
  category?: TemplateCategory;
  tags?: string[];
  parameters?: TemplateParameter[];
}

/**
 * Captures a selection of nodes and edges as a template
 */
export function captureTemplate(
  selection: TemplateSelection,
  metadata: CaptureTemplateMetadata
): GraphTemplate {
  const { nodes, edges } = selection;

  // Extract unique node types
  const nodeTypes = Array.from(new Set(nodes.map((n) => n.type)));

  const now = Date.now();

  // Create template with current timestamp
  const template: GraphTemplate = {
    id: `template_${now}_${Math.random().toString(36).substring(2, 9)}`,
    name: metadata.name,
    description: metadata.description,
    createdAt: now,
    updatedAt: now,
    nodeTypes,
    source: metadata.source || 'user',
    worldId: metadata.worldId,
    category: metadata.category,
    tags: metadata.tags || [],
    parameters: metadata.parameters,
    data: {
      nodes: JSON.parse(JSON.stringify(nodes)), // Deep clone
      edges: JSON.parse(JSON.stringify(edges)), // Deep clone
    },
  };

  // Generate preview
  template.preview = generateTemplatePreview(template);

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

  /** Parameter values for parameterized templates (Phase 10) */
  parameterValues?: Record<string, string | number | boolean>;
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
  const parameterValues = options.parameterValues || {};

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
    let clonedNode = JSON.parse(JSON.stringify(node)) as DraftSceneNode;

    // Phase 10: Apply parameter substitution
    if (template.parameters && template.parameters.length > 0) {
      clonedNode = substituteParameters(clonedNode, parameterValues);
    }

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

/**
 * Phase 8: Validate template preconditions against a scene
 *
 * Checks if the template's preconditions are met by the target scene
 */
export function validatePreconditions(
  template: GraphTemplate,
  scene: import('../../modules/scene-builder').DraftScene
): {
  compatible: boolean;
  errors: string[];
  warnings: string[];
  missingRoles?: string[];
  missingArcs?: string[];
  missingFlags?: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingRoles: string[] = [];
  const missingArcs: string[] = [];
  const missingFlags: string[] = [];

  // If no preconditions, always compatible
  if (!template.preconditions) {
    return {
      compatible: true,
      errors,
      warnings,
    };
  }

  const preconditions = template.preconditions;

  // Check node count constraints
  if (preconditions.minNodes !== undefined && scene.nodes.length < preconditions.minNodes) {
    warnings.push(
      `Scene has ${scene.nodes.length} nodes, but template recommends at least ${preconditions.minNodes}`
    );
  }

  if (preconditions.maxNodes !== undefined && scene.nodes.length > preconditions.maxNodes) {
    warnings.push(
      `Scene has ${scene.nodes.length} nodes, but template recommends at most ${preconditions.maxNodes}`
    );
  }

  // Check required roles
  // Note: We'll check scene.metadata for cast/roles information
  if (preconditions.requiredRoles && preconditions.requiredRoles.length > 0) {
    const sceneRoles = (scene.metadata?.cast as string[]) || [];
    preconditions.requiredRoles.forEach((role) => {
      if (!sceneRoles.includes(role)) {
        missingRoles.push(role);
      }
    });

    if (missingRoles.length > 0) {
      errors.push(
        `Template requires roles: ${missingRoles.join(', ')}. Add these roles to the scene metadata.`
      );
    }
  }

  // Check required arcs
  if (preconditions.requiredArcs && preconditions.requiredArcs.length > 0) {
    const sceneArcs = (scene.metadata?.arcs as string[]) || [];
    preconditions.requiredArcs.forEach((arc) => {
      if (!sceneArcs.includes(arc)) {
        missingArcs.push(arc);
      }
    });

    if (missingArcs.length > 0) {
      errors.push(
        `Template requires arcs: ${missingArcs.join(', ')}. Add these arcs to the scene metadata.`
      );
    }
  }

  // Check required flags
  if (preconditions.requiredFlags && preconditions.requiredFlags.length > 0) {
    const sceneFlags = (scene.metadata?.flags as string[]) || [];
    preconditions.requiredFlags.forEach((flag) => {
      if (!sceneFlags.includes(flag)) {
        missingFlags.push(flag);
      }
    });

    if (missingFlags.length > 0) {
      warnings.push(
        `Template expects flags: ${missingFlags.join(', ')}. Scene may not have expected context.`
      );
    }
  }

  // Custom message
  if (preconditions.customMessage) {
    warnings.push(preconditions.customMessage);
  }

  return {
    compatible: errors.length === 0,
    errors,
    warnings,
    missingRoles: missingRoles.length > 0 ? missingRoles : undefined,
    missingArcs: missingArcs.length > 0 ? missingArcs : undefined,
    missingFlags: missingFlags.length > 0 ? missingFlags : undefined,
  };
}

/**
 * Phase 10: Substitute template parameters in a node
 *
 * Replaces {{paramId}} placeholders in string fields with actual values
 */
function substituteParameters(
  node: DraftSceneNode,
  parameterValues: Record<string, string | number | boolean>
): DraftSceneNode {
  const nodeString = JSON.stringify(node);

  // Replace all {{paramId}} placeholders
  const substituted = nodeString.replace(/\{\{(\w+)\}\}/g, (match, paramId) => {
    if (paramId in parameterValues) {
      const value = parameterValues[paramId];
      // Escape the value for JSON if it's a string
      return typeof value === 'string' ? JSON.stringify(value).slice(1, -1) : String(value);
    }
    return match; // Keep placeholder if no value provided
  });

  return JSON.parse(substituted);
}

/**
 * Phase 8: Generate a simple SVG preview of a template
 *
 * Creates a miniature visual representation of the node layout
 */
export function generateTemplatePreview(template: GraphTemplate): string {
  const nodes = template.data.nodes;
  const edges = template.data.edges;

  if (nodes.length === 0) {
    return '';
  }

  // Calculate bounding box
  const positions = nodes
    .filter((n) => n.metadata?.position)
    .map((n) => n.metadata!.position!);

  if (positions.length === 0) {
    return '';
  }

  const minX = Math.min(...positions.map((p) => p.x));
  const maxX = Math.max(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const maxY = Math.max(...positions.map((p) => p.y));

  const width = maxX - minX + 200; // Add padding
  const height = maxY - minY + 100;

  // Scale to fit preview (max 200x150)
  const scale = Math.min(200 / width, 150 / height, 1);
  const viewWidth = width * scale;
  const viewHeight = height * scale;

  // Build SVG
  const svgParts: string[] = [
    `<svg width="200" height="150" viewBox="0 0 ${viewWidth} ${viewHeight}" xmlns="http://www.w3.org/2000/svg">`,
    '<rect width="100%" height="100%" fill="#f5f5f5"/>',
  ];

  // Draw edges
  edges.forEach((edge) => {
    const fromNode = nodes.find((n) => n.id === edge.from);
    const toNode = nodes.find((n) => n.id === edge.to);

    if (fromNode?.metadata?.position && toNode?.metadata?.position) {
      const x1 = (fromNode.metadata.position.x - minX + 100) * scale;
      const y1 = (fromNode.metadata.position.y - minY + 50) * scale;
      const x2 = (toNode.metadata.position.x - minX + 100) * scale;
      const y2 = (toNode.metadata.position.y - minY + 50) * scale;

      svgParts.push(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#999" stroke-width="1"/>`
      );
    }
  });

  // Draw nodes
  nodes.forEach((node) => {
    if (node.metadata?.position) {
      const x = (node.metadata.position.x - minX + 100) * scale;
      const y = (node.metadata.position.y - minY + 50) * scale;
      const nodeWidth = 60 * scale;
      const nodeHeight = 30 * scale;

      // Color based on node type
      let fill = '#6366f1'; // Default indigo
      if (node.type === 'dialogue') fill = '#3b82f6';
      if (node.type === 'choice') fill = '#8b5cf6';
      if (node.type === 'condition') fill = '#f59e0b';
      if (node.type === 'scene_call') fill = '#10b981';

      svgParts.push(
        `<rect x="${x - nodeWidth / 2}" y="${y - nodeHeight / 2}" width="${nodeWidth}" height="${nodeHeight}" fill="${fill}" rx="4"/>`
      );
    }
  });

  svgParts.push('</svg>');

  // Return as data URL
  const svgString = svgParts.join('');
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
}

/**
 * Phase 9: Export a template pack with all its templates
 */
export function exportTemplatePack(
  pack: TemplatePack,
  templates: GraphTemplate[]
): string {
  const packExport: TemplatePackExport = {
    pack: {
      ...pack,
      templateCount: templates.length,
    },
    templates: templates.map((t) => ({
      ...t,
      packId: pack.id, // Ensure templates reference this pack
    })),
  };

  return JSON.stringify(packExport, null, 2);
}

/**
 * Phase 9: Import a template pack from JSON
 */
export function importTemplatePack(jsonString: string): {
  pack: TemplatePack;
  templates: GraphTemplate[];
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    const parsed = JSON.parse(jsonString);

    // Validate structure
    if (!parsed.pack || !parsed.templates) {
      errors.push('Invalid pack format: missing pack or templates');
      return { pack: null as any, templates: [], valid: false, errors };
    }

    if (!parsed.pack.id || !parsed.pack.name) {
      errors.push('Invalid pack: missing id or name');
      return { pack: null as any, templates: [], valid: false, errors };
    }

    if (!Array.isArray(parsed.templates)) {
      errors.push('Invalid pack: templates must be an array');
      return { pack: null as any, templates: [], valid: false, errors };
    }

    // Validate each template
    parsed.templates.forEach((template: any, index: number) => {
      if (!template.id || !template.name) {
        errors.push(`Template ${index + 1}: missing id or name`);
      }
      if (!template.data || !Array.isArray(template.data.nodes) || !Array.isArray(template.data.edges)) {
        errors.push(`Template ${index + 1}: invalid data structure`);
      }
    });

    if (errors.length > 0) {
      return { pack: null as any, templates: [], valid: false, errors };
    }

    return {
      pack: parsed.pack,
      templates: parsed.templates,
      valid: true,
      errors: [],
    };
  } catch (error) {
    errors.push(`JSON parse error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { pack: null as any, templates: [], valid: false, errors };
  }
}

/**
 * Phase 9: Download template pack as JSON file
 */
export function downloadTemplatePack(pack: TemplatePack, templates: GraphTemplate[]): void {
  const jsonString = exportTemplatePack(pack, templates);
  const filename = `template-pack-${pack.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
