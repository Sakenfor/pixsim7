/**
 * Links Runtime Helpers
 *
 * Runtime logic for template↔runtime links (ObjectLink system).
 * Types are imported from @pixsim7/shared.types.
 */
import type { ObjectLink, ParsedMappingId } from '@pixsim7/shared.types';

// ===================
// Helper Functions
// ===================

/**
 * Helper to extract template/runtime kinds from mapping ID
 *
 * Mapping ID format: "templateKind->runtimeKind" (e.g., "characterInstance->npc")
 *
 * @param mappingId - Mapping ID string
 * @returns Parsed template and runtime kinds
 */
export function parseMappingId(mappingId: string): ParsedMappingId {
  const parts = mappingId.split('->');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid mapping ID format: "${mappingId}". Expected "templateKind->runtimeKind"`
    );
  }
  const [templateKind, runtimeKind] = parts;
  return { templateKind, runtimeKind };
}

/**
 * Type guard to check if a value is a valid ObjectLink
 */
export function isObjectLink(value: unknown): value is ObjectLink {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const link = value as Partial<ObjectLink>;

  return (
    typeof link.linkId === 'string' &&
    typeof link.templateKind === 'string' &&
    typeof link.templateId === 'string' &&
    typeof link.runtimeKind === 'string' &&
    (typeof link.runtimeId === 'number' || typeof link.runtimeId === 'string') &&
    typeof link.syncEnabled === 'boolean' &&
    typeof link.syncDirection === 'string' &&
    typeof link.createdAt === 'string' &&
    typeof link.updatedAt === 'string'
  );
}

/**
 * Creates a standard mapping ID from template and runtime kinds
 *
 * @param templateKind - Template entity kind (e.g., 'characterInstance')
 * @param runtimeKind - Runtime entity kind (e.g., 'npc')
 * @returns Mapping ID string (e.g., 'characterInstance->npc')
 */
export function createMappingId(templateKind: string, runtimeKind: string): string {
  return `${templateKind}->${runtimeKind}`;
}

/**
 * Helper to create a cache key for template resolution
 */
export function createTemplateRefKey(templateKind: string, templateId: string): string {
  return `${templateKind}:${templateId}`;
}

/**
 * Parse a template ref key back to components
 */
export function parseTemplateRefKey(key: string): { templateKind: string; templateId: string } {
  const idx = key.indexOf(':');
  if (idx === -1) {
    throw new Error(`Invalid template ref key: "${key}". Expected "templateKind:templateId"`);
  }
  return {
    templateKind: key.slice(0, idx),
    templateId: key.slice(idx + 1),
  };
}
