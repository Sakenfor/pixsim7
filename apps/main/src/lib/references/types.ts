/**
 * Reference system types — shared across panels that support @mentions.
 *
 * Types are open-ended (string) because features register dynamically.
 * Built-in types: 'plan', 'contract', 'world', 'project'.
 */

/** Open type key — any feature can register a new one. */
export type ReferenceType = string;

export interface ReferenceItem {
  type: ReferenceType;
  id: string;
  label: string;
  detail?: string;
}

export interface ReferenceSource {
  type: ReferenceType;
  fetch: () => Promise<ReferenceItem[]>;
}
