/**
 * Node Reference System
 *
 * Makes TemplateRef a first-class part of node data structure.
 * Nodes can declare refs that are:
 * - Validated at edit time
 * - Resolved to runtime IDs at execution time
 * - Tracked for cross-graph integrity
 *
 * This complements LinkConfig (which declares what refs a node TYPE supports)
 * by providing the runtime data structure for actual ref values.
 */

import type { TemplateKind, RuntimeKind, SyncDirection, TemplateRef } from '@pixsim7/shared.types';

// ============================================================================
// Node Reference Types
// ============================================================================

/**
 * Extended TemplateRef with additional context for node usage
 */
export interface NodeRef extends TemplateRef {
  /** Which field/purpose this ref serves (e.g., 'targetScene', 'npc', 'requiredCharacter') */
  role: string;

  /** Display label for UI */
  label?: string;

  /** Whether this ref is required for the node to function */
  required?: boolean;

  /** Runtime resolution hints */
  runtimeKind?: RuntimeKind;
  syncDirection?: SyncDirection;
}

/**
 * A collection of refs on a node
 */
export interface NodeRefs {
  /** Array of all refs on this node */
  refs: NodeRef[];
}

// ============================================================================
// Ref Helpers
// ============================================================================

/**
 * Create a scene ref
 */
export function sceneRef(
  templateId: string,
  role = 'targetScene',
  options?: Partial<NodeRef>
): NodeRef {
  return {
    templateKind: 'scene',
    templateId,
    role,
    label: options?.label ?? 'Scene',
    ...options,
  };
}

/**
 * Create a character instance ref
 */
export function characterRef(
  templateId: string,
  role = 'character',
  options?: Partial<NodeRef>
): NodeRef {
  return {
    templateKind: 'characterInstance',
    templateId,
    role,
    runtimeKind: 'npc',
    syncDirection: 'bidirectional',
    label: options?.label ?? 'Character',
    ...options,
  };
}

/**
 * Create a quest ref
 */
export function questRef(
  templateId: string,
  role = 'quest',
  options?: Partial<NodeRef>
): NodeRef {
  return {
    templateKind: 'quest',
    templateId,
    role,
    label: options?.label ?? 'Quest',
    ...options,
  };
}

/**
 * Create an arc ref
 */
export function arcRef(
  templateId: string,
  role = 'arc',
  options?: Partial<NodeRef>
): NodeRef {
  return {
    templateKind: 'arc',
    templateId,
    role,
    label: options?.label ?? 'Arc',
    ...options,
  };
}

/**
 * Create an item template ref
 */
export function itemRef(
  templateId: string,
  role = 'item',
  options?: Partial<NodeRef>
): NodeRef {
  return {
    templateKind: 'itemTemplate',
    templateId,
    role,
    runtimeKind: 'item',
    syncDirection: 'template_to_runtime',
    label: options?.label ?? 'Item',
    ...options,
  };
}

// ============================================================================
// Ref Operations
// ============================================================================

/**
 * Get a ref by role from a node's refs
 */
export function getRefByRole(refs: NodeRef[] | undefined, role: string): NodeRef | undefined {
  return refs?.find(r => r.role === role);
}

/**
 * Get all refs of a specific kind
 */
export function getRefsByKind(refs: NodeRef[] | undefined, kind: TemplateKind): NodeRef[] {
  return refs?.filter(r => r.templateKind === kind) ?? [];
}

/**
 * Get the template ID for a specific role (convenience for accessing ref values)
 */
export function getRefId(refs: NodeRef[] | undefined, role: string): string | undefined {
  return getRefByRole(refs, role)?.templateId;
}

/**
 * Set or update a ref by role
 */
export function setRef(refs: NodeRef[], ref: NodeRef): NodeRef[] {
  const existing = refs.findIndex(r => r.role === ref.role);
  if (existing >= 0) {
    const updated = [...refs];
    updated[existing] = ref;
    return updated;
  }
  return [...refs, ref];
}

/**
 * Remove a ref by role
 */
export function removeRef(refs: NodeRef[], role: string): NodeRef[] {
  return refs.filter(r => r.role !== role);
}

/**
 * Check if all required refs are present
 */
export function validateRequiredRefs(
  refs: NodeRef[] | undefined,
  requiredRoles: string[]
): { valid: boolean; missing: string[] } {
  const missing = requiredRoles.filter(role => !getRefByRole(refs, role)?.templateId);
  return {
    valid: missing.length === 0,
    missing,
  };
}

// ============================================================================
// Migration Helpers (for transitioning from plain IDs to refs)
// ============================================================================

/**
 * Extract refs from legacy node data that uses plain string ID fields
 * Use this to migrate existing nodes to the ref system
 */
export function extractRefsFromLegacyData(
  nodeData: Record<string, unknown>,
  fieldMappings: Array<{
    field: string;
    role: string;
    templateKind: TemplateKind;
    runtimeKind?: RuntimeKind;
  }>
): NodeRef[] {
  const refs: NodeRef[] = [];

  for (const mapping of fieldMappings) {
    const value = nodeData[mapping.field];
    if (typeof value === 'string' && value.length > 0) {
      refs.push({
        templateKind: mapping.templateKind,
        templateId: value,
        role: mapping.role,
        runtimeKind: mapping.runtimeKind,
      });
    }
  }

  return refs;
}

/**
 * Convert refs back to legacy field format
 * Use this for backwards compatibility
 */
export function refsToLegacyFields(
  refs: NodeRef[],
  fieldMappings: Array<{ role: string; field: string }>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const mapping of fieldMappings) {
    const ref = getRefByRole(refs, mapping.role);
    if (ref?.templateId) {
      result[mapping.field] = ref.templateId;
    }
  }

  return result;
}
