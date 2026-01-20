/**
 * ObjectLink Integration for Graph Nodes
 *
 * Provides utilities for creating template↔runtime links from graph node data.
 * Used during runtime conversion to emit linking information.
 *
 * @module graph/refs/objectLinks
 */

 

import {
  createMappingId,
  createTemplateRefKey,
} from '@pixsim7/core.links';
import type {
  TemplateRef,
  TemplateKind,
  RuntimeKind,
  SyncDirection,
} from '@pixsim7/shared.types';

import { isUUID } from './graphRefs';

// ============================================================================
// Types
// ============================================================================

/**
 * Partial ObjectLink for node-level linking.
 * Used when a node references a template entity.
 */
export interface NodeLinkInfo {
  /** Template entity kind */
  templateKind: TemplateKind;
  /** Template entity ID (usually UUID) */
  templateId: string;
  /** Expected runtime entity kind */
  runtimeKind?: RuntimeKind;
  /** Sync direction preference */
  syncDirection?: SyncDirection;
  /** Additional metadata */
  meta?: Record<string, unknown>;
}

/**
 * Full link resolution result.
 */
export interface ResolvedLink {
  /** The template reference */
  templateRef: TemplateRef;
  /** Cache key for the template ref */
  refKey: string;
  /** Mapping ID (e.g., "characterInstance->npc") */
  mappingId?: string;
  /** Runtime entity ID if resolved */
  runtimeId?: number;
}

// ============================================================================
// Link Creation Helpers
// ============================================================================

/**
 * Create a TemplateRef from node link info.
 */
export function createTemplateRef(info: NodeLinkInfo): TemplateRef {
  return {
    templateKind: info.templateKind,
    templateId: info.templateId,
  };
}

/**
 * Create a link info object from an NPC node's character instance reference.
 *
 * @param instanceId - Character instance UUID
 * @param meta - Optional metadata to include
 * @returns NodeLinkInfo for the character→NPC link
 */
export function createNpcLinkInfo(
  instanceId: string,
  meta?: Record<string, unknown>
): NodeLinkInfo | null {
  if (!instanceId || !isUUID(instanceId)) {
    return null;
  }

  return {
    templateKind: 'characterInstance',
    templateId: instanceId,
    runtimeKind: 'npc',
    syncDirection: 'bidirectional',
    meta,
  };
}

/**
 * Create a link info object from an item template reference.
 *
 * @param templateId - Item template UUID
 * @param meta - Optional metadata to include
 * @returns NodeLinkInfo for the itemTemplate→item link
 */
export function createItemLinkInfo(
  templateId: string,
  meta?: Record<string, unknown>
): NodeLinkInfo | null {
  if (!templateId || !isUUID(templateId)) {
    return null;
  }

  return {
    templateKind: 'itemTemplate',
    templateId: templateId,
    runtimeKind: 'item',
    syncDirection: 'template_to_runtime',
    meta,
  };
}

/**
 * Create a link info object from a prop template reference.
 *
 * @param templateId - Prop template UUID
 * @param meta - Optional metadata to include
 * @returns NodeLinkInfo for the propTemplate→prop link
 */
export function createPropLinkInfo(
  templateId: string,
  meta?: Record<string, unknown>
): NodeLinkInfo | null {
  if (!templateId || !isUUID(templateId)) {
    return null;
  }

  return {
    templateKind: 'propTemplate',
    templateId: templateId,
    runtimeKind: 'prop',
    syncDirection: 'template_to_runtime',
    meta,
  };
}

// ============================================================================
// Link Resolution
// ============================================================================

/**
 * Resolve a NodeLinkInfo to a full ResolvedLink.
 *
 * @param info - Node link info
 * @returns Resolved link with ref key and mapping ID
 */
export function resolveLinkInfo(info: NodeLinkInfo): ResolvedLink {
  const templateRef = createTemplateRef(info);
  const refKey = createTemplateRefKey(info.templateKind, info.templateId);
  const mappingId = info.runtimeKind
    ? createMappingId(info.templateKind, info.runtimeKind)
    : undefined;

  return {
    templateRef,
    refKey,
    mappingId,
  };
}

/**
 * Extract all link infos from a node's metadata.
 *
 * Scans common fields for template references and returns link info for each.
 * This is a generic helper that can be extended for specific node types.
 *
 * @param metadata - Node metadata object
 * @returns Array of discovered link infos
 */
export function extractLinksFromMetadata(
  metadata: Record<string, unknown> | undefined
): NodeLinkInfo[] {
  if (!metadata) return [];

  const links: NodeLinkInfo[] = [];

  // Check for NPC reference (npc.id or characterInstanceId)
  const npcData = metadata.npc as Record<string, unknown> | undefined;
  if (npcData?.id && typeof npcData.id === 'string' && isUUID(npcData.id)) {
    const linkInfo = createNpcLinkInfo(npcData.id, { nodePath: 'npc.id' });
    if (linkInfo) links.push(linkInfo);
  }

  if (metadata.characterInstanceId && typeof metadata.characterInstanceId === 'string') {
    const linkInfo = createNpcLinkInfo(metadata.characterInstanceId, {
      nodePath: 'characterInstanceId',
    });
    if (linkInfo) links.push(linkInfo);
  }

  // Check for item template reference
  if (metadata.itemTemplateId && typeof metadata.itemTemplateId === 'string') {
    const linkInfo = createItemLinkInfo(metadata.itemTemplateId, {
      nodePath: 'itemTemplateId',
    });
    if (linkInfo) links.push(linkInfo);
  }

  // Check for prop template reference
  if (metadata.propTemplateId && typeof metadata.propTemplateId === 'string') {
    const linkInfo = createPropLinkInfo(metadata.propTemplateId, {
      nodePath: 'propTemplateId',
    });
    if (linkInfo) links.push(linkInfo);
  }

  return links;
}

// ============================================================================
// Runtime Payload Builders
// ============================================================================

/**
 * Build template refs array for runtime node payload.
 *
 * Use this in toRuntime() to add template linking info to runtime nodes.
 *
 * @param links - Array of link infos from the node
 * @returns Array of TemplateRef objects for runtime payload
 */
export function buildRuntimeTemplateRefs(links: NodeLinkInfo[]): TemplateRef[] {
  return links.map(createTemplateRef);
}

/**
 * Build link metadata for runtime node payload.
 *
 * Creates a map of refKey -> linkInfo for easy lookup at runtime.
 *
 * @param links - Array of link infos from the node
 * @returns Map of ref keys to link metadata
 */
export function buildRuntimeLinkMap(
  links: NodeLinkInfo[]
): Record<string, { mappingId?: string; syncDirection?: SyncDirection }> {
  const map: Record<string, { mappingId?: string; syncDirection?: SyncDirection }> = {};

  for (const link of links) {
    const resolved = resolveLinkInfo(link);
    map[resolved.refKey] = {
      mappingId: resolved.mappingId,
      syncDirection: link.syncDirection,
    };
  }

  return map;
}

// ============================================================================
// Re-exports from @pixsim7/shared.types and @pixsim7/core.links
// ============================================================================

export type { TemplateRef, TemplateKind, RuntimeKind, SyncDirection } from '@pixsim7/shared.types';
export {
  createMappingId,
  createTemplateRefKey,
  parseTemplateRefKey,
} from '@pixsim7/core.links';
