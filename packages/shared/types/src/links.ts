/**
 * Generic Template↔Runtime Link Types
 *
 * Defines type-safe link contracts for connecting template entities
 * (Character, ItemTemplate, etc.) to runtime entities (NPC, Item, etc.)
 * with bidirectional sync, field-level authority, and activation conditions.
 */

// Branded ID types for type safety
export type NpcId = number & { readonly __brand: 'NpcId' };
export type ItemId = number & { readonly __brand: 'ItemId' };
export type PropId = number & { readonly __brand: 'PropId' };
export type RuntimeId = NpcId | ItemId | PropId | number;

export type CharacterInstanceId = string & { readonly __brand: 'CharacterInstanceId' };
export type ItemTemplateId = string & { readonly __brand: 'ItemTemplateId' };
export type PropTemplateId = string & { readonly __brand: 'PropTemplateId' };
export type TemplateId = CharacterInstanceId | ItemTemplateId | PropTemplateId | string;

/**
 * Sync direction for template↔runtime links
 */
export type SyncDirection = 'bidirectional' | 'template_to_runtime' | 'runtime_to_template';

/**
 * Generic template↔runtime link interface
 *
 * Links a template entity (design/definition) to a runtime entity (in-game instance)
 * with configurable sync behavior and activation conditions.
 */
export interface ObjectLink {
  /** UUID primary key */
  linkId: string;

  /** Template entity type (e.g., 'character', 'itemTemplate') */
  templateKind: 'character' | 'itemTemplate' | 'propTemplate' | (string & {});

  /** Template entity ID (usually UUID) */
  templateId: TemplateId;

  /** Runtime entity type (e.g., 'npc', 'item', 'prop') */
  runtimeKind: 'npc' | 'item' | 'prop' | (string & {});

  /** Runtime entity ID (usually integer, can be UUID for some domains) */
  runtimeId: RuntimeId;

  /** Enable/disable sync for this link */
  syncEnabled: boolean;

  /** Direction of sync (bidirectional, template→runtime, or runtime→template) */
  syncDirection: SyncDirection;

  /**
   * Mapping ID pointing to registered FieldMapping config
   * Format: "templateKind->runtimeKind" (e.g., "character->npc")
   */
  mappingId?: string;

  /**
   * Priority for conflict resolution (higher priority wins)
   * Used when multiple links target the same runtime entity
   */
  priority?: number;

  /**
   * Context-based activation conditions (e.g., location, time)
   * Uses dot-notation for nested paths (e.g., {"location.zone": "downtown"})
   */
  activationConditions?: Record<string, unknown>;

  /** Extensible metadata for domain-specific use */
  meta?: Record<string, unknown>;

  /** Timestamp when link was created */
  createdAt: string;

  /** Timestamp when link was last updated */
  updatedAt: string;

  /** Timestamp of last successful sync */
  lastSyncedAt?: string;

  /** Direction of last sync */
  lastSyncDirection?: SyncDirection;
}

/**
 * Union type for all standard link kinds
 * Using ASCII-safe delimiter (->)
 */
export type LinkKind =
  | 'character->npc'
  | 'itemTemplate->item'
  | 'propTemplate->prop'
  | (string & {});

/**
 * Parsed mapping ID components
 */
export interface ParsedMappingId {
  templateKind: string;
  runtimeKind: string;
}

/**
 * Helper to extract template/runtime kinds from mapping ID
 *
 * Mapping ID format: "templateKind->runtimeKind" (e.g., "character->npc")
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
 * @param templateKind - Template entity kind (e.g., 'character')
 * @param runtimeKind - Runtime entity kind (e.g., 'npc')
 * @returns Mapping ID string (e.g., 'character->npc')
 */
export function createMappingId(templateKind: string, runtimeKind: string): string {
  return `${templateKind}->${runtimeKind}`;
}
