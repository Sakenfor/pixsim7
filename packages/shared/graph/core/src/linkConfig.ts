/**
 * Link Configuration for Graph Nodes
 *
 * Provides a declarative way for node types to specify what external
 * entities they reference. This allows automatic link extraction and
 * resolution across all graph types.
 *
 * Similar to PortConfig for sockets, LinkConfig declares the linking
 * capabilities of a node type.
 */

import type { TemplateKind, RuntimeKind, SyncDirection } from '@pixsim7/shared.types';

// ============================================================================
// Link Field Definition
// ============================================================================

/**
 * Defines a single linkable field in a node's data
 */
export interface LinkFieldDefinition {
  /** Dot-notation path to the field (e.g., "npc.id", "sceneId", "requirements[].characterId") */
  path: string;

  /** Human-readable label for this link */
  label: string;

  /** Template entity kind this field references */
  templateKind: TemplateKind;

  /** Expected runtime entity kind (for resolution) */
  runtimeKind?: RuntimeKind;

  /** Sync direction preference */
  syncDirection?: SyncDirection;

  /** Whether this link is required for the node to function */
  required?: boolean;

  /** Whether this field can contain multiple references (array) */
  isArray?: boolean;

  /** Description of what this link represents */
  description?: string;
}

/**
 * Link configuration for a node type
 */
export interface LinkConfig {
  /** Static link field definitions */
  fields?: LinkFieldDefinition[];

  /**
   * Dynamic link extractor for complex cases
   * Use when links depend on node data structure
   */
  dynamic?: (nodeData: unknown) => LinkFieldDefinition[];
}

// ============================================================================
// Resolved Link Types
// ============================================================================

/**
 * A resolved link extracted from a node
 */
export interface ExtractedLink {
  /** The field definition that produced this link */
  field: LinkFieldDefinition;

  /** The actual template ID value from the node */
  templateId: string;

  /** Path where this value was found (may differ from field.path for arrays) */
  actualPath: string;
}

/**
 * Result of extracting links from a node
 */
export interface NodeLinkExtractionResult {
  /** All extracted links */
  links: ExtractedLink[];

  /** Missing required links */
  missingRequired: LinkFieldDefinition[];

  /** Whether all required links are present */
  isComplete: boolean;
}

// ============================================================================
// Common Link Field Helpers
// ============================================================================

/**
 * Create a scene reference link field
 */
export function sceneRefField(
  path = 'sceneId',
  options?: Partial<LinkFieldDefinition>
): LinkFieldDefinition {
  return {
    path,
    label: 'Scene',
    templateKind: 'scene',
    description: 'Referenced scene',
    ...options,
  };
}

/**
 * Create a character instance reference link field
 */
export function characterRefField(
  path = 'characterInstanceId',
  options?: Partial<LinkFieldDefinition>
): LinkFieldDefinition {
  return {
    path,
    label: 'Character',
    templateKind: 'characterInstance',
    runtimeKind: 'npc',
    syncDirection: 'bidirectional',
    description: 'Referenced character instance',
    ...options,
  };
}

/**
 * Create an item template reference link field
 */
export function itemRefField(
  path = 'itemTemplateId',
  options?: Partial<LinkFieldDefinition>
): LinkFieldDefinition {
  return {
    path,
    label: 'Item',
    templateKind: 'itemTemplate',
    runtimeKind: 'item',
    syncDirection: 'template_to_runtime',
    description: 'Referenced item template',
    ...options,
  };
}

/**
 * Create a quest reference link field
 */
export function questRefField(
  path = 'questId',
  options?: Partial<LinkFieldDefinition>
): LinkFieldDefinition {
  return {
    path,
    label: 'Quest',
    templateKind: 'quest',
    description: 'Referenced quest',
    ...options,
  };
}

/**
 * Create an arc reference link field
 */
export function arcRefField(
  path = 'arcId',
  options?: Partial<LinkFieldDefinition>
): LinkFieldDefinition {
  return {
    path,
    label: 'Arc',
    templateKind: 'arc',
    description: 'Referenced story arc',
    ...options,
  };
}

/**
 * Create an NPC reference link field (shorthand for character with npc.id path)
 */
export function npcRefField(
  path = 'npc.id',
  options?: Partial<LinkFieldDefinition>
): LinkFieldDefinition {
  return characterRefField(path, { label: 'NPC', ...options });
}

// ============================================================================
// Link Extraction
// ============================================================================

import { nodeTypeRegistry } from './nodeTypeRegistry';

/**
 * Get value at a dot-notation path from an object
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Check if a value is a valid template ID (non-empty string, optionally UUID)
 */
function isValidTemplateId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Extract links from a node based on its type's LinkConfig
 */
export function extractLinksFromNode(
  nodeType: string,
  nodeData: unknown
): NodeLinkExtractionResult {
  const result: NodeLinkExtractionResult = {
    links: [],
    missingRequired: [],
    isComplete: true,
  };

  // Get node type definition
  const nodeTypeDef = nodeTypeRegistry.getSync(nodeType);
  if (!nodeTypeDef?.links) {
    return result;
  }

  const linkConfig = nodeTypeDef.links;

  // Get all field definitions (static + dynamic)
  let fields: LinkFieldDefinition[] = linkConfig.fields || [];
  if (linkConfig.dynamic) {
    fields = [...fields, ...linkConfig.dynamic(nodeData)];
  }

  // Extract links from each field
  for (const field of fields) {
    if (field.isArray) {
      // Handle array fields (e.g., "requirements[].characterId")
      const arrayPath = field.path.replace(/\[\]\..*$/, '');
      const itemPath = field.path.replace(/^.*\[\]\./, '');
      const arrayValue = getValueAtPath(nodeData, arrayPath);

      if (Array.isArray(arrayValue)) {
        arrayValue.forEach((item, index) => {
          const value = getValueAtPath(item, itemPath);
          if (isValidTemplateId(value)) {
            result.links.push({
              field,
              templateId: value,
              actualPath: `${arrayPath}[${index}].${itemPath}`,
            });
          }
        });
      }

      // Check if required array has at least one valid link
      if (field.required && !result.links.some(l => l.field === field)) {
        result.missingRequired.push(field);
        result.isComplete = false;
      }
    } else {
      // Handle scalar fields
      const value = getValueAtPath(nodeData, field.path);

      if (isValidTemplateId(value)) {
        result.links.push({
          field,
          templateId: value,
          actualPath: field.path,
        });
      } else if (field.required) {
        result.missingRequired.push(field);
        result.isComplete = false;
      }
    }
  }

  return result;
}

/**
 * Get all link field definitions for a node type
 */
export function getNodeLinkFields(
  nodeType: string,
  nodeData?: unknown
): LinkFieldDefinition[] {
  const nodeTypeDef = nodeTypeRegistry.getSync(nodeType);
  if (!nodeTypeDef?.links) {
    return [];
  }

  const linkConfig = nodeTypeDef.links;
  let fields: LinkFieldDefinition[] = linkConfig.fields || [];

  if (linkConfig.dynamic && nodeData !== undefined) {
    fields = [...fields, ...linkConfig.dynamic(nodeData)];
  }

  return fields;
}

/**
 * Check if a node type has any link configuration
 */
export function nodeTypeHasLinks(nodeType: string): boolean {
  const nodeTypeDef = nodeTypeRegistry.getSync(nodeType);
  return !!(nodeTypeDef?.links?.fields?.length || nodeTypeDef?.links?.dynamic);
}
